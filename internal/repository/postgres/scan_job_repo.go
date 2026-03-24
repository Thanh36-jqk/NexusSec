package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/nexussec/nexussec/internal/domain/enum"
	"github.com/nexussec/nexussec/internal/domain/model"
)

// ScanJobRepo implements model.ScanJobRepository using PostgreSQL with raw SQL.
// No ORM — every query is explicit, optimized, and uses parameter binding
// to prevent SQL injection.
type ScanJobRepo struct {
	db *sqlx.DB
}

// NewScanJobRepo creates a new scan job repository with an injected sqlx connection.
func NewScanJobRepo(db *sqlx.DB) *ScanJobRepo {
	return &ScanJobRepo{db: db}
}

// Compile-time interface compliance check.
var _ model.ScanJobRepository = (*ScanJobRepo)(nil)

// ──────────────────────────────────────────────────────────────
//  Queries (raw SQL with parameter binding)
// ──────────────────────────────────────────────────────────────

const (
	queryGetByID = `
		SELECT
			sj.id, sj.user_id, sj.target_id,
			t.base_url  AS target_url,
			sj.scan_type, sj.status, sj.progress,
			sj.report_id, sj.error_message,
			sj.started_at, sj.completed_at,
			sj.created_at, sj.updated_at
		FROM scan_jobs sj
		JOIN targets t ON t.id = sj.target_id
		WHERE sj.id = $1
	`

	queryUpdateStatus = `
		UPDATE scan_jobs
		SET status = $1, updated_at = NOW()
		WHERE id = $2
	`

	queryUpdateStatusRunning = `
		UPDATE scan_jobs
		SET status = 'running', started_at = NOW(), updated_at = NOW()
		WHERE id = $1
	`

	queryUpdateStatusTerminal = `
		UPDATE scan_jobs
		SET status = $1, completed_at = NOW(), updated_at = NOW()
		WHERE id = $2
	`

	queryUpdateProgress = `
		UPDATE scan_jobs
		SET progress = $1, updated_at = NOW()
		WHERE id = $2
	`

	querySetReportID = `
		UPDATE scan_jobs
		SET report_id = $1, updated_at = NOW()
		WHERE id = $2
	`

	querySetError = `
		UPDATE scan_jobs
		SET status = 'failed', error_message = $1, completed_at = NOW(), updated_at = NOW()
		WHERE id = $2
	`

	queryCreate = `
		INSERT INTO scan_jobs (user_id, target_id, scan_type, status, progress)
		VALUES ($1, $2, $3, 'pending', 0)
		RETURNING id, created_at, updated_at
	`

	queryListByUser = `
		SELECT
			sj.id, sj.user_id, sj.target_id,
			t.base_url  AS target_url,
			sj.scan_type, sj.status, sj.progress,
			sj.report_id, sj.error_message,
			sj.started_at, sj.completed_at,
			sj.created_at, sj.updated_at
		FROM scan_jobs sj
		JOIN targets t ON t.id = sj.target_id
		WHERE sj.user_id = $1
		ORDER BY sj.created_at DESC
		LIMIT $2 OFFSET $3
	`
)

// ──────────────────────────────────────────────────────────────
//  Interface Implementation
// ──────────────────────────────────────────────────────────────

// scanJobRow is the database row structure for sqlx scanning.
// Uses sql.NullString and sql.NullTime for nullable columns.
type scanJobRow struct {
	ID           string         `db:"id"`
	UserID       string         `db:"user_id"`
	TargetID     string         `db:"target_id"`
	TargetURL    string         `db:"target_url"`
	ScanType     string         `db:"scan_type"`
	Status       string         `db:"status"`
	Progress     int            `db:"progress"`
	ReportID     sql.NullString `db:"report_id"`
	ErrorMessage sql.NullString `db:"error_message"`
	StartedAt    sql.NullTime   `db:"started_at"`
	CompletedAt  sql.NullTime   `db:"completed_at"`
	CreatedAt    time.Time      `db:"created_at"`
	UpdatedAt    time.Time      `db:"updated_at"`
}

