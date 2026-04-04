package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nexussec/nexussec/internal/gateway/handler"
	"github.com/nexussec/nexussec/internal/gateway/middleware"
	"github.com/nexussec/nexussec/internal/gateway/router"
	"github.com/nexussec/nexussec/internal/infrastructure/broker"
	"github.com/nexussec/nexussec/internal/infrastructure/cache"
	"github.com/nexussec/nexussec/internal/infrastructure/config"
	"github.com/nexussec/nexussec/internal/infrastructure/database"
	"github.com/nexussec/nexussec/pkg/logger"
)

func main() {
	// ── 1. Load Configuration ───────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "FATAL: failed to load config: %v\n", err)
		os.Exit(1)
	}

	// ── 2. Initialize Logger ────────────────────────────────
	log := logger.New(cfg.Server.Mode)
	log.Info().Str("port", cfg.Server.Port).Msg("starting nexussec gateway")

	// ── 3. Load RSA Keys (RS256) ────────────────────────────
	// Public key: used by JWT middleware to VERIFY tokens
	pubKeyBytes, err := os.ReadFile(cfg.JWT.PublicKeyPath)
	if err != nil {
		log.Fatal().Err(err).
			Str("path", cfg.JWT.PublicKeyPath).
			Msg("failed to read JWT public key file")
	}

	jwtPublicKey, err := middleware.ParseRSAPublicKey(pubKeyBytes)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to parse RSA public key")
	}
	log.Info().Str("path", cfg.JWT.PublicKeyPath).Msg("loaded RSA public key (RS256)")

	// Private key: used by Auth handler to SIGN tokens
	privKeyBytes, err := os.ReadFile(cfg.JWT.PrivateKeyPath)
	if err != nil {
		log.Fatal().Err(err).
			Str("path", cfg.JWT.PrivateKeyPath).
			Msg("failed to read JWT private key file")
	}

	jwtPrivateKey, err := middleware.ParseRSAPrivateKey(privKeyBytes)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to parse RSA private key")
	}
	log.Info().Str("path", cfg.JWT.PrivateKeyPath).Msg("loaded RSA private key (RS256)")

	// ── 4. Connect to PostgreSQL ────────────────────────────
	pgDB, err := database.NewPostgresDB(&cfg.Postgres, log)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to PostgreSQL")
	}
	defer pgDB.Close()

	// ── 5. Connect to Redis ─────────────────────────────────
	redisClient, err := cache.NewRedisClient(&cfg.Redis)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to Redis")
	}
	defer redisClient.Close()
	log.Info().Str("addr", cfg.Redis.Addr()).Msg("connected to Redis")

	// ── 6. Connect to RabbitMQ ──────────────────────────────
	// Gateway publishes scan jobs directly to RabbitMQ (no HTTP proxy to Scanner)
	rabbitConn, err := broker.NewConnection(cfg.RabbitMQ.URI(), log)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to RabbitMQ")
	}
	defer rabbitConn.Close()

	// Declare queue topology so publishing works even if Scanner hasn't started yet
	if _, err := rabbitConn.DeclareQueueWithDLQ("scan_jobs_queue"); err != nil {
		log.Fatal().Err(err).Msg("failed to declare scan_jobs_queue")
	}

	// ── 6b. Connect to MongoDB (for Reports) ────────────────
	mongoClient, mongoDB, err := database.NewMongoDB(&cfg.Mongo, log)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to MongoDB")
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		mongoClient.Disconnect(ctx)
	}()

	// ── 7. Initialize Handlers ──────────────────────────────
	authHandler := handler.NewAuthHandler(
		pgDB,
		jwtPrivateKey,
		cfg.JWT.Issuer,
		cfg.JWT.Expiration,
		log,
	)

	scanHandler := handler.NewScanHandler(pgDB, rabbitConn, log)

	targetHandler := handler.NewTargetHandler(pgDB, log)

	reportHandler := handler.NewReportHandler(pgDB, mongoDB, log)

	triageHandler := handler.NewTriageHandler(pgDB, log)

	// ── 8. Wire Dependencies & Setup Router ─────────────────
	deps := &router.Dependencies{
		Logger:         log,
		RedisClient:    redisClient,
		AllowedOrigins: cfg.CORS.AllowedOrigins,
		JWTPublicKey:   jwtPublicKey,
		JWTIssuer:      cfg.JWT.Issuer,
		AuthHandler:    authHandler,
		ScanHandler:    scanHandler,
		TargetHandler:  targetHandler,
		ReportHandler:  reportHandler,
		TriageHandler:  triageHandler,
	}

	engine := router.Setup(deps)

	// ── 9. Start HTTP Server ────────────────────────────────
	server := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      engine,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
	}

	// Start server in a goroutine
	go func() {
		log.Info().Str("addr", server.Addr).Msg("gateway listening")
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal().Err(err).Msg("server error")
		}
	}()

	// ── 10. Graceful Shutdown ───────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit

	log.Info().Str("signal", sig.String()).Msg("shutting down gateway...")

	// Give in-flight requests a deadline to complete
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Error().Err(err).Msg("forced shutdown")
	}

	log.Info().Msg("gateway stopped")
}
