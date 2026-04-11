package executor

import (
	"archive/tar"
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
	"github.com/rs/zerolog"
)

const (
	// DefaultScanTimeout is the maximum allowed runtime for a scan container.
	// If exceeded, the container is killed and the job is marked FAILED.
	//
	// 45 phút: ZAP full-scan = pull image (~2') + spider (~3') + active scan (~10') + margin 30'
	DefaultScanTimeout = 45 * time.Minute

	// containerStopTimeout is the grace period before Docker forcefully kills the container.
	containerStopTimeout = 10 // seconds
)

// ScanResult holds the output captured from a completed scan container.
type ScanResult struct {
	Stdout   string // Raw stdout (scan tool's JSON report)
	Stderr   string // Raw stderr (diagnostic/error output)
	ExitCode int64  // Container exit code (0 = success)
}

// DockerManager orchestrates ephemeral Docker containers for scan execution.
// It handles the full lifecycle: pull image → create → start → wait → capture logs → remove.
//
// SECURITY: Scan containers are attached to an ISOLATED network (scan-network)
// that has outbound internet access ONLY. They MUST NOT join nexussec-network
// where databases live — this prevents SSRF attacks against internal services.
//
// Dependencies are injected — no global Docker client.
type DockerManager struct {
	client      *client.Client
	logger      zerolog.Logger
	scanNetwork string // Isolated network for scan containers (outbound-only)
}

// NewDockerManager creates a Docker manager using the host's Docker daemon.
//
// Parameters:
//   - scanNetwork: isolated Docker network for scan containers (e.g., "scan-network")
//     This network MUST NOT have access to internal services (postgres, redis, etc.).
func NewDockerManager(logger zerolog.Logger, scanNetwork string) (*DockerManager, error) {
	if scanNetwork == "" {
		return nil, fmt.Errorf("docker: scanNetwork is required (use isolated scan-network, NOT nexussec-network)")
	}

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("docker: failed to create client: %w", err)
	}

	// Verify Docker daemon is reachable
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err = cli.Ping(ctx)
	if err != nil {
		return nil, fmt.Errorf("docker: daemon unreachable: %w", err)
	}

	logger.Info().
		Str("scan_network", scanNetwork).
		Msg("connected to Docker daemon (scan containers isolated from internal network)")

	return &DockerManager{
		client:      cli,
		logger:      logger,
		scanNetwork: scanNetwork,
	}, nil
}

