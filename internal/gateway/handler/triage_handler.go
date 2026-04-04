package handler

import (
	"database/sql"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	"github.com/nexussec/nexussec/internal/domain/model"
	"github.com/nexussec/nexussec/internal/gateway/middleware"
	"github.com/nexussec/nexussec/internal/repository/postgres"
	"github.com/nexussec/nexussec/pkg/response"
	"github.com/rs/zerolog"
)

type TriageHandler struct {
	repo   model.TriageRepository
	db     *sqlx.DB
	logger zerolog.Logger
}

func NewTriageHandler(db *sqlx.DB, logger zerolog.Logger) *TriageHandler {
	return &TriageHandler{
		repo:   postgres.NewTriageRepository(db),
		db:     db,
		logger: logger.With().Str("handler", "triage").Logger(),
	}
}

// targetFromScan is a helper to fetch the target_id belonging to a scan_id
// and verify it belongs to the current user.
func (h *TriageHandler) targetFromScan(c *gin.Context, scanID string, userID string) (string, error) {
	var targetID string
	query := `SELECT target_id FROM scan_jobs WHERE id = $1 AND user_id = $2`
	err := h.db.GetContext(c.Request.Context(), &targetID, query, scanID, userID)
	return targetID, err
}

// GetTriageRules handles GET /scans/:id/triage
func (h *TriageHandler) GetTriageRules(c *gin.Context) {
	scanID := c.Param("id")

	userID, exists := c.Get(middleware.ContextKeyUserID)
	if !exists {
		response.Unauthorized(c, "user_id not found in token")
		return
	}

	targetID, err := h.targetFromScan(c, scanID, userID.(string))
	if err != nil {
		if err == sql.ErrNoRows {
			response.NotFound(c, "scan not found or unauthorized")
		} else {
			h.logger.Error().Err(err).Msg("failed to verify scan owner")
			response.InternalError(c, "database error")
		}
		return
	}

	rules, err := h.repo.GetByTarget(c.Request.Context(), targetID)
	if err != nil {
		h.logger.Error().Err(err).Msg("failed to fetch triage rules")
		response.InternalError(c, "failed to fetch triage rules")
		return
	}

	response.Success(c, "triage rules fetched successfully", rules)
}

// UpsertTriageRule handles PUT /scans/:id/triage/:fingerprint
func (h *TriageHandler) UpsertTriageRule(c *gin.Context) {
	scanID := c.Param("id")
	fingerprint := c.Param("fingerprint")

	var req model.TriageRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	userID, exists := c.Get(middleware.ContextKeyUserID)
	if !exists {
		response.Unauthorized(c, "user_id not found in token")
		return
	}

	targetID, err := h.targetFromScan(c, scanID, userID.(string))
	if err != nil {
		if err == sql.ErrNoRows {
			response.NotFound(c, "scan not found or unauthorized")
		} else {
			h.logger.Error().Err(err).Msg("failed to verify scan owner")
			response.InternalError(c, "database error")
		}
		return
	}

	rule := &model.VulnTriageRule{
		TargetID:        targetID,
		VulnFingerprint: fingerprint,
		IsMuted:         req.IsMuted,
		IsFalsePositive: req.IsFalsePositive,
		Notes:           req.Notes,
	}

	if err := h.repo.Upsert(c.Request.Context(), rule); err != nil {
		h.logger.Error().Err(err).Msg("failed to upsert triage rule")
		response.InternalError(c, "failed to save triage rule")
		return
	}

	response.Success(c, "triage rule updated successfully", nil)
}
