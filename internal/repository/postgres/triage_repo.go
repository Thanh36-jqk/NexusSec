package postgres

import (
	"context"

	"github.com/jmoiron/sqlx"
	"github.com/nexussec/nexussec/internal/domain/model"
)

type triageRepo struct {
	db *sqlx.DB
}

// NewTriageRepository creates a new instance of TriageRepository.
func NewTriageRepository(db *sqlx.DB) model.TriageRepository {
	return &triageRepo{db: db}
}

func (r *triageRepo) Upsert(ctx context.Context, rule *model.VulnTriageRule) error {
	query := `
		INSERT INTO vulnerability_triage (target_id, vuln_fingerprint, is_muted, is_false_positive, notes)
		VALUES (:target_id, :vuln_fingerprint, :is_muted, :is_false_positive, :notes)
		ON CONFLICT (target_id, vuln_fingerprint)
		DO UPDATE SET
			is_muted = EXCLUDED.is_muted,
			is_false_positive = EXCLUDED.is_false_positive,
			notes = EXCLUDED.notes;
	`
	_, err := r.db.NamedExecContext(ctx, query, rule)
	if err != nil {
		return err
	}
	return nil
}

func (r *triageRepo) GetByTarget(ctx context.Context, targetID string) ([]*model.VulnTriageRule, error) {
	rules := []*model.VulnTriageRule{}
	query := `
		SELECT id, target_id, vuln_fingerprint, is_muted, is_false_positive, notes, created_at, updated_at
		FROM vulnerability_triage
		WHERE target_id = $1
	`
	err := r.db.SelectContext(ctx, &rules, query, targetID)
	if err != nil {
		return nil, err
	}
	return rules, nil
}
