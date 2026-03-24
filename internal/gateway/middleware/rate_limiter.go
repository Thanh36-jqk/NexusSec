package middleware

import (
	"context"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nexussec/nexussec/pkg/response"
	"github.com/redis/go-redis/v9"
)

// FailMode determines behavior when Redis is unreachable.
type FailMode int

const (
	// FailOpen allows the request through when Redis is down.
	// Use for non-critical routes where availability > security.
	FailOpen FailMode = iota

	// FailClosed denies the request when Redis is down.
	// Use for critical routes (e.g., /scans) to prevent container exhaustion.
	FailClosed
)

// RateLimiterMiddleware implements a Redis-backed sliding window rate limiter.
// Each key tracks requests within a configurable time window.
//
// Algorithm: Sliding Window using a Redis Sorted Set (ZSET)
//   - Each request adds a timestamped member to the set
//   - Expired entries (outside the window) are pruned on each request
//   - The remaining count is compared against the limit
//
// This is more accurate than a fixed-window counter because it prevents
// burst abuse at window boundaries.
type RateLimiterMiddleware struct {
	client    *redis.Client
	limit     int           // max requests per window
	window    time.Duration // sliding window size
	keyPrefix string        // Redis key following nexussec:<service>:<feature>:<identifier>
	failMode  FailMode      // behavior when Redis is unreachable
}

// RateLimiterConfig holds the configuration for creating a rate limiter.
type RateLimiterConfig struct {
	// Limit is the maximum number of requests allowed within the Window.
	Limit int

	// Window is the duration of the sliding window (e.g., 1 * time.Minute).
	Window time.Duration

	// KeyPrefix follows the convention: nexussec:<service>:<feature>
	// The client IP is appended as the <identifier> segment.
	//
	// Examples:
	//   "nexussec:gateway:ratelimit:global"  → global API rate limit
	//   "nexussec:gateway:ratelimit:scans"   → scan-specific rate limit
	KeyPrefix string

	// FailMode determines behavior when Redis is unreachable.
	// FailOpen (default) = allow requests through.
	// FailClosed = deny requests with 503.
	FailMode FailMode
}

// NewRateLimiterMiddleware creates a rate limiter with the given Redis client and config.
func NewRateLimiterMiddleware(client *redis.Client, cfg RateLimiterConfig) *RateLimiterMiddleware {
	if cfg.KeyPrefix == "" {
		cfg.KeyPrefix = "nexussec:gateway:ratelimit:default"
	}

	return &RateLimiterMiddleware{
		client:    client,
		limit:     cfg.Limit,
		window:    cfg.Window,
		keyPrefix: cfg.KeyPrefix,
		failMode:  cfg.FailMode,
	}
}

// Handler returns a Gin middleware that enforces the rate limit.
// It identifies clients by IP address.
func (m *RateLimiterMiddleware) Handler() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Key format: nexussec:<service>:<feature>:<client_ip>
		clientIP := c.ClientIP()
		key := fmt.Sprintf("%s:%s", m.keyPrefix, clientIP)

		allowed, remaining, err := m.isAllowed(c.Request.Context(), key)
		if err != nil {
			switch m.failMode {
			case FailClosed:
				// DENY: Redis is down → block request to prevent container exhaustion
				response.InternalError(c,
					"rate limiter unavailable: service temporarily rejecting requests for safety",
				)
				return

			default: // FailOpen
				// ALLOW: Redis is down → let traffic through, set warning header
				c.Header("X-RateLimit-Status", "unavailable")
				c.Next()
				return
			}
		}

		// Set informational headers (RFC 6585 / draft-ietf-httpapi-ratelimit-headers)
		c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", m.limit))
		c.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))
		c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", time.Now().Add(m.window).Unix()))

		if !allowed {
			response.TooManyRequests(c, fmt.Sprintf(
				"rate limit exceeded: %d requests per %s. Try again later.",
				m.limit, m.window,
			))
			return
		}

		c.Next()
	}
}

// isAllowed checks if the request is within the rate limit using a Redis ZSET sliding window.
// Returns (allowed bool, remaining int, error).
func (m *RateLimiterMiddleware) isAllowed(ctx context.Context, key string) (bool, int, error) {
	now := time.Now()
	windowStart := now.Add(-m.window)

	// Use a pipeline to execute all commands atomically
	pipe := m.client.Pipeline()

	// 1. Remove entries outside the sliding window
	pipe.ZRemRangeByScore(ctx, key, "0", fmt.Sprintf("%d", windowStart.UnixNano()))

	// 2. Count current entries in the window
	countCmd := pipe.ZCard(ctx, key)

	// 3. Add current request with timestamp as score
	pipe.ZAdd(ctx, key, redis.Z{
		Score:  float64(now.UnixNano()),
		Member: fmt.Sprintf("%d", now.UnixNano()),
	})

	// 4. Set TTL on the key to auto-cleanup (window + buffer)
	pipe.Expire(ctx, key, m.window+time.Second)

	_, err := pipe.Exec(ctx)
	if err != nil {
		return false, 0, fmt.Errorf("rate limiter redis pipeline error: %w", err)
	}

	count := int(countCmd.Val())
	remaining := m.limit - count - 1 // -1 because we just added one
	if remaining < 0 {
		remaining = 0
	}

	return count < m.limit, remaining, nil
}
