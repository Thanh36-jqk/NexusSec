package middleware

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
)

// LoggerMiddleware provides structured request logging via zerolog.
type LoggerMiddleware struct {
	logger zerolog.Logger
}

// NewLoggerMiddleware creates the logger middleware with an injected logger.
func NewLoggerMiddleware(logger zerolog.Logger) *LoggerMiddleware {
	return &LoggerMiddleware{logger: logger}
}

// Handler returns a Gin middleware that logs every request with:
// method, path, status code, latency, client IP, and user agent.
func (m *LoggerMiddleware) Handler() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		// Process request
		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()

		event := m.logger.Info()
		if status >= 400 && status < 500 {
			event = m.logger.Warn()
		} else if status >= 500 {
			event = m.logger.Error()
		}

		if query != "" {
			path = path + "?" + query
		}

		event.
			Str("method", c.Request.Method).
			Str("path", path).
			Int("status", status).
			Dur("latency", latency).
			Str("client_ip", c.ClientIP()).
			Str("user_agent", c.Request.UserAgent()).
			Int("body_size", c.Writer.Size()).
			Msg("request")
	}
}
