package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	"github.com/nexussec/nexussec/internal/gateway/middleware"
	"github.com/nexussec/nexussec/internal/infrastructure/broker"
	"github.com/nexussec/nexussec/internal/validator"
	"github.com/nexussec/nexussec/pkg/response"
	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/rs/zerolog"
)

// ── Queue name must match Scanner Engine's consumer ──────────
const scanJobsQueue = "scan_jobs_queue"

// ── Request / Response DTOs ──────────────────────────────────

type createScanRequest struct {
	TargetID string `json:"target_id" binding:"required"`
	ScanType string `json:"scan_type" binding:"required,oneof=zap nmap full"`
}

type scanJobResponse struct {
	ID        string `json:"id"`
	TargetURL string `json:"target_url"`
	ScanType  string `json:"scan_type"`
	Status    string `json:"status"`
	Progress  int    `json:"progress"`
	CreatedAt string `json:"created_at"`
}

type scanListItem struct {
	ID           string  `json:"id"`
	TargetURL    string  `json:"target_url"`
	ScanType     string  `json:"scan_type"`
	Status       string  `json:"status"`
	Progress     int     `json:"progress"`
	ErrorMessage *string `json:"error_message,omitempty"`
	CreatedAt    string  `json:"created_at"`
}

// scanMessage is the JSON payload published to RabbitMQ.
// This is the contract between Gateway (publisher) and Scanner Engine (consumer).
// Must match worker.ScanMessage exactly.
type scanMessage struct {
	JobID     string `json:"job_id"`
	TargetURL string `json:"target_url"`
	ScanType  string `json:"scan_type"`
	UserID    string `json:"user_id"`
}

// ── ScanHandler ──────────────────────────────────────────────

// ScanHandler manages scan job lifecycle:
//   - POST /scans → create job in PG + publish to RabbitMQ → 202 Accepted
//   - GET /scans → list user's scan history from PG
//   - GET /scans/:id → fetch single scan job from PG
//
// NO HTTP proxy to Scanner Engine — Gateway talks to PG + RabbitMQ directly.
// Scanner Engine is a background worker that consumes from the queue.
type ScanHandler struct {
	db     *sqlx.DB
	rabbit *broker.Connection
	logger zerolog.Logger
}

// NewScanHandler creates a scan handler with injected dependencies.
func NewScanHandler(db *sqlx.DB, rabbit *broker.Connection, logger zerolog.Logger) *ScanHandler {
	return &ScanHandler{
		db:     db,
		rabbit: rabbit,
		logger: logger.With().Str("handler", "scan").Logger(),
	}
}

// ── POST /api/v1/scans — Create Scan ────────────────────────

