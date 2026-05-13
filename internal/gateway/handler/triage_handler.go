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

// GetTriageRules retrieves all triage rules for a scan.
//
// @Summary      Get triage rules
// @Description  Lấy danh sách triage rules của một scan (mà user sở hữu).
// @Tags         triage
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Scan Job ID (UUID)"
// @Success      200  {object}  response.JSONResponse  "Danh sách triage rules"
// @Failure      401  {object}  response.JSONResponse
// @Failure      404  {object}  response.JSONResponse  "Scan không tồn tại"
// @Failure      500  {object}  response.JSONResponse
// @Router       /scans/{id}/triage [get]
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

// UpsertTriageRule creates or updates a triage rule for a vulnerability.
//
// @Summary      Upsert triage rule
// @Description  Tạo hoặc cập nhật triage rule cho một lỗ hổng (theo fingerprint).
// @Tags         triage
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id           path  string                     true  "Scan Job ID (UUID)"
// @Param        fingerprint  path  string                     true  "Fingerprint của vulnerability"
// @Param        body         body  model.TriageRuleRequest    true  "Triage rule data"
// @Success      200  {object}  response.JSONResponse  "Cập nhật thành công"
// @Failure      400  {object}  response.JSONResponse
// @Failure      401  {object}  response.JSONResponse
// @Failure      404  {object}  response.JSONResponse
// @Failure      500  {object}  response.JSONResponse
// @Router       /scans/{id}/triage/{fingerprint} [put]
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
