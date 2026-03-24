package model

import (
	"context"
	"time"

	"github.com/nexussec/nexussec/internal/domain/enum"
)

// ScanJob represents a scan job entity stored in PostgreSQL.
type ScanJob struct {
	ID           string          `json:"id" db:"id"`
	UserID       string          `json:"user_id" db:"user_id"`
	TargetID     string          `json:"target_id" db:"target_id"`
	TargetURL    string          `json:"target_url" db:"-"` // joined from targets table
	ScanType     enum.ScanType   `json:"scan_type" db:"scan_type"`
	Status       enum.ScanStatus `json:"status" db:"status"`
	Progress     int             `json:"progress" db:"progress"`
	ReportID     string          `json:"report_id,omitempty" db:"report_id"`
	ErrorMessage string          `json:"error_message,omitempty" db:"error_message"`
	StartedAt    *time.Time      `json:"started_at,omitempty" db:"started_at"`
	CompletedAt  *time.Time      `json:"completed_at,omitempty" db:"completed_at"`
	CreatedAt    time.Time       `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at" db:"updated_at"`
}

// ScanJobRepository defines the contract for scan job persistence (PostgreSQL).
// Implementations live in internal/repository/postgres/.
type ScanJobRepository interface {
	// GetByID fetches a single scan job by its UUID.
	GetByID(ctx context.Context, id string) (*ScanJob, error)

	// UpdateStatus transitions the job to a new status.
	// Sets started_at when transitioning to RUNNING.
	// Sets completed_at when transitioning to COMPLETED or FAILED.
	UpdateStatus(ctx context.Context, id string, status enum.ScanStatus) error

	// UpdateProgress sets the completion percentage (0–100).
	UpdateProgress(ctx context.Context, id string, progress int) error

	// SetReportID links the MongoDB report ID to this job after scan completion.
	SetReportID(ctx context.Context, id string, reportID string) error

	// SetError records the failure reason and transitions to FAILED status.
	SetError(ctx context.Context, id string, errMsg string) error
}
