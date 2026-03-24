package database

import (
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq" // PostgreSQL driver
	"github.com/nexussec/nexussec/internal/infrastructure/config"
	"github.com/rs/zerolog"
)

// NewPostgresDB creates a PostgreSQL connection pool with production-tuned settings.
//
// Connection pool parameters are critical to prevent connection exhaustion:
//   - MaxOpenConns:    caps total connections to the DB (prevents overload)
//   - MaxIdleConns:    keeps warm connections ready for quick reuse
//   - ConnMaxLifetime: forces connection recycling to handle DNS changes / PG restarts
//   - ConnMaxIdleTime: closes idle connections to free server-side resources
func NewPostgresDB(cfg *config.PostgresConfig, logger zerolog.Logger) (*sqlx.DB, error) {
	db, err := sqlx.Connect("postgres", cfg.DSN())
	if err != nil {
		return nil, fmt.Errorf("postgres: failed to connect: %w", err)
	}

	// ── Production Connection Pool Tuning ────────────────────
	//
	// MaxOpenConns: Hard ceiling on total open connections.
	//   - Too low = requests queue waiting for a connection (latency spikes)
	//   - Too high = overwhelms PostgreSQL (max_connections default = 100)
	//   - 25 is a safe default for a single service connecting to PG.
	db.SetMaxOpenConns(25)

	// MaxIdleConns: Connections kept alive in the pool for reuse.
	//   - Should be ≤ MaxOpenConns.
	//   - Higher = faster response (no connection setup overhead)
	//   - Lower = fewer server-side resources consumed when idle.
	db.SetMaxIdleConns(10)

	// ConnMaxLifetime: Maximum time a connection can be reused.
	//   - Forces periodic reconnection to pick up DNS changes,
	//     PG config reloads, and prevent stale connections.
	//   - 30 minutes is a balanced tradeoff.
	db.SetConnMaxLifetime(30 * time.Minute)

	// ConnMaxIdleTime: How long an idle connection sits in the pool.
	//   - Closes connections that haven't been used recently.
	//   - Frees server-side resources during low-traffic periods.
	db.SetConnMaxIdleTime(5 * time.Minute)

	// Verify connectivity
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("postgres: ping failed: %w", err)
	}

	logger.Info().
		Str("host", cfg.Host).
		Str("db", cfg.DB).
		Int("max_open_conns", 25).
		Int("max_idle_conns", 10).
		Msg("PostgreSQL connected with connection pooling")

	return db, nil
}