// CreateScan creates a new scan job and enqueues it to RabbitMQ.
//
//	Flow: Validate → Insert into PG (status=pending) → Publish to RabbitMQ → 202 Accepted
//
// Returns 202 (not 200/201) because the scan is processed asynchronously.
// The client should poll GET /scans/:id or listen to WebSocket for status updates.
func (h *ScanHandler) CreateScan(c *gin.Context) {
	var req createScanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	// Extract authenticated user_id from JWT (set by JWT middleware)
	userID, exists := c.Get(middleware.ContextKeyUserID)
	if !exists {
		response.Unauthorized(c, "user_id not found in token")
		return
	}

	// ── 1. Look up target to get base_url ────────────────────
	var targetURL string
	err := h.db.QueryRowContext(c.Request.Context(),
		`SELECT base_url FROM targets WHERE id = $1 AND user_id = $2`,
		req.TargetID, userID,
	).Scan(&targetURL)

	if err != nil {
		if err == sql.ErrNoRows {
			response.NotFound(c, "target not found or does not belong to you")
			return
		}
		h.logger.Error().Err(err).Msg("failed to query target")
		response.InternalError(c, "failed to look up target")
		return
	}

	// ── SSRF Protection: chặn target trỏ về IP nội bộ ───────
	if err := validator.ValidateTarget(targetURL); err != nil {
		h.logger.Warn().
			Str("target_url", targetURL).
			Str("user_id", userID.(string)).
			Err(err).
			Msg("SSRF blocked")
		response.BadRequest(c, "Lỗi bảo mật: "+err.Error())
		return
	}

	// ── 2. Insert scan job into PostgreSQL (status = pending) ─
	var jobID, createdAt string
	err = h.db.QueryRowContext(c.Request.Context(),
		`INSERT INTO scan_jobs (user_id, target_id, scan_type, status, progress)
		 VALUES ($1, $2, $3, 'pending', 0)
		 RETURNING id, created_at`,
		userID, req.TargetID, req.ScanType,
	).Scan(&jobID, &createdAt)

	if err != nil {
		h.logger.Error().Err(err).Msg("failed to create scan job")
		response.InternalError(c, "failed to create scan job")
		return
	}

	// ── 3. Publish message to RabbitMQ ───────────────────────
	msg := scanMessage{
		JobID:     jobID,
		TargetURL: targetURL,
		ScanType:  req.ScanType,
		UserID:    userID.(string),
	}

	body, err := json.Marshal(msg)
	if err != nil {
		h.logger.Error().Err(err).Msg("failed to marshal scan message")
		response.InternalError(c, "failed to enqueue scan")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	err = h.rabbit.Channel().PublishWithContext(ctx,
		"",            // exchange (default — routes by queue name)
		scanJobsQueue, // routing key = queue name
		false,         // mandatory
		false,         // immediate
		amqp.Publishing{
			ContentType:  "application/json",
			DeliveryMode: amqp.Persistent, // survive broker restarts
			Body:         body,
		},
	)
	if err != nil {
		h.logger.Error().Err(err).Str("job_id", jobID).Msg("failed to publish to RabbitMQ")
		// Mark job as failed since we couldn't enqueue it
		h.db.ExecContext(c.Request.Context(),
			`UPDATE scan_jobs SET status = 'failed', error_message = 'failed to enqueue job' WHERE id = $1`,
			jobID,
		)
		response.InternalError(c, "failed to enqueue scan job")
		return
	}

	h.logger.Info().
		Str("job_id", jobID).
		Str("target_url", targetURL).
		Str("scan_type", req.ScanType).
		Msg("scan job created and enqueued")

	// ── 4. Return 202 Accepted ───────────────────────────────
	response.Accepted(c, "scan job accepted", scanJobResponse{
		ID:        jobID,
		TargetURL: targetURL,
		ScanType:  req.ScanType,
		Status:    "pending",
		Progress:  0,
		CreatedAt: createdAt,
	})
}

// ── GET /api/v1/scans — List User Scans ─────────────────────

// ListScans returns all scan jobs for the authenticated user.
func (h *ScanHandler) ListScans(c *gin.Context) {
	userID, exists := c.Get(middleware.ContextKeyUserID)
	if !exists {
		response.Unauthorized(c, "user_id not found in token")
		return
	}

	rows, err := h.db.QueryContext(c.Request.Context(),
		`SELECT sj.id, t.base_url, sj.scan_type, sj.status, sj.progress,
		        sj.error_message, sj.created_at
		 FROM scan_jobs sj
		 JOIN targets t ON t.id = sj.target_id
		 WHERE sj.user_id = $1
		 ORDER BY sj.created_at DESC
		 LIMIT 50`,
		userID,
	)
	if err != nil {
		h.logger.Error().Err(err).Msg("failed to list scan jobs")
		response.InternalError(c, "failed to list scans")
		return
	}
	defer rows.Close()

	scans := make([]scanListItem, 0)
	for rows.Next() {
		var s scanListItem
		if err := rows.Scan(&s.ID, &s.TargetURL, &s.ScanType, &s.Status, &s.Progress, &s.ErrorMessage, &s.CreatedAt); err != nil {
			h.logger.Error().Err(err).Msg("failed to scan row")
			continue
		}
		scans = append(scans, s)
	}

	response.Success(c, "scans retrieved", scans)
}

// ── GET /api/v1/scans/:id — Get Scan Detail ─────────────────

// GetScan returns a single scan job by ID (user must own it).
func (h *ScanHandler) GetScan(c *gin.Context) {
	scanID := c.Param("id")
	userID, exists := c.Get(middleware.ContextKeyUserID)
	if !exists {
		response.Unauthorized(c, "user_id not found in token")
		return
	}

	var s scanListItem
	err := h.db.QueryRowContext(c.Request.Context(),
		`SELECT sj.id, t.base_url, sj.scan_type, sj.status, sj.progress,
		        sj.error_message, sj.created_at
		 FROM scan_jobs sj
		 JOIN targets t ON t.id = sj.target_id
		 WHERE sj.id = $1 AND sj.user_id = $2`,
		scanID, userID,
	).Scan(&s.ID, &s.TargetURL, &s.ScanType, &s.Status, &s.Progress, &s.ErrorMessage, &s.CreatedAt)

	if err != nil {
		if err == sql.ErrNoRows {
			response.NotFound(c, "scan not found")
			return
		}
		h.logger.Error().Err(err).Msg("failed to fetch scan job")
		response.InternalError(c, "failed to fetch scan")
		return
	}

	response.Success(c, "scan retrieved", s)
}
