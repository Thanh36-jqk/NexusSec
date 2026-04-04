package model

import (
	"context"
	"time"
)

// VulnTriageRule represents a triage state (muted or false positive)
// applied to a specific vulnerability footprint on a specific target.
type VulnTriageRule struct {
	ID               string    `json:"id" db:"id"`
	TargetID         string    `json:"target_id" db:"target_id"`
	VulnFingerprint  string    `json:"vuln_fingerprint" db:"vuln_fingerprint"`
	IsMuted          bool      `json:"is_muted" db:"is_muted"`
	IsFalsePositive  bool      `json:"is_false_positive" db:"is_false_positive"`
	Notes            string    `json:"notes" db:"notes"`
	CreatedAt        time.Time `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time `json:"updated_at" db:"updated_at"`
}

// TriageRuleRequest is used to update the triage state via API.
type TriageRuleRequest struct {
	IsMuted         bool   `json:"is_muted"`
	IsFalsePositive bool   `json:"is_false_positive"`
	Notes           string `json:"notes,omitempty"`
}

// TriageRepository defines the contract for persisting triage rules.
type TriageRepository interface {
	// Upsert inserts or updates a triage rule for a given target and fingerprint.
	Upsert(ctx context.Context, rule *VulnTriageRule) error

	// GetByTarget fetches all triage rules for a given target.
	GetByTarget(ctx context.Context, targetID string) ([]*VulnTriageRule, error)
}