// RunScan creates an ephemeral container, runs the scan tool, captures output,
// and cleans up the container regardless of success or failure.
//
// The flow:
//  1. Pull the scan image (if not cached locally)
//  2. Create container with TargetURL injected as env var
//  3. Start the container
//  4. Wait for completion OR timeout (15 min max)
//  5. Capture stdout/stderr
//  6. Forcefully remove the container (cleanup)
//
// Parameters:
//   - ctx:       parent context (cancelled on worker shutdown)
//   - jobID:     unique scan job ID (used for container naming + logging)
//   - imageName: Docker image to run (e.g., "ghcr.io/zaproxy/zaproxy:stable")
//   - targetURL: the URL to scan (injected as TARGET_URL env var)
//   - cmdArgs:   optional command arguments passed to the container entrypoint
func (dm *DockerManager) RunScan(
	ctx context.Context,
	jobID string,
	imageName string,
	targetURL string,
	cmdArgs []string,
) (*ScanResult, error) {
	containerName := fmt.Sprintf("nexussec-scan-%s", jobID)

	log := dm.logger.With().
		Str("job_id", jobID).
		Str("container", containerName).
		Str("image", imageName).
		Str("target", targetURL).
		Logger()

	// ── 1. Pull image (skip if already cached) ──────────────
	log.Info().Msg("pulling scan image")
	if err := dm.pullImage(ctx, imageName); err != nil {
		return nil, fmt.Errorf("docker: failed to pull image %s: %w", imageName, err)
	}

	// ── 2. Create container ─────────────────────────────────
	log.Info().Msg("creating scan container")

	containerConfig := &container.Config{
		Image: imageName,
		User:  "root", // BẮT BUỘC: Để ZAP có quyền ghi file
		Env: []string{
			fmt.Sprintf("TARGET_URL=%s", targetURL),
			fmt.Sprintf("SCAN_JOB_ID=%s", jobID),
			"ZAP_JAVA_OPTS=-Xmx512m", // CẮP QUYỀN: Ép Java chỉ dùng tối đa 512MB RAM
		},
		Cmd: cmdArgs,
		Volumes: map[string]struct{}{
			"/zap/wrk": {}, // BẮT BUỘC: Để vượt qua hàm check mount của ZAP
		},
	}

	hostConfig := &container.HostConfig{
		// Map the container to the chosen network (e.g., "bridge") outright
		NetworkMode: container.NetworkMode(dm.scanNetwork),
		// Security: prevent container from gaining additional privileges
		SecurityOpt: []string{"no-new-privileges"},
		// Resource limits to prevent a single scan from exhausting the host
		Resources: container.Resources{
			Memory:   1024 * 1024 * 1024, // 1 GB Docker container limit
			NanoCPUs: 1_000_000_000,     // 1 CPU core
		},
		// Auto-remove is NOT used — we need to capture logs before removal
		AutoRemove: false,
	}

	resp, err := dm.client.ContainerCreate(ctx, containerConfig, hostConfig, nil, nil, containerName)
	if err != nil {
		return nil, fmt.Errorf("docker: failed to create container: %w", err)
	}
	containerID := resp.ID

	// CRITICAL: Always remove the container, even if start/wait fails.
	// This prevents container accumulation on errors.
	defer dm.forceRemove(containerID, log)

	// Note: We're using the default "bridge" network which provides outbound internet access.
	// If you want outbound-isolation, you would connect to a custom network.
	// We no longer manually call NetworkConnect because HostConfig.NetworkMode handles it.

	// ── 3. Start container ──────────────────────────────────
	log.Info().Msg("starting scan container")
	if err := dm.client.ContainerStart(ctx, containerID, container.StartOptions{}); err != nil {
		return nil, fmt.Errorf("docker: failed to start container: %w", err)
	}

	// ── 4. Wait for completion with timeout ─────────────────
	scanCtx, scanCancel := context.WithTimeout(ctx, DefaultScanTimeout)
	defer scanCancel()

	log.Info().Dur("timeout", DefaultScanTimeout).Msg("waiting for scan to complete")

	statusCh, errCh := dm.client.ContainerWait(scanCtx, containerID, container.WaitConditionNotRunning)

	var exitCode int64

	select {
	case err := <-errCh:
		if err != nil {
			// Timeout or context cancelled — kill the container
			log.Error().Err(err).Msg("scan container wait error, killing container")
			dm.killContainer(containerID, log)
			return nil, fmt.Errorf("docker: container wait failed (possible timeout): %w", err)
		}

	case status := <-statusCh:
		exitCode = status.StatusCode
		if status.Error != nil {
			log.Warn().Str("error", status.Error.Message).Int64("exit_code", exitCode).Msg("container exited with error")
		} else {
			log.Info().Int64("exit_code", exitCode).Msg("scan container finished")
		}
	}

	// ── 5. Capture stdout/stderr ────────────────────────────
	stdout, stderr, err := dm.captureLogs(ctx, containerID)
	if err != nil {
		log.Error().Err(err).Msg("failed to capture container logs")
		return nil, fmt.Errorf("docker: failed to capture logs: %w", err)
	}

	// ── 6. Read report file from container (ZAP/full) ───────
	// Instead of brittle host volume mounts, we extract the report file
	// directly from the stopped container's filesystem via Docker API.
	// ZAP writes its JSON report to /zap/wrk/report_<jobID>.json inside the container.
	reportContent := dm.extractReportFromContainer(ctx, containerID, fmt.Sprintf("/zap/wrk/report_%s.json", jobID), log)
	if reportContent != "" {
		stdout = reportContent
	}

	return &ScanResult{
		Stdout:   stdout,
		Stderr:   stderr,
		ExitCode: exitCode,
	}, nil
}

