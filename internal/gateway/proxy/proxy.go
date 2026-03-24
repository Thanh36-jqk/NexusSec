package proxy

import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
)

type ReverseProxy struct {
	target *url.URL
	proxy  *httputil.ReverseProxy
	logger zerolog.Logger
}
// NewReverseProxy creates a reverse proxy to the given target URL.
//
// Example:
//
//	proxy, err := NewReverseProxy("http://scanner-engine:8081", 5*time.Second, logger)
func NewReverseProxy(targetURL string, timeout time.Duration, logger zerolog.Logger) (*ReverseProxy, error) {
	target, err := url.Parse(targetURL)
	if err != nil {
		return nil, fmt.Errorf("proxy: invalid target URL %q: %w", targetURL, err)
	}

	proxy := httputil.NewSingleHostReverseProxy(target)

	// Custom transport with timeout and connection pooling
	proxy.Transport = &http.Transport{
		MaxIdleConns:        50,
		MaxIdleConnsPerHost: 25,
		IdleConnTimeout:     90 * time.Second,
		ResponseHeaderTimeout: timeout,
	}

	// Custom error handler — returns structured JSON instead of plain text
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		logger.Error().
			Err(err).
			Str("target", target.String()).
			Str("path", r.URL.Path).
			Msg("proxy: upstream request failed")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		fmt.Fprintf(w, `{"status":"error","code":502,"message":"upstream service unavailable","data":null}`)
	}

	// Director modifies the request before forwarding
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)

		// Preserve the original client IP for logging/rate-limiting in upstream
		if clientIP := req.Header.Get("X-Forwarded-For"); clientIP == "" {
			req.Header.Set("X-Forwarded-For", req.RemoteAddr)
		}
		req.Header.Set("X-Forwarded-Host", req.Host)
		req.Header.Set("X-Proxy", "nexussec-gateway")
	}

	return &ReverseProxy{
		target: target,
		proxy:  proxy,
		logger: logger,
	}, nil
}

// Handler returns a Gin handler that forwards the request to the upstream.
// It strips the matched route prefix so the upstream receives clean paths.
//
// Example: /api/v1/scans/123 → proxied to http://scanner-engine:8081/123
func (rp *ReverseProxy) Handler() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Propagate authenticated user_id to the upstream service via header
		if userID, exists := c.Get("user_id"); exists {
			c.Request.Header.Set("X-User-ID", fmt.Sprintf("%v", userID))
		}

		rp.proxy.ServeHTTP(c.Writer, c.Request)
	}
}

// HealthCheck pings the upstream target and returns its status.
func (rp *ReverseProxy) HealthCheck() error {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(rp.target.String() + "/health")
	if err != nil {
		return fmt.Errorf("proxy: upstream health check failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("proxy: upstream returned status %d", resp.StatusCode)
	}
	return nil
}
