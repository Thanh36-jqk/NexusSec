package model

import (
	"context"
	"time"
)

// Report represents a vulnerability report.
type Report struct {
	ID              string          `json:"id" bson:"_id,omitempty"`
	ScanJobID       string          `json:"scan_job_id" bson:"scan_job_id"`
	TargetURL       string          `json:"target_url" bson:"target_url"`
	ScanType        string          `json:"scan_type" bson:"scan_type"`
	Summary         ReportSummary   `json:"summary" bson:"summary"`
	Vulnerabilities []Vulnerability `json:"vulnerabilities" bson:"vulnerabilities"`
	CreatedAt       time.Time       `json:"created_at" bson:"created_at"`
}

// ReportSummary holds aggregated counts by severity.
type ReportSummary struct {
	Total    int `json:"total" bson:"total"`
	Critical int `json:"critical" bson:"critical"`
	High     int `json:"high" bson:"high"`
	Medium   int `json:"medium" bson:"medium"`
	Low      int `json:"low" bson:"low"`
	Info     int `json:"info" bson:"info"`
}

// Vulnerability represents a single finding from a scan tool.
type Vulnerability struct {
	Title       string `json:"title" bson:"title"`
	Severity    string `json:"severity" bson:"severity"`
	Description string `json:"description" bson:"description"`
	Remediation string `json:"remediation,omitempty" bson:"remediation,omitempty"`
	CWE         string `json:"cwe,omitempty" bson:"cwe,omitempty"`
	Reference   string `json:"reference,omitempty" bson:"reference,omitempty"`
}

// ReportRepository defines the contract for report persistence (MongoDB).
// Implementations live in internal/repository/mongo/.
type ReportRepository interface {
	// Create stores a new vulnerability report and returns the generated MongoDB ID.
	Create(ctx context.Context, report *Report) (string, error)

	// GetByID fetches a report by its MongoDB ObjectID.
	GetByID(ctx context.Context, id string) (*Report, error)

	// GetByScanJobID fetches the report associated with a specific scan job.
	GetByScanJobID(ctx context.Context, scanJobID string) (*Report, error)
}
