package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/nexussec/nexussec/internal/domain/model"
	"github.com/nexussec/nexussec/internal/infrastructure/broker"
	"github.com/nexussec/nexussec/internal/scanner/callback"
	"github.com/nexussec/nexussec/internal/scanner/executor"
	"github.com/nexussec/nexussec/internal/scanner/parser"
	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/rs/zerolog"
)

const (
	// QueueName is the RabbitMQ queue that scan jobs are published to.
	QueueName = "scan_jobs_queue"
)

// ScanMessage is the JSON payload published to RabbitMQ by the API Gateway.
// This is the contract between the Gateway (publisher) and Scanner (consumer).
type ScanMessage struct {
	JobID     string `json:"job_id"`
	TargetURL string `json:"target_url"`
	ScanType  string `json:"scan_type"` // zap | nmap | full
	UserID    string `json:"user_id"`
}

// Worker is the Scanner Engine's RabbitMQ consumer with a goroutine-based worker pool.
// It consumes messages from scan_jobs_queue and processes them concurrently.
//
// Architecture:
//
//	RabbitMQ → Consumer (delivery channel) → Worker Pool (N goroutines) → DockerManager
//
// The pool size is controlled by SCANNER_CONCURRENCY. Each goroutine processes one
// scan at a time: receives message → runs Docker container → stores report → ack/nack.
type Worker struct {
	conn        *broker.Connection
	docker      *executor.DockerManager
	notifier    *callback.Notifier
	logger      zerolog.Logger
	concurrency int
}

// Config holds the configuration for the worker pool.
type Config struct {
	Concurrency int    // Number of concurrent scan workers (goroutines)
	QueueName   string // RabbitMQ queue name (default: scan_jobs_queue)
}

// New creates a new scanner worker with injected dependencies.
func New(
	conn *broker.Connection,
	docker *executor.DockerManager,
	notifier *callback.Notifier,
	logger zerolog.Logger,
	cfg Config,
) *Worker {
	if cfg.Concurrency <= 0 {
		cfg.Concurrency = 3
	}
	if cfg.QueueName == "" {
		cfg.QueueName = QueueName
	}

	return &Worker{
		conn:        conn,
		docker:      docker,
		notifier:    notifier,
		logger:      logger,
		concurrency: cfg.Concurrency,
	}
}

// Start begins consuming messages and distributes work across the goroutine pool.
// It blocks until the context is cancelled (e.g., on SIGTERM).
//
// Flow:
//  1. Declare the queue (idempotent)
//  2. Set prefetch = concurrency (prevents message flooding)
//  3. Start consuming (delivery channel)
//  4. Launch N goroutines that pull from the delivery channel
//  5. Block until context cancellation
func (w *Worker) Start(ctx context.Context) error {
	log := w.logger.With().Str("component", "worker").Logger()

	// 1. Declare queue with Dead-Letter Queue topology
	_, err := w.conn.DeclareQueueWithDLQ(QueueName)
	if err != nil {
		return fmt.Errorf("worker: failed to declare queue: %w", err)
	}

	// 2. Set prefetch count = concurrency
	// This ensures each worker goroutine gets at most 1 unacked message
	if err := w.conn.SetPrefetch(w.concurrency); err != nil {
		return fmt.Errorf("worker: failed to set prefetch: %w", err)
	}

	// 3. Start consuming
	deliveries, err := w.conn.Channel().Consume(
		QueueName,        // queue
		"scanner-worker", // consumer tag
		false,            // auto-ack: FALSE — we manually ack/nack after processing
		false,            // exclusive
		false,            // no-local
		false,            // no-wait
		nil,              // args
	)
	if err != nil {
		return fmt.Errorf("worker: failed to register consumer: %w", err)
	}

	log.Info().
		Int("concurrency", w.concurrency).
		Str("queue", QueueName).
		Msg("scanner worker pool started")

	// 4. Launch worker goroutines
	var wg sync.WaitGroup
	for i := 0; i < w.concurrency; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			w.runWorker(ctx, workerID, deliveries)
		}(i)
	}

	// 5. Block until context is cancelled
	<-ctx.Done()
	log.Info().Msg("context cancelled, waiting for in-flight scans to complete...")

	// Wait for all goroutines to finish their current work
	wg.Wait()

	log.Info().Msg("all workers stopped")
	return nil
}

