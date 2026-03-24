package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

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
// parse → mark RUNNING → execute Docker scan → store report → mark COMPLETED/FAILED → ack/nack.
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

	// ── Resolve scan image and args ─────────────────────────
	imageName, cmdArgs := w.resolveScanConfig(msg.ScanType, msg.TargetURL, msg.JobID)

	// ── Execute scan via Docker ─────────────────────────────
	result, err := w.docker.RunScan(ctx, msg.JobID, imageName, msg.TargetURL, cmdArgs)
	if err != nil {
		log.Error().Err(err).Msg("scan execution failed")
		w.notifier.MarkFailed(ctx, msg.JobID, fmt.Sprintf("scan execution error: %v", err))
		// Ack — the message was processed (just with a failure outcome)
		delivery.Ack(false)
		return
	}

	// ── Check exit code ─────────────────────────────────────
	// ── Check exit code ─────────────────────────────────────
	// LƯU Ý QUAN TRỌNG VỀ ZAP EXIT CODES:
	// 0: Thành công, không có lỗi bảo mật nào.
	// 1: Lỗi hệ thống (Crash, sai lệnh, không kết nối được).
	// 2: Thành công, tìm thấy lỗ hổng mức độ Cảnh báo (Warnings).
	// 3: Thành công, tìm thấy lỗ hổng mức độ Nghiêm trọng (Errors).
	// Do đó, ta chỉ đánh dấu Job FAILED khi container thực sự sập (ExitCode == 1).

	if result.ExitCode == 1 {
		outStr := strings.TrimSpace(result.Stdout)
		if len(outStr) > 1000 {
			outStr = "..." + outStr[len(outStr)-1000:]
		}
		errMsg := fmt.Sprintf("scan container crashed with code %d.\nStderr: %s\nStdout (tail): %s", result.ExitCode, strings.TrimSpace(result.Stderr), outStr)
		log.Warn().Int64("exit_code", result.ExitCode).Msg("scan container crashed")
		w.notifier.MarkFailed(ctx, msg.JobID, errMsg)
		delivery.Ack(false)
		return
	}
	// ── Build report from stdout ────────────────────────────
	report := &model.Report{
		ScanJobID: msg.JobID,
		TargetURL: msg.TargetURL,
		ScanType:  msg.ScanType,
	}

	if msg.ScanType == "zap" || msg.ScanType == "full" {

		// 1. KIỂM TRA RÁC TRƯỚC (Bộ lọc an toàn)
		outStr := strings.TrimSpace(result.Stdout)
		if !strings.HasPrefix(outStr, "{") {
			errMsg := "Scan failed: No valid JSON report found. Target might be unreachable or invalid."
			log.Error().Str("raw_output", outStr).Msg(errMsg)
			w.notifier.MarkFailed(ctx, msg.JobID, errMsg)
			delivery.Ack(false)
			return
		}

		// 2. DỮ LIỆU ĐÃ SẠCH, BẮT ĐẦU PARSE JSON
		vulns, err := parser.ParseZAPReport(strings.NewReader(result.Stdout))
		if err != nil {
			log.Error().Err(err).Msg("failed to parse ZAP report")
			w.notifier.MarkFailed(ctx, msg.JobID, fmt.Sprintf("failed to parse scanner output: %v", err))
			delivery.Ack(false) // Loại bỏ message lỗi khỏi queue
			return
		}

		report.Vulnerabilities = vulns
		log.Info().Int("vuln_count", len(vulns)).Msg("successfully parsed vulnerabilities")

	} else {
		log.Info().Str("scan_type", msg.ScanType).Msg("no specific parser implemented, skipping parsing")
	}

	if err := w.notifier.MarkCompleted(ctx, msg.JobID, report); err != nil {
		log.Error().Err(err).Msg("failed to mark job as COMPLETED")
		// Ack anyway — the scan itself succeeded, this is a DB issue
		delivery.Ack(false)
		return
	}

	log.Info().Msg("scan job completed successfully")
	delivery.Ack(false)
}

// resolveScanConfig returns the Docker image name and command arguments
// based on the scan type.
func (w *Worker) resolveScanConfig(scanType string, targetURL string, jobID string) (string, []string) {
	switch scanType {
	case "zap":
		return "ghcr.io/zaproxy/zaproxy:stable", []string{
			"zap-baseline.py",
			"-t", targetURL,
			"-J", fmt.Sprintf("report_%s.json", jobID),
		}

	case "nmap":
		return "instrumentisto/nmap:latest", []string{
			"-sV",           // Service version detection
			"--script=vuln", // Run vulnerability scripts
			"-oX", "-",      // Output XML to stdout
			targetURL,
		}

	case "full":
		// For "full" scans, we default to ZAP for now.
		// A production implementation would run both sequentially or in parallel.
		return "ghcr.io/zaproxy/zaproxy:stable", []string{
			"zap-full-scan.py",
			"-t", targetURL,
			"-J", fmt.Sprintf("report_%s.json", jobID),
		}

	default:
		// Fallback to a lightweight mock for testing
		return "alpine:latest", []string{
			"sh", "-c",
			fmt.Sprintf(`echo '{"scan_type":"mock","target":"%s","vulnerabilities":[]}'`, targetURL),
		}
	}
}
