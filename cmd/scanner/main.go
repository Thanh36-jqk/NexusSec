package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/nexussec/nexussec/internal/infrastructure/broker"
	"github.com/nexussec/nexussec/internal/infrastructure/config"
	"github.com/nexussec/nexussec/internal/infrastructure/database"
	mongorepo "github.com/nexussec/nexussec/internal/repository/mongo"
	pgrepo "github.com/nexussec/nexussec/internal/repository/postgres"
	"github.com/nexussec/nexussec/internal/scanner/callback"
	"github.com/nexussec/nexussec/internal/scanner/executor"
	"github.com/nexussec/nexussec/internal/scanner/worker"
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
	log.Info().Msg("starting nexussec scanner engine")

	// ── 3. Connect to PostgreSQL ────────────────────────────
	pgDB, err := database.NewPostgresDB(&cfg.Postgres, log)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to PostgreSQL")
	}
	defer pgDB.Close()

	// ── 4. Connect to MongoDB ───────────────────────────────
	mongoClient, mongoDB, err := database.NewMongoDB(&cfg.Mongo, log)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to MongoDB")
	}
	defer mongoClient.Disconnect(context.Background())

	// ── 5. Connect to RabbitMQ ──────────────────────────────
	rabbitConn, err := broker.NewConnection(cfg.RabbitMQ.URI(), log)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to RabbitMQ")
	}
	defer rabbitConn.Close()

	// ── 6. Initialize Docker Manager (isolated scan-network) ─
	dockerMgr, err := executor.NewDockerManager(log, "bridge")
	if err != nil {
		log.Fatal().Err(err).Msg("failed to initialize Docker manager")
	}
	defer dockerMgr.Close()

	// ── 7. Wire Repositories & Notifier ─────────────────────
	scanJobRepo := pgrepo.NewScanJobRepo(pgDB)
	reportRepo := mongorepo.NewReportRepo(mongoDB)
	notifier := callback.NewNotifier(scanJobRepo, reportRepo, log)

	// ── 8. Create and Start Worker Pool ─────────────────────
	scannerWorker := worker.New(
		rabbitConn,
		dockerMgr,
		notifier,
		log,
		worker.Config{
			Concurrency: cfg.Scanner.Concurrency,
			QueueName:   worker.QueueName,
		},
	)

	// ── 9. Graceful Shutdown Context ────────────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-quit
		log.Info().Str("signal", sig.String()).Msg("shutting down scanner engine...")
		cancel()
	}()

	// ── 10. Start (blocks until context cancelled) ──────────
	log.Info().
		Int("concurrency", cfg.Scanner.Concurrency).
		Str("scan_network", cfg.Scanner.ScanNetwork).
		Msg("scanner worker pool starting")

	if err := scannerWorker.Start(ctx); err != nil {
		log.Fatal().Err(err).Msg("scanner worker error")
	}

	log.Info().Msg("scanner engine stopped")
}
