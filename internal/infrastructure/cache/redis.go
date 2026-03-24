package cache

import (
	"context"
	"fmt"
	"time"

	"github.com/nexussec/nexussec/internal/infrastructure/config"
	"github.com/redis/go-redis/v9"
)

// NewRedisClient creates and verifies a Redis connection.
// Returns a connected client or an error if the connection fails.
func NewRedisClient(cfg *config.RedisConfig) (*redis.Client, error) {
	client := redis.NewClient(&redis.Options{
		Addr:         cfg.Addr(),
		Password:     cfg.Password,
		DB:           cfg.DB,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolSize:     10,
		MinIdleConns: 3,
	})

	// Verify connectivity
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis: failed to connect to %s: %w", cfg.Addr(), err)
	}

	return client, nil
}