// runWorker is the main loop for a single worker goroutine.
// It reads from the shared delivery channel and processes one message at a time.
func (w *Worker) runWorker(ctx context.Context, workerID int, deliveries <-chan amqp.Delivery) {
	log := w.logger.With().Int("worker_id", workerID).Logger()
	log.Info().Msg("worker goroutine started")

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("worker goroutine shutting down")
			return

		case delivery, ok := <-deliveries:
			if !ok {
				log.Warn().Msg("delivery channel closed")
				return
			}

			w.processMessage(ctx, log, delivery)
		}
	}
}

// processMessage handles a single scan job message:
// parse → mark RUNNING → execute Docker scan → parse output via Strategy Pattern → mark COMPLETED/FAILED → ack.
//
// The parsing step uses parser.GetParser(scanType) — NO if-else chains.
// New scan tools only need to implement VulnerabilityParser and register in the parser registry.
func (w *Worker) processMessage(ctx context.Context, log zerolog.Logger, delivery amqp.Delivery) {
	// ── Parse message ───────────────────────────────────────
	var msg ScanMessage
	if err := json.Unmarshal(delivery.Body, &msg); err != nil {
		log.Error().Err(err).Str("body", string(delivery.Body)).Msg("failed to parse message, nacking")
		// Nack WITHOUT requeue — malformed messages should go to dead-letter
		delivery.Nack(false, false)
		return
	}

	log = log.With().
		Str("job_id", msg.JobID).
		Str("target", msg.TargetURL).
		Str("scan_type", msg.ScanType).
		Logger()

	log.Info().Msg("processing scan job")

	// ── Mark RUNNING ────────────────────────────────────────
	if err := w.notifier.MarkRunning(ctx, msg.JobID); err != nil {
		log.Error().Err(err).Msg("failed to mark job as RUNNING")
		// Nack WITH requeue — transient DB error, retry later
		delivery.Nack(false, true)
		return
	}

	// ── Execute Scan ─────────────────────────────────────────
	report := &model.Report{
		ScanJobID: msg.JobID,
		TargetURL: msg.TargetURL,
		ScanType:  msg.ScanType,
	}

	if msg.ScanType == "full" {
		w.executeFullScanConcurrent(ctx, log, delivery, msg, report)
	} else {
		w.executeSingleScan(ctx, log, delivery, msg, report)
	}
}

// executeSingleScan xử lý các scan đơn lẻ (zap, nmap).
func (w *Worker) executeSingleScan(ctx context.Context, log zerolog.Logger, delivery amqp.Delivery, msg ScanMessage, report *model.Report) {
	imageName, cmdArgs := w.resolveScanConfig(msg.ScanType, msg.TargetURL, msg.JobID)

	result, err := w.docker.RunScan(ctx, msg.JobID, imageName, msg.TargetURL, cmdArgs)
	if err != nil {
		log.Error().Err(err).Msg("scan execution failed")
		w.notifier.MarkFailed(ctx, msg.JobID, fmt.Sprintf("scan execution error: %v", err))
		delivery.Ack(false)
		return
	}

	// ── ZAP EXIT CODE SEMANTICS ─────────────────────────────────────────
	// ZAP (zap-full-scan.py) có exit code đặc biệt:
	//   0 = OK, không có cảnh báo nào
	//   2 = Có cảnh báo (warnings) → BÌNH THƯỜNG khi tìm thấy lỗ
	//   3 = Có lỗi fail + có cảnh báo → Vẫn có thể có kết quả
	//   1 = Internal ZAP error (lỗi thực sự → bỏ)
	//
	// Nmap luôn exit 0 khi thành công, khác 0 khi lỗi.
	// Do đó: chỉ treat exit code 1 là crash thực sự.
	if result.ExitCode == 1 {
		outStr := strings.TrimSpace(result.Stdout)
		if len(outStr) > 1000 {
			outStr = "..." + outStr[len(outStr)-1000:]
		}
		errMsg := fmt.Sprintf("scan container crashed with code %d.\nStderr: %s\nStdout (tail): %s",
			result.ExitCode, strings.TrimSpace(result.Stderr), outStr)
		log.Warn().Int64("exit_code", result.ExitCode).Msg("scan container crashed")
		w.notifier.MarkFailed(ctx, msg.JobID, errMsg)
		delivery.Ack(false)
		return
	}

	// Log exit code != 0 (ngoài 1) để dễ debug
	if result.ExitCode != 0 {
		log.Info().
			Int64("exit_code", result.ExitCode).
			Str("scan_type", msg.ScanType).
			Msg("scan container exited with non-zero code (expected for ZAP with findings)")
	}

	p, err := parser.GetParser(msg.ScanType)
	if err != nil {
		log.Warn().Err(err).Msg("no parser available, storing empty report")
	} else {
		outStr := strings.TrimSpace(result.Stdout)
		if outStr == "" {
			errMsg := "scan produced empty output — target may be unreachable"
			log.Error().Msg(errMsg)
			w.notifier.MarkFailed(ctx, msg.JobID, errMsg)
			delivery.Ack(false)
			return
		}

		vulns, err := p.Parse(strings.NewReader(outStr))
		if err != nil {
			log.Error().Err(err).Msg("failed to parse scan output")
			w.notifier.MarkFailed(ctx, msg.JobID, fmt.Sprintf("failed to parse scanner output: %v", err))
			delivery.Ack(false)
			return
		}

		report.Vulnerabilities = vulns
		log.Info().Int("vuln_count", len(vulns)).Msg("successfully parsed vulnerabilities")
	}

	if err := w.notifier.MarkCompleted(ctx, msg.JobID, report); err != nil {
		log.Error().Err(err).Msg("failed to mark job as COMPLETED")
		delivery.Ack(false)
		return
	}

	log.Info().Msg("single scan job completed successfully")
	delivery.Ack(false)
}

