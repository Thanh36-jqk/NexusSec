//go:build integration
// +build integration

package worker

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/nexussec/nexussec/internal/domain/enum"
	"github.com/nexussec/nexussec/internal/domain/model"
	"github.com/nexussec/nexussec/internal/scanner/callback"
	"github.com/nexussec/nexussec/internal/scanner/executor"
	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/rs/zerolog"
)

// ── Mock Repositories ──────────────────────────────────────────

type mockScanJobRepo struct {
	status   enum.ScanStatus
	reportID string
	errMsg   string
}

func (m *mockScanJobRepo) GetByID(ctx context.Context, id string) (*model.ScanJob, error) {
	return &model.ScanJob{ID: id, Status: m.status}, nil
}
func (m *mockScanJobRepo) UpdateStatus(ctx context.Context, id string, status enum.ScanStatus) error {
	m.status = status
	return nil
}
func (m *mockScanJobRepo) UpdateProgress(ctx context.Context, id string, progress int) error {
	return nil
}
func (m *mockScanJobRepo) SetReportID(ctx context.Context, id string, reportID string) error {
	m.reportID = reportID
	return nil
}
func (m *mockScanJobRepo) SetError(ctx context.Context, id string, errMsg string) error {
	m.errMsg = errMsg
	return nil
}

type mockReportRepo struct {
	storedReport *model.Report
}

func (m *mockReportRepo) Create(ctx context.Context, report *model.Report) (string, error) {
	m.storedReport = report
	return "mock-report-id", nil
}
func (m *mockReportRepo) GetByID(ctx context.Context, id string) (*model.Report, error) {
	return m.storedReport, nil
}
func (m *mockReportRepo) GetByScanJobID(ctx context.Context, scanJobID string) (*model.Report, error) {
	return m.storedReport, nil
}

// ── Mock Acknowledger for AMQP ───────────────────────────────

type mockAcknowledger struct {
	acked  bool
	nacked bool
}

func (m *mockAcknowledger) Ack(tag uint64, multiple bool) error {
	m.acked = true
	return nil
}
func (m *mockAcknowledger) Nack(tag uint64, multiple bool, requeue bool) error {
	m.nacked = true
	return nil
}
func (m *mockAcknowledger) Reject(tag uint64, requeue bool) error {
	return nil
}

// ── Integration Test ───────────────────────────────────────────

// TestExecuteSingleScan_ZAP_Integration runs a real Docker container using ZAP
// against a dummy HTTP server. Requires Docker Daemon to be running.
func TestExecuteSingleScan_ZAP_Integration(t *testing.T) {
	logger := zerolog.New(os.Stdout).With().Timestamp().Logger()

	// 1. Setup Mock Dummy Server (Target)
	// Must bind to 0.0.0.0 or the host's IP so Docker container can reach it.
	// For testing on Docker Desktop, host.docker.internal works well.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		w.Write([]byte(`<html><body><h1>Dummy Target</h1><form action="/login"><input type="text" name="user"></form></body></html>`))
	}))
	defer srv.Close()

	// Replace 127.0.0.1 with host.docker.internal so the ZAP container can reach the host network dummy server
	targetURL := srv.URL
	parsedURL, _ := url.Parse(targetURL)
	parsedURL.Host = strings.Replace(parsedURL.Host, "127.0.0.1", "host.docker.internal", 1)
	targetURL = parsedURL.String()

	t.Logf("Dummy Target URL: %s", targetURL)

	// 2. Init Real DockerManager
	// We use "bridge" network for the container so it can reach host.docker.internal
	dockerMgr, err := executor.NewDockerManager(logger, "bridge")
	if err != nil {
		t.Fatalf("Failed to init DockerManager (Is Docker running?): %v", err)
	}
	defer dockerMgr.Close()

	// 3. Init Worker with Mock DB/MQ
	jobRepo := &mockScanJobRepo{}
	reportRepo := &mockReportRepo{}
	notifier := callback.NewNotifier(jobRepo, reportRepo, nil, logger)

	w := &Worker{
		docker:   dockerMgr,
		notifier: notifier,
		logger:   logger,
	}

	// 4. Construct ScanMessage
	jobID := "integration-test-job-zap"
	msg := ScanMessage{
		JobID:     jobID,
		TargetURL: targetURL,
		ScanType:  "zap",
		UserID:    "test-user",
	}

	ack := &mockAcknowledger{}
	delivery := amqp.Delivery{
		Acknowledger: ack,
		Body:         []byte(`{}`), // body isn't used by executeSingleScan, only by processMessage
	}

	report := &model.Report{
		ScanJobID: jobID,
		TargetURL: targetURL,
		ScanType:  "zap",
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	// 5. Execute Scan
	t.Log("Executing ZAP Scan... this may take a few minutes (pulling image + scanning)")
	w.executeSingleScan(ctx, logger, delivery, msg, report)

	// 6. Assertions
	if !ack.acked {
		t.Errorf("Expected message to be Acked, but it was not")
	}

	if jobRepo.status != enum.ScanStatusCompleted {
		t.Errorf("Expected Job Status COMPLETED, got %v (Error: %s)", jobRepo.status, jobRepo.errMsg)
	}

	if reportRepo.storedReport == nil {
		t.Fatalf("Expected Report to be stored in DB, but got nil")
	}

	if len(reportRepo.storedReport.Vulnerabilities) == 0 {
		t.Log("Warning: No vulnerabilities found. This might be normal for a dummy server, but check if scan actually ran.")
	} else {
		t.Logf("Found %d vulnerabilities", len(reportRepo.storedReport.Vulnerabilities))
	}

	t.Logf("Report Summary: %+v", reportRepo.storedReport.Summary)
}
