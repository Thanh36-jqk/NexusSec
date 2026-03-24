package database

import (
	"context"
	"fmt"
	"time"

	"github.com/nexussec/nexussec/internal/infrastructure/config"
	"github.com/rs/zerolog"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"
)

// NewMongoDB creates a MongoDB client with production-tuned connection pool settings.
//
// Connection pool parameters:
//   - MaxPoolSize:   caps simultaneous connections per server (prevents overload)
//   - MinPoolSize:   keeps warm connections ready for instant use
//   - MaxIdleTime:   closes idle connections to free server resources
//   - ConnectTimeout: fast failure on unreachable server
func NewMongoDB(cfg *config.MongoConfig, logger zerolog.Logger) (*mongo.Client, *mongo.Database, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	clientOpts := options.Client().
		ApplyURI(cfg.URI()).
		// MaxPoolSize: Hard ceiling on connections per server.
		//   - Default is 100, which is too high for most single-service setups.
		//   - 25 matches our PostgreSQL pool to keep resource usage symmetric.
		SetMaxPoolSize(25).
		// MinPoolSize: Warm connections maintained in the pool.
		//   - Eliminates connection setup latency for steady-state traffic.
		SetMinPoolSize(5).
		// MaxConnIdleTime: How long unused connections stay in the pool.
		//   - Frees server resources during low-traffic periods.
		SetMaxConnIdleTime(5 * time.Minute).
		// ConnectTimeout: Time limit for initial connection.
		//   - 10s is generous; fail fast if MongoDB is unreachable.
		SetConnectTimeout(10 * time.Second).
		// ServerSelectionTimeout: Time limit for selecting a server.
		SetServerSelectionTimeout(5 * time.Second)

	client, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		return nil, nil, fmt.Errorf("mongodb: failed to connect: %w", err)
	}

	// Verify connectivity with a primary read preference
	if err := client.Ping(ctx, readpref.Primary()); err != nil {
		client.Disconnect(ctx)
		return nil, nil, fmt.Errorf("mongodb: ping failed: %w", err)
	}

	db := client.Database(cfg.DB)

	logger.Info().
		Str("host", cfg.Host).
		Str("db", cfg.DB).
		Uint64("max_pool_size", 25).
		Uint64("min_pool_size", 5).
		Msg("MongoDB connected with connection pooling")

	return client, db, nil
}
