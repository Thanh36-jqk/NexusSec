package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/nexussec/nexussec/pkg/response"
	"github.com/rs/zerolog"
)

// HealthHandler provides health and readiness check endpoints.
type HealthHandler struct {
	logger zerolog.Logger
}

// NewHealthHandler creates a health handler with injected dependencies.
func NewHealthHandler(logger zerolog.Logger) *HealthHandler {
	return &HealthHandler{logger: logger}
}

// LivenessCheck responds with 200 OK if the gateway process is running.
// Used by Docker/K8s health checks.
//
//	GET /health/live
func (h *HealthHandler) LivenessCheck(c *gin.Context) {
	response.Success(c, "gateway is alive", gin.H{
		"service": "nexussec-gateway",
		"status":  "up",
	})
}

// ReadinessCheck verifies that downstream dependencies are reachable.
// Returns 200 if ready, 503 if any dependency is unavailable.
//
//	GET /health/ready
func (h *HealthHandler) ReadinessCheck(c *gin.Context) {
	// TODO: Add Redis ping, PostgreSQL ping, RabbitMQ ping checks here
	// once those clients are injected into the handler.
	response.Success(c, "gateway is ready", gin.H{
		"service": "nexussec-gateway",
		"status":  "ready",
	})
}
