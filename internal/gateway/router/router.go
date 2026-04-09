package router

import (
	"crypto/rsa"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	"github.com/nexussec/nexussec/internal/gateway/handler"
	"github.com/nexussec/nexussec/internal/gateway/middleware"
	"github.com/nexussec/nexussec/internal/infrastructure/broker"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"go.mongodb.org/mongo-driver/mongo"
)

// Dependencies holds all injected dependencies for the router.
// This struct is the single wiring point — no globals, no init() magic.
type Dependencies struct {
	Logger         zerolog.Logger
	RedisClient    *redis.Client
	PgDB           *sqlx.DB
	MongoClient    *mongo.Client
	RabbitConn     *broker.Connection
	AllowedOrigins []string
	JWTPublicKey   *rsa.PublicKey // RS256 public key for token verification
	JWTIssuer      string
	AuthHandler    *handler.AuthHandler   // Register/Login handler
	ScanHandler    *handler.ScanHandler   // Scan job management (PG + RabbitMQ)
	TargetHandler  *handler.TargetHandler // Target management (PG)
	ReportHandler  *handler.ReportHandler // Report retrieval (PG + MongoDB)
	TriageHandler  *handler.TriageHandler // Triage persistence (PG)
	WSHandler      *handler.WSHandler     // WebSocket real-time updates (Redis)
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
	healthHandler := handler.NewHealthHandler(
		deps.Logger,
		deps.PgDB,
		deps.MongoClient,
		deps.RedisClient,
		deps.RabbitConn,
	)

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
		// ── Layer 3: Auth Rate Limiter (5 req/min per IP) ───────
		// Prevents email spam / brute force OTP
		authRateLimiter := middleware.NewRateLimiterMiddleware(deps.RedisClient, middleware.RateLimiterConfig{
			Limit:     5,
			Window:    1 * time.Minute,
			KeyPrefix: "nexussec:gateway:ratelimit:auth",
			FailMode:  middleware.FailClosed,
		})

		// ── Auth routes (public — no JWT required) ──────────
		auth := v1.Group("/auth")
		{
			auth.POST("/register", authRateLimiter.Handler(), deps.AuthHandler.Register)
			auth.POST("/login", deps.AuthHandler.Login)
			auth.POST("/verify-email", authRateLimiter.Handler(), deps.AuthHandler.VerifyEmail)

			// OAuth2
			auth.GET("/github/login", deps.AuthHandler.OAuthGitHubLogin)
			auth.GET("/github/callback", deps.AuthHandler.OAuthGitHubCallback)
			auth.GET("/google/login", deps.AuthHandler.OAuthGoogleLogin)
			auth.GET("/google/callback", deps.AuthHandler.OAuthGoogleCallback)
		}

		// ── Protected routes ────────────────────────────────
		protected := v1.Group("")
		protected.Use(jwtMw.Handler())
		{
			// Auth routes that require token
			authProtected := protected.Group("/auth")
			{
				authProtected.GET("/me", deps.AuthHandler.Me)
				authProtected.PUT("/password", deps.AuthHandler.ChangePassword)
			}

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

		// ── WebSockets
		// The frontend connects to WS_URL?job_id=xxx.
		ws := v1.Group("/ws")
		{
			ws.GET("", deps.WSHandler.StreamProgress)
		}
	}

	return engine
}