// toModel converts the database row to the domain model.
func (r *scanJobRow) toModel() *model.ScanJob {
	job := &model.ScanJob{
		ID:        r.ID,
		UserID:    r.UserID,
		TargetID:  r.TargetID,
		TargetURL: r.TargetURL,
		ScanType:  enum.ScanType(r.ScanType),
		Status:    enum.ScanStatus(r.Status),
		Progress:  r.Progress,
		CreatedAt: r.CreatedAt,
		UpdatedAt: r.UpdatedAt,
	}

	if r.ReportID.Valid {
		job.ReportID = r.ReportID.String
	}
	if r.ErrorMessage.Valid {
		job.ErrorMessage = r.ErrorMessage.String
	}
	if r.StartedAt.Valid {
		job.StartedAt = &r.StartedAt.Time
	}
	if r.CompletedAt.Valid {
		job.CompletedAt = &r.CompletedAt.Time
	}

	return job
}

// GetByID fetches a single scan job by its UUID.
// JOINs with targets to include the target URL.
func (repo *ScanJobRepo) GetByID(ctx context.Context, id string) (*model.ScanJob, error) {
	var row scanJobRow

	err := repo.db.GetContext(ctx, &row, queryGetByID, id)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("scan job %s not found", id)
		}
		return nil, fmt.Errorf("postgres: GetByID failed: %w", err)
	}

	return row.toModel(), nil
}

// UpdateStatus transitions the job to a new status with proper timestamp handling.
//   - RUNNING:                sets started_at = NOW()
//   - COMPLETED / FAILED:    sets completed_at = NOW()
//   - Other statuses:        only updates status + updated_at
func (repo *ScanJobRepo) UpdateStatus(ctx context.Context, id string, status enum.ScanStatus) error {
	var query string
	var args []any

	switch status {
	case enum.ScanStatusRunning:
		query = queryUpdateStatusRunning
		args = []any{id}

	case enum.ScanStatusCompleted, enum.ScanStatusFailed, enum.ScanStatusCancelled:
		query = queryUpdateStatusTerminal
		args = []any{string(status), id}

	default:
		query = queryUpdateStatus
		args = []any{string(status), id}
	}

	result, err := repo.db.ExecContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("postgres: UpdateStatus failed: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("scan job %s not found", id)
	}

	return nil
}

// UpdateProgress sets the completion percentage (0–100).
// The database CHECK constraint enforces the range.
func (repo *ScanJobRepo) UpdateProgress(ctx context.Context, id string, progress int) error {
	result, err := repo.db.ExecContext(ctx, queryUpdateProgress, progress, id)
	if err != nil {
		return fmt.Errorf("postgres: UpdateProgress failed: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("scan job %s not found", id)
	}

	return nil
}

// SetReportID links the MongoDB report ID to this job after scan completion.
func (repo *ScanJobRepo) SetReportID(ctx context.Context, id string, reportID string) error {
	result, err := repo.db.ExecContext(ctx, querySetReportID, reportID, id)
	if err != nil {
		return fmt.Errorf("postgres: SetReportID failed: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("scan job %s not found", id)
	}

	return nil
}

// SetError records the failure reason and transitions to FAILED atomically.
// Uses a single UPDATE to avoid race conditions between setting error and status.
func (repo *ScanJobRepo) SetError(ctx context.Context, id string, errMsg string) error {
	result, err := repo.db.ExecContext(ctx, querySetError, errMsg, id)
	if err != nil {
		return fmt.Errorf("postgres: SetError failed: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("scan job %s not found", id)
	}

	return nil
}

// ──────────────────────────────────────────────────────────────
//  Extended Methods (not in interface, used by handlers)
// ──────────────────────────────────────────────────────────────

// Create inserts a new scan job and returns the populated model with generated fields.
func (repo *ScanJobRepo) Create(ctx context.Context, userID, targetID string, scanType enum.ScanType) (*model.ScanJob, error) {
	var job model.ScanJob
	job.UserID = userID
	job.TargetID = targetID
	job.ScanType = scanType
	job.Status = enum.ScanStatusPending
	job.Progress = 0

	err := repo.db.QueryRowContext(ctx, queryCreate, userID, targetID, string(scanType)).
		Scan(&job.ID, &job.CreatedAt, &job.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("postgres: Create failed: %w", err)
	}

	return &job, nil
}

// ListByUser returns paginated scan jobs for a specific user, ordered by newest first.
func (repo *ScanJobRepo) ListByUser(ctx context.Context, userID string, limit, offset int) ([]*model.ScanJob, error) {
	var rows []scanJobRow

	err := repo.db.SelectContext(ctx, &rows, queryListByUser, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("postgres: ListByUser failed: %w", err)
	}

	jobs := make([]*model.ScanJob, len(rows))
	for i, row := range rows {
		jobs[i] = row.toModel()
	}

	return jobs, nil
}
