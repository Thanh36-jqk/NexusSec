package router

import (
	"crypto/rsa"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nexussec/nexussec/internal/gateway/handler"
	"github.com/nexussec/nexussec/internal/gateway/middleware"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

// Dependencies holds all injected dependencies for the router.
// This struct is the single wiring point — no globals, no init() magic.
type Dependencies struct {
	Logger         zerolog.Logger
	RedisClient    *redis.Client
	AllowedOrigins []string
	JWTPublicKey   *rsa.PublicKey // RS256 public key for token verification
	JWTIssuer      string
	AuthHandler    *handler.AuthHandler   // Register/Login handler
	ScanHandler    *handler.ScanHandler   // Scan job management (PG + RabbitMQ)
	TargetHandler  *handler.TargetHandler // Target management (PG)
	ReportHandler  *handler.ReportHandler // Report retrieval (PG + MongoDB)
	TriageHandler  *handler.TriageHandler // Triage persistence (PG)
}

// Setup creates the Gin engine with all routes, middleware, and handlers wired.
func Setup(deps *Dependencies) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	engine := gin.New()

	// Add panic recovery (returns 500 JSON instead of crashing)
	engine.Use(gin.Recovery())

	// ── Global Middleware ────────────────────────────────────
	corsMw := middleware.NewCORSMiddleware(deps.AllowedOrigins)
	loggerMw := middleware.NewLoggerMiddleware(deps.Logger)

	engine.Use(corsMw.Handler())
	engine.Use(loggerMw.Handler())

	// ── Layer 1: Global Rate Limiter (100 req/min per IP) ───
	// Applies to ALL incoming API traffic as a DDoS baseline.
	// Fails OPEN — we prefer availability for general endpoints.
	globalRateLimiter := middleware.NewRateLimiterMiddleware(deps.RedisClient, middleware.RateLimiterConfig{
		Limit:     100,
		Window:    1 * time.Minute,
		KeyPrefix: "nexussec:gateway:ratelimit:global",
		FailMode:  middleware.FailOpen,
	})
	engine.Use(globalRateLimiter.Handler())

	// ── Health Check (public, no auth) ──────────────────────
	healthHandler := handler.NewHealthHandler(deps.Logger)

	health := engine.Group("/health")
	{
		health.GET("/live", healthHandler.LivenessCheck)
		health.GET("/ready", healthHandler.ReadinessCheck)
	}

	// ── API v1 ──────────────────────────────────────────────
	jwtMw := middleware.NewJWTAuthMiddleware(
		deps.JWTPublicKey,
		deps.JWTIssuer,
	)

	// ── Layer 2: Scan Rate Limiter (5 req/min per IP) ───────
	// Applies ONLY to scan submission. Fails CLOSED to prevent
	// container exhaustion from uncontrolled Docker-based scans.
	scanRateLimiter := middleware.NewRateLimiterMiddleware(deps.RedisClient, middleware.RateLimiterConfig{
		Limit:     5,
		Window:    1 * time.Minute,
		KeyPrefix: "nexussec:gateway:ratelimit:scans",
		FailMode:  middleware.FailClosed,
	})

	v1 := engine.Group("/api/v1")
	{
		// ── Auth routes (public — no JWT required) ──────────
		auth := v1.Group("/auth")
		{
			auth.POST("/register", deps.AuthHandler.Register)
			auth.POST("/login", deps.AuthHandler.Login)
		}

		// ── Protected routes ────────────────────────────────
		protected := v1.Group("")
		protected.Use(jwtMw.Handler())
		{
			// Target routes — manage scan targets
			targets := protected.Group("/targets")
			{
				targets.POST("", deps.TargetHandler.CreateTarget)
				targets.GET("", deps.TargetHandler.ListTargets)
			}

			// Scan routes — Gateway handles directly via PG + RabbitMQ
			scans := protected.Group("/scans")
			{
				scans.POST("", scanRateLimiter.Handler(), deps.ScanHandler.CreateScan)
				scans.GET("", deps.ScanHandler.ListScans)
				scans.GET("/:id", deps.ScanHandler.GetScan)

				// Report route — sub-resource of a scan job
				// GET /api/v1/scans/:id/report
				scans.GET("/:id/report", deps.ReportHandler.GetReport)

				// Triage routes
				scans.GET("/:id/triage", deps.TriageHandler.GetTriageRules)
				scans.PUT("/:id/triage/:fingerprint", deps.TriageHandler.UpsertTriageRule)
			}
		}
	}

	return engine
}
