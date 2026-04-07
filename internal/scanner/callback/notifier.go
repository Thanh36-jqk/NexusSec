package callback

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/nexussec/nexussec/internal/domain/enum"
	"github.com/nexussec/nexussec/internal/domain/model"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

// Notifier handles post-scan state transitions:
// updating job status in PostgreSQL and storing reports in MongoDB.
type Notifier struct {
	jobRepo     model.ScanJobRepository
	reportRepo  model.ReportRepository
	redisClient *redis.Client
	logger      zerolog.Logger
}

// NewNotifier creates a notifier with injected repository dependencies.
func NewNotifier(
	jobRepo model.ScanJobRepository,
	reportRepo model.ReportRepository,
	redisClient *redis.Client,
	logger zerolog.Logger,
) *Notifier {
	return &Notifier{
		jobRepo:     jobRepo,
		reportRepo:  reportRepo,
		redisClient: redisClient,
		logger:      logger,
	}
}

// MarkRunning transitions the scan job to RUNNING status.
func (n *Notifier) MarkRunning(ctx context.Context, jobID string) error {
	n.logger.Info().Str("job_id", jobID).Msg("job status → RUNNING")
	return n.jobRepo.UpdateStatus(ctx, jobID, enum.ScanStatusRunning)
}

// MarkCompleted stores the report in MongoDB and transitions the job to COMPLETED.
//
// Before storing, it calculates the ReportSummary by counting vulnerabilities
// by severity level (Critical, High, Medium, Low, Informational).
func (n *Notifier) MarkCompleted(ctx context.Context, jobID string, report *model.Report) error {
	log := n.logger.With().Str("job_id", jobID).Logger()

	// 1. Calculate ReportSummary from vulnerabilities
	report.Summary = computeSummary(report.Vulnerabilities)
	report.CreatedAt = time.Now()

	log.Info().
		Int("total", report.Summary.Total).
		Int("critical", report.Summary.Critical).
		Int("high", report.Summary.High).
		Int("medium", report.Summary.Medium).
		Int("low", report.Summary.Low).
		Int("info", report.Summary.Info).
		Msg("report summary computed")

	// 2. Store report in MongoDB
	reportID, err := n.reportRepo.Create(ctx, report)
	if err != nil {
		log.Error().Err(err).Msg("failed to store report in MongoDB")
		return n.MarkFailed(ctx, jobID, "failed to store report: "+err.Error())
	}

	// 3. Link report ID to the scan job
	if err := n.jobRepo.SetReportID(ctx, jobID, reportID); err != nil {
		log.Error().Err(err).Msg("failed to link report ID to job")
	}

	// 4. Transition to COMPLETED
	log.Info().Str("report_id", reportID).Msg("job status → COMPLETED")
	err = n.jobRepo.UpdateStatus(ctx, jobID, enum.ScanStatusCompleted)
	
	if n.redisClient != nil && err == nil {
		channel := "scan_progress:" + jobID
		payload := `{"type":"scan_completed","progress":100,"status":"completed"}`
		n.redisClient.Publish(ctx, channel, payload)
	}

	return err
}

// MarkFailed transitions the job to FAILED and records the error message.
func (n *Notifier) MarkFailed(ctx context.Context, jobID string, errMsg string) error {
	n.logger.Error().Str("job_id", jobID).Str("error", errMsg).Msg("job status → FAILED")

	if err := n.jobRepo.SetError(ctx, jobID, errMsg); err != nil {
		n.logger.Error().Err(err).Msg("failed to record error in DB")
		return err
	}

	err := n.jobRepo.UpdateStatus(ctx, jobID, enum.ScanStatusFailed)

	if n.redisClient != nil && err == nil {
		channel := "scan_progress:" + jobID
		// Create JSON securely with properly escaped error message
		payload := fmt.Sprintf(`{"type":"scan_failed","status":"failed","error":"%s"}`, strings.ReplaceAll(errMsg, `"`, `\"`))
		n.redisClient.Publish(ctx, channel, payload)
	}

	return err
}

// UpdateProgress updates the job's progress percentage (0–100).
func (n *Notifier) UpdateProgress(ctx context.Context, jobID string, progress int) error {
	// 1. Update in PostgreSQL
	err := n.jobRepo.UpdateProgress(ctx, jobID, progress)
	if err != nil {
		return err
	}

	// 2. Publish to Redis for real-time WebSockets
	if n.redisClient != nil {
		channel := "scan_progress:" + jobID
		payload := fmt.Sprintf(`{"type":"progress_update","progress":%d,"status":"running"}`, progress)
		n.redisClient.Publish(ctx, channel, payload)
	}

	return nil
}

// computeSummary counts vulnerabilities by severity level.
// Handles case-insensitive matching for severity strings from different scan tools
// (e.g., ZAP uses "High", nmap might use "HIGH").
func computeSummary(vulns []model.Vulnerability) model.ReportSummary {
	summary := model.ReportSummary{
		Total: len(vulns),
	}

	for _, v := range vulns {
		switch strings.ToLower(v.Severity) {
		case "critical":
			summary.Critical++
		case "high":
			summary.High++
		case "medium":
			summary.Medium++
		case "low":
			summary.Low++
		case "informational", "info":
			summary.Info++
		}
	}

	return summary
}
