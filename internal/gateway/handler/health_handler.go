package handler

import (
	"context"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	"github.com/nexussec/nexussec/internal/infrastructure/broker"
	"github.com/nexussec/nexussec/pkg/response"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/readpref"
)

// HealthHandler provides health and readiness check endpoints.
type HealthHandler struct {
	logger      zerolog.Logger
	pgDB        *sqlx.DB
	mongoClient *mongo.Client
	redisClient *redis.Client
	rabbitConn  *broker.Connection
}

// NewHealthHandler creates a health handler with injected dependencies.
func NewHealthHandler(
	logger zerolog.Logger,
	pgDB *sqlx.DB,
	mongoClient *mongo.Client,
	redisClient *redis.Client,
	rabbitConn *broker.Connection,
) *HealthHandler {
	return &HealthHandler{
		logger:      logger,
		pgDB:        pgDB,
		mongoClient: mongoClient,
		redisClient: redisClient,
		rabbitConn:  rabbitConn,
	}
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
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	issues := make(map[string]string)

	if h.pgDB != nil {
		if err := h.pgDB.PingContext(ctx); err != nil {
			issues["postgres"] = err.Error()
		}
	} else {
		issues["postgres"] = "not initialized"
	}

	if h.mongoClient != nil {
		if err := h.mongoClient.Ping(ctx, readpref.Primary()); err != nil {
			issues["mongodb"] = err.Error()
		}
	} else {
		issues["mongodb"] = "not initialized"
	}

	if h.redisClient != nil {
		if err := h.redisClient.Ping(ctx).Err(); err != nil {
			issues["redis"] = err.Error()
		}
	} else {
		issues["redis"] = "not initialized"
	}

	if h.rabbitConn != nil {
		if h.rabbitConn.IsClosed() {
			issues["rabbitmq"] = "connection closed"
		}
	} else {
		issues["rabbitmq"] = "not initialized"
	}

	if len(issues) > 0 {
		h.logger.Error().Fields(issues).Msg("readiness check failed")
		response.Error(c, 503, "service unavailable: dependencies not ready")
		return
	}

	response.Success(c, "gateway is ready", gin.H{
		"service": "nexussec-gateway",
		"status":  "ready",
	})
}
