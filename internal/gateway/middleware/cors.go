package middleware

import (
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// CORSMiddleware returns a strictly configured CORS middleware.
// Only the explicitly listed origins (typically the Next.js frontend) are allowed.
type CORSMiddleware struct {
	AllowedOrigins []string
}

// NewCORSMiddleware creates a CORS middleware with the given allowed origins.
func NewCORSMiddleware(allowedOrigins []string) *CORSMiddleware {
	return &CORSMiddleware{AllowedOrigins: allowedOrigins}
}

// Handler returns the Gin handler function for CORS.
func (m *CORSMiddleware) Handler() gin.HandlerFunc {
	return cors.New(cors.Config{
		AllowOrigins:     m.AllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Request-ID"},
		ExposeHeaders:    []string{"Content-Length", "X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	})
}
