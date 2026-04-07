package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// In production, we'd check origin strictly, but for now we allow from Gateway's allowed origins
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// WSHandler manages WebSocket connections for real-time features.
type WSHandler struct {
	redisClient *redis.Client
	logger      zerolog.Logger
}

// NewWSHandler creates a new WebSocket handler with injected dependencies.
func NewWSHandler(redisClient *redis.Client, logger zerolog.Logger) *WSHandler {
	return &WSHandler{
		redisClient: redisClient,
		logger:      logger,
	}
}

// StreamProgress upgrades the connection and streams scan progress events.
//   GET /api/v1/ws?job_id=:id
func (h *WSHandler) StreamProgress(c *gin.Context) {
	scanID := c.Query("job_id")
	if scanID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "job_id is required"})
		return
	}

	// 1. Upgrade HTTP to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		h.logger.Error().Err(err).Msg("failed to upgrade to websocket")
		return // Gin/Gorilla handles the response if upgrade fails
	}
	defer conn.Close()

	// 2. Subscribe to Redis for this specific scan job
	channelName := "scan_progress:" + scanID
	ctx := context.Background() // A longer-lived context for the subscription
	pubsub := h.redisClient.Subscribe(ctx, channelName)
	defer pubsub.Close()

	ch := pubsub.Channel()

	h.logger.Info().Str("scan_id", scanID).Msg("websocket client connected to progress stream")

	// Pinger to keep connection alive
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case msg := <-ch:
			// The payload from Redis is a fully formed JSON string from notifier
			// e.g. {"type":"progress_update", "progress":50, "status":"running"}
			// We just need to add the job_id.
			var eventData map[string]interface{}
			if err := json.Unmarshal([]byte(msg.Payload), &eventData); err != nil {
				h.logger.Error().Err(err).Msg("failed to parse redis message")
				continue
			}
			eventData["job_id"] = scanID

			if err := conn.WriteJSON(eventData); err != nil {
				h.logger.Warn().Err(err).Msg("failed to write ws message, client probably disconnected")
				return // break loop and close
			}
		case <-ticker.C:
			// Send ping to client
			if err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(time.Second)); err != nil {
				h.logger.Warn().Err(err).Msg("websocket ping failed")
				return
			}
		}
	}
}