// executeFullScanConcurrent điều phối chạy ZAP và Nmap song song, thu thập và gộp kết quả.
//
// ANTI-ZOMBIE: Toàn bộ full scan bị giới hạn trong 30 phút.
// Nếu target dùng chiến thuật Tar Pit (giữ kết nối treo), context sẽ tự cancel,
// docker.RunScan sẽ kill container, goroutine thoát, WaitGroup giải phóng.
// Worker không bao giờ bị giam — RabbitMQ luôn nhận được Ack/Nack.
func (w *Worker) executeFullScanConcurrent(ctx context.Context, log zerolog.Logger, delivery amqp.Delivery, msg ScanMessage, report *model.Report) {
	// ── ANTI-ZOMBIE: Hard timeout cho toàn bộ full scan ──────
	// DockerManager đã có 15 phút timeout cho MỖI container.
	// Cái này là tầng bảo vệ cao nhất: dù Docker timeout fail, 30 phút sau
	// context sẽ bị cancel, mọi goroutine buộc phải thoát.
	scanCtx, scanCancel := context.WithTimeout(ctx, 30*time.Minute)
	defer scanCancel()

	var wg sync.WaitGroup
	wg.Add(2)

	var zapVulns, nmapVulns []model.Vulnerability
	var zapErr, nmapErr error

	// 1. Luồng ZAP
	go func() {
		defer wg.Done()
		zapLog := log.With().Str("sub_scan", "zap").Logger()
		image, args := w.resolveScanConfig("zap", msg.TargetURL, msg.JobID)
		
		res, err := w.docker.RunScan(scanCtx, msg.JobID+"_zap", image, msg.TargetURL, args)
		if err != nil {
			zapErr = fmt.Errorf("execution error: %w", err)
			return
		}
		// Exit code 1 = ZAP internal error. Exit code 2/3 = có alerts (bình thường).
		if res.ExitCode == 1 {
			zapErr = fmt.Errorf("ZAP container crashed (exit code 1)")
			stderrSnip := res.Stderr
			if len(stderrSnip) > 500 {
				stderrSnip = stderrSnip[:500]
			}
			zapLog.Error().Int64("exit_code", res.ExitCode).Str("stderr", stderrSnip).Msg("ZAP internal error")
			return
		}
		if res.ExitCode != 0 {
			zapLog.Info().Int64("exit_code", res.ExitCode).Msg("ZAP finished with alerts (exit code indicates findings)")
		}

		p, _ := parser.GetParser("zap")
		if out:= strings.TrimSpace(res.Stdout); out != "" {
			vulns, err := p.Parse(strings.NewReader(out))
			if err != nil {
				zapErr = fmt.Errorf("parse error: %w", err)
			} else {
				zapVulns = vulns
				zapLog.Info().Int("vuln_count", len(vulns)).Msg("zap sub-scan finished")
			}
		}
	}()

	// 2. Luồng Nmap
	go func() {
		defer wg.Done()
		nmapLog := log.With().Str("sub_scan", "nmap").Logger()
		image, args := w.resolveScanConfig("nmap", msg.TargetURL, msg.JobID)
		
		res, err := w.docker.RunScan(scanCtx, msg.JobID+"_nmap", image, msg.TargetURL, args)
		if err != nil {
			nmapErr = fmt.Errorf("execution error: %w", err)
			return
		}
		if res.ExitCode == 1 {
			nmapErr = fmt.Errorf("container crashed")
			return
		}

		p, _ := parser.GetParser("nmap")
		if out:= strings.TrimSpace(res.Stdout); out != "" {
			vulns, err := p.Parse(strings.NewReader(out))
			if err != nil {
				nmapErr = fmt.Errorf("parse error: %w", err)
			} else {
				nmapVulns = vulns
				nmapLog.Info().Int("vuln_count", len(vulns)).Msg("nmap sub-scan finished")
			}
		}
	}()

	// Đợi cả 2 hoàn tất
	wg.Wait()

	// Đánh giá kết quả cuối cùng
	if zapErr != nil && nmapErr != nil {
		errMsg := fmt.Sprintf("Full scan completely failed. ZAP: %v | Nmap: %v", zapErr, nmapErr)
		log.Error().Msg(errMsg)
		w.notifier.MarkFailed(ctx, msg.JobID, errMsg)
		delivery.Ack(false)
		return
	}

	if zapErr != nil {
		log.Warn().Err(zapErr).Msg("ZAP scan failed, relying on Nmap results only")
	}
	if nmapErr != nil {
		log.Warn().Err(nmapErr).Msg("Nmap scan failed, relying on ZAP results only")
	}

	// 3. Khử trùng lặp và Merge
	report.Vulnerabilities = parser.MergeAndDeduplicate(zapVulns, nmapVulns)

	if err := w.notifier.MarkCompleted(ctx, msg.JobID, report); err != nil {
		log.Error().Err(err).Msg("failed to mark job as COMPLETED")
		delivery.Ack(false)
		return
	}

	log.Info().
		Int("zap_vulns", len(zapVulns)).
		Int("nmap_vulns", len(nmapVulns)).
		Int("merged_vulns", len(report.Vulnerabilities)).
		Msg("full scan concurrent job completed successfully")
	delivery.Ack(false)
}

