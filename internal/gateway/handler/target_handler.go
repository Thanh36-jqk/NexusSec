package handler

import (
	"database/sql"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	"github.com/nexussec/nexussec/internal/gateway/middleware"
	"github.com/nexussec/nexussec/internal/validator"
	"github.com/nexussec/nexussec/pkg/response"
	"github.com/rs/zerolog"
)

// ── Request / Response DTOs ──────────────────────────────────

type createTargetRequest struct {
	Name        string `json:"name"        binding:"required,min=1,max=255"`
	BaseURL     string `json:"base_url"    binding:"required,url"`
	Description string `json:"description"`
}

type targetResponse struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	BaseURL     string  `json:"base_url"`
	Description *string `json:"description,omitempty"`
	CreatedAt   string  `json:"created_at"`
}

// ── TargetHandler ────────────────────────────────────────────

// TargetHandler manages API targets (URLs to scan).
// Each target is owned by the authenticated user (user_id from JWT).
type TargetHandler struct {
	db     *sqlx.DB
	logger zerolog.Logger
}

// NewTargetHandler creates a target handler with injected dependencies.
func NewTargetHandler(db *sqlx.DB, logger zerolog.Logger) *TargetHandler {
	return &TargetHandler{
		db:     db,
		logger: logger.With().Str("handler", "target").Logger(),
	}
}

// ── POST /api/v1/targets — Create Target ─────────────────────

// CreateTarget registers a new scan target for the authenticated user.
//
// @Summary      Create a scan target
// @Description  Tạo một target mới để scan. URL được kiểm tra SSRF. Trả về 409 nếu URL đã tồn tại.
// @Tags         targets
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      createTargetRequest  true  "Thông tin target"
// @Success      201   {object}  response.JSONResponse{data=targetResponse}  "Tạo thành công"
// @Failure      400   {object}  response.JSONResponse  "URL không hợp lệ hoặc SSRF blocked"
// @Failure      401   {object}  response.JSONResponse
// @Failure      409   {object}  response.JSONResponse  "Target URL đã tồn tại"
// @Failure      500   {object}  response.JSONResponse
// @Router       /targets [post]
func (h *TargetHandler) CreateTarget(c *gin.Context) {
	var req createTargetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	userID, exists := c.Get(middleware.ContextKeyUserID)
	if !exists {
		response.Unauthorized(c, "user_id not found in token")
		return
	}

	// Normalize URL — trim whitespace, ensure scheme
	req.BaseURL = strings.TrimSpace(req.BaseURL)
	if _, err := url.ParseRequestURI(req.BaseURL); err != nil {
		response.BadRequest(c, "invalid URL format")
		return
	}

	// ── SSRF Protection: chặn target trỏ về IP nội bộ/metadata ──
	if err := validator.ValidateTarget(req.BaseURL); err != nil {
		h.logger.Warn().
			Str("base_url", req.BaseURL).
			Str("user_id", userID.(string)).
			Err(err).
			Msg("SSRF blocked at target creation")
		response.BadRequest(c, "Lỗi bảo mật: "+err.Error())
		return
	}

	// Insert target
	var t targetResponse
	var desc sql.NullString

	err := h.db.QueryRowContext(c.Request.Context(),
		`INSERT INTO targets (user_id, name, base_url, description)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, name, base_url, description, created_at`,
		userID, strings.TrimSpace(req.Name), req.BaseURL, nullIfEmpty(req.Description),
	).Scan(&t.ID, &t.Name, &t.BaseURL, &desc, &t.CreatedAt)

	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			response.Error(c, 409, "a target with this URL already exists")
			return
		}
		h.logger.Error().Err(err).Msg("failed to create target")
		response.InternalError(c, "failed to create target")
		return
	}

	if desc.Valid {
		t.Description = &desc.String
	}

	h.logger.Info().
		Str("target_id", t.ID).
		Str("base_url", t.BaseURL).
		Msg("target created")

	response.Created(c, "target created", t)
}

// ── GET /api/v1/targets — List Targets ───────────────────────

// ListTargets returns all scan targets owned by the authenticated user.
//
// @Summary      List scan targets
// @Description  Lấy danh sách tất cả target của user hiện tại.
// @Tags         targets
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  response.JSONResponse{data=[]targetResponse}
// @Failure      401  {object}  response.JSONResponse
// @Failure      500  {object}  response.JSONResponse
// @Router       /targets [get]
func (h *TargetHandler) ListTargets(c *gin.Context) {
	userID, exists := c.Get(middleware.ContextKeyUserID)
	if !exists {
		response.Unauthorized(c, "user_id not found in token")
		return
	}

	rows, err := h.db.QueryContext(c.Request.Context(),
		`SELECT id, name, base_url, description, created_at
		 FROM targets
		 WHERE user_id = $1
		 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		h.logger.Error().Err(err).Msg("failed to list targets")
		response.InternalError(c, "failed to list targets")
		return
	}
	defer rows.Close()

	targets := make([]targetResponse, 0)
	for rows.Next() {
		var t targetResponse
		var desc sql.NullString
		if err := rows.Scan(&t.ID, &t.Name, &t.BaseURL, &desc, &t.CreatedAt); err != nil {
			h.logger.Error().Err(err).Msg("failed to scan row")
			continue
		}
		if desc.Valid {
			t.Description = &desc.String
		}
		targets = append(targets, t)
	}

	response.Success(c, "targets retrieved", targets)
}

// nullIfEmpty converts an empty string to a sql.NullString for nullable columns.
func nullIfEmpty(s string) sql.NullString {
	s = strings.TrimSpace(s)
	if s == "" {
		return sql.NullString{Valid: false}
	}
	return sql.NullString{String: s, Valid: true}
}