// pullImage pulls a Docker image. Skips if already present locally.
func (dm *DockerManager) pullImage(ctx context.Context, imageName string) error {
	reader, err := dm.client.ImagePull(ctx, imageName, image.PullOptions{})
	if err != nil {
		return err
	}
	defer reader.Close()

	// Drain the reader to complete the pull (output is discarded)
	_, err = io.Copy(io.Discard, reader)
	return err
}

// captureLogs reads stdout and stderr from a stopped container.
func (dm *DockerManager) captureLogs(ctx context.Context, containerID string) (string, string, error) {
	logReader, err := dm.client.ContainerLogs(ctx, containerID, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
	})
	if err != nil {
		return "", "", err
	}
	defer logReader.Close()

	var stdoutBuf, stderrBuf bytes.Buffer
	// stdcopy.StdCopy demuxes the multiplexed Docker log stream into separate stdout/stderr
	_, err = stdcopy.StdCopy(&stdoutBuf, &stderrBuf, logReader)
	if err != nil {
		return "", "", err
	}

	return stdoutBuf.String(), stderrBuf.String(), nil
}

// killContainer sends SIGKILL to a running container (used on timeout).
func (dm *DockerManager) killContainer(containerID string, log zerolog.Logger) {
	log.Warn().Msg("killing timed-out scan container")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	timeout := containerStopTimeout
	if err := dm.client.ContainerStop(ctx, containerID, container.StopOptions{Timeout: &timeout}); err != nil {
		log.Error().Err(err).Msg("failed to stop container, attempting force kill")
		dm.client.ContainerKill(ctx, containerID, "SIGKILL")
	}
}

// forceRemove forcefully removes a container and its anonymous volumes.
// Called via defer to guarantee cleanup regardless of outcome.
func (dm *DockerManager) forceRemove(containerID string, log zerolog.Logger) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	log.Info().Msg("removing scan container")

	err := dm.client.ContainerRemove(ctx, containerID, container.RemoveOptions{
		Force:         true, // Kill if still running
		RemoveVolumes: true, // Clean up anonymous volumes
	})
	if err != nil {
		log.Error().Err(err).Msg("failed to remove scan container")
	}
}

// extractReportFromContainer attempts to extract a specific file from a stopped container.
// It returns the file content as a string, or an empty string if not found.
func (dm *DockerManager) extractReportFromContainer(ctx context.Context, containerID, filePath string, log zerolog.Logger) string {
	// CopyFromContainer returns a tar archive stream containing the requested file
	reader, _, err := dm.client.CopyFromContainer(ctx, containerID, filePath)
	if err != nil {
		// If file doesn't exist, it returns an error like "Could not find the file..."
		log.Warn().Str("file", filePath).Msg("no report file found in container (expected for non-ZAP scans)")
		return ""
	}
	defer reader.Close()

	// Extract the file from the tar archive
	tr := tar.NewReader(reader)
	_, err = tr.Next() // We only requested one file, so just read the first header
	if err != nil {
		log.Error().Err(err).Msg("failed to read tar header from container copy")
		return ""
	}

	buf := new(bytes.Buffer)
	if _, err := io.Copy(buf, tr); err != nil {
		log.Error().Err(err).Msg("failed to copy file content from tar")
		return ""
	}

	log.Info().
		Str("file", filePath).
		Int("size_bytes", buf.Len()).
		Msg("successfully extracted report file from container")

	return strings.TrimSpace(buf.String())
}

// Close shuts down the Docker client.
func (dm *DockerManager) Close() error {
	return dm.client.Close()
}
