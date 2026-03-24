package callback

import (
	"context"
	"time"

	"github.com/nexussec/nexussec/internal/domain/enum"
	"github.com/nexussec/nexussec/internal/domain/model"
	"github.com/rs/zerolog"
)

// Notifier handles post-scan state transitions:
// updating job status in PostgreSQL and storing reports in MongoDB.
type Notifier struct {
	jobRepo    model.ScanJobRepository
	reportRepo model.ReportRepository
	logger     zerolog.Logger
}

// NewNotifier creates a notifier with injected repository dependencies.
func NewNotifier(
	jobRepo model.ScanJobRepository,
	reportRepo model.ReportRepository,
	logger zerolog.Logger,
) *Notifier {
	return &Notifier{
		jobRepo:    jobRepo,
		reportRepo: reportRepo,
		logger:     logger,
	}
}

// MarkRunning transitions the scan job to RUNNING status.
func (n *Notifier) MarkRunning(ctx context.Context, jobID string) error {
	n.logger.Info().Str("job_id", jobID).Msg("job status → RUNNING")
	return n.jobRepo.UpdateStatus(ctx, jobID, enum.ScanStatusRunning)
}

// MarkCompleted stores the report in MongoDB and transitions the job to COMPLETED.
func (n *Notifier) MarkCompleted(ctx context.Context, jobID string, report *model.Report) error {
	log := n.logger.With().Str("job_id", jobID).Logger()

	// 1. Store report in MongoDB
	report.CreatedAt = time.Now()
	reportID, err := n.reportRepo.Create(ctx, report)
	if err != nil {
		log.Error().Err(err).Msg("failed to store report in MongoDB")
		return n.MarkFailed(ctx, jobID, "failed to store report: "+err.Error())
	}

	// 2. Link report ID to the scan job
	if err := n.jobRepo.SetReportID(ctx, jobID, reportID); err != nil {
		log.Error().Err(err).Msg("failed to link report ID to job")
	}

	// 3. Transition to COMPLETED
	log.Info().Str("report_id", reportID).Msg("job status → COMPLETED")
	return n.jobRepo.UpdateStatus(ctx, jobID, enum.ScanStatusCompleted)
}

// MarkFailed transitions the job to FAILED and records the error message.
func (n *Notifier) MarkFailed(ctx context.Context, jobID string, errMsg string) error {
	n.logger.Error().Str("job_id", jobID).Str("error", errMsg).Msg("job status → FAILED")

	if err := n.jobRepo.SetError(ctx, jobID, errMsg); err != nil {
		n.logger.Error().Err(err).Msg("failed to record error in DB")
		return err
	}

	return n.jobRepo.UpdateStatus(ctx, jobID, enum.ScanStatusFailed)
}

// UpdateProgress updates the job's progress percentage (0–100).
func (n *Notifier) UpdateProgress(ctx context.Context, jobID string, progress int) error {
	return n.jobRepo.UpdateProgress(ctx, jobID, progress)
}