// resolveScanConfig returns the Docker image name and command arguments
// based on the scan type.
func (w *Worker) resolveScanConfig(scanType string, targetURL string, jobID string) (string, []string) {
	switch scanType {
	case "zap":
		// ── ZAP ACTIVE SCAN ──────────────────────────────────────────────────
		// zap-full-scan.py = Spider + Active Scan (phát hiện SQLi, XSS, etc.)
		// zap-baseline.py  = Passive Scan only           → KHÔNG dùng vì bỏ lỡ lỗi active
		//
		// Flags:
		//   -t  : target URL
		//   -J  : JSON report file (ghi vào /zap/wrk/<filename>)
		//   -m  : Spider max duration (phút). 3 phút để đủ thu thập URL.
		//   -T  : Active Scan timeout (phút). 10 phút hard-cap.
		//   -z  : ZAP daemon config overrides.
		return "ghcr.io/zaproxy/zaproxy:stable", []string{
			"zap-full-scan.py",
			"-t", targetURL,
			"-J", fmt.Sprintf("report_%s.json", jobID),
			// ── RATELIMIT ZAP: Spider 3 phút, Active Scan 10 phút, 2 thread/host ──
			"-m", "3",
			"-T", "10",
			"-z", "-config scanner.threadPerHost=2",
		}

	case "nmap":
		// ── NMAP SERVICE SCAN ─────────────────────────────────────────────────
		// Flags:
		//   -T3          : Polite timing (không gây DoS)
		//   --max-rate   : Tối đa 100 packets/sec
		//   -sV          : Service/version detection
		//   --script=vuln: Chạy NSE vuln scripts (phát hiện CVE)
		//   -oX -        : Output XML ra stdout (được capture bởi DockerManager)
		return "instrumentisto/nmap:latest", []string{
			"-T3",               // ── RATELIMIT NMAP: Polite/Normal speed
			"--max-rate", "100", // ── RATELIMIT NMAP: Max 100 packets/sec
			"-sV",               // Service version detection
			"--script=vuln",     // Run vulnerability scripts
			"-oX", "-",          // Output XML to stdout
			targetURL,
		}

	case "full":
		// 'full' execution logic is now handled via executeFullScanConcurrent.
		// This case should NOT be reached under normal operation.
		// Fallback sử dụng ZAP full-scan config.
		return "ghcr.io/zaproxy/zaproxy:stable", []string{
			"zap-full-scan.py",
			"-t", targetURL,
			"-J", fmt.Sprintf("report_%s.json", jobID),
			"-m", "3",
			"-T", "10",
			"-z", "-config scanner.threadPerHost=2",
		}

	default:
		// Fallback to a lightweight mock for testing
		return "alpine:latest", []string{
			"sh", "-c",
			fmt.Sprintf(`echo '{"scan_type":"mock","target":"%s","vulnerabilities":[]}'`, targetURL),
		}
	}
}
