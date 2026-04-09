package middleware

import (
	"crypto/rsa"
	"errors"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/nexussec/nexussec/pkg/response"
)

// ContextKey constants for extracting user info from Gin context.
const (
	ContextKeyUserID = "user_id"
	ContextKeyEmail  = "email"
	ContextKeyRole   = "role"
)

// Claims represents the JWT payload structure.
type Claims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

// JWTAuthMiddleware validates RS256-signed JWT tokens from the Authorization header.
// The Gateway uses the RSA Public Key to VERIFY tokens.
// Only the Auth Service holds the Private Key to SIGN tokens.
//
// Dependencies are injected — no globals, no hardcoded keys.
type JWTAuthMiddleware struct {
	publicKey *rsa.PublicKey
	issuer    string
}

// NewJWTAuthMiddleware creates a JWT middleware that verifies RS256 tokens
// using the provided RSA public key.
//
// Parameters:
//   - publicKey: RSA public key parsed from PEM (see ParseRSAPublicKey)
//   - issuer:    expected "iss" claim value (e.g., "nexussec")
func NewJWTAuthMiddleware(publicKey *rsa.PublicKey, issuer string) *JWTAuthMiddleware {
	return &JWTAuthMiddleware{
		publicKey: publicKey,
		issuer:    issuer,
	}
}

// Handler returns a Gin middleware that:
//  1. Extracts the Bearer token from the Authorization header
//  2. Validates the RS256 signature using the injected public key
//  3. Validates expiration, issuer, and required claims
//  4. Sets user claims (user_id, email, role) in the Gin context
//  5. Aborts with 401 if any step fails
func (m *JWTAuthMiddleware) Handler() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString, err := extractBearerToken(c)
		if err != nil {
			response.Unauthorized(c, err.Error())
			return
		}

		claims, err := m.parseAndValidate(tokenString)
		if err != nil {
			response.Unauthorized(c, "invalid or expired token")
			return
		}

		// Inject claims into Gin context for downstream handlers
		c.Set(ContextKeyUserID, claims.UserID)
		c.Set(ContextKeyEmail, claims.Email)
		c.Set(ContextKeyRole, claims.Role)

		c.Next()
	}
}

// extractBearerToken pulls the token from "Authorization: Bearer <token>" or cookie.
func extractBearerToken(c *gin.Context) (string, error) {
	// 1. Try Cookie first
	if token, err := c.Cookie("nexussec_token"); err == nil && token != "" {
		return token, nil
	}

	// 2. Try Authorization Header
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		return "", errors.New("authorization header or cookie is required")
	}

	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return "", errors.New("authorization header must be in 'Bearer <token>' format")
	}

	token := strings.TrimSpace(parts[1])
	if token == "" {
		return "", errors.New("token is empty")
	}

	return token, nil
}

// parseAndValidate parses the JWT string and validates its claims using RS256.
func (m *JWTAuthMiddleware) parseAndValidate(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (any, error) {
		// CRITICAL: Enforce RS256 to prevent algorithm-switching attacks.
		// An attacker could set alg=HS256 and sign with the public key as a
		// symmetric secret. Pinning to RS256 blocks this entirely.
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, errors.New("unexpected signing method: expected RS256")
		}
		return m.publicKey, nil
	},
		jwt.WithIssuer(m.issuer),
		jwt.WithValidMethods([]string{"RS256"}),
	)
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token claims")
	}

	if claims.UserID == "" {
		return nil, errors.New("token missing user_id claim")
	}

	return claims, nil
}

// ParseRSAPublicKey parses a PEM-encoded RSA public key.
// Use this at startup to load the key from file/env before injecting into the middleware.
//
// Example:
//
//	pubKeyBytes, _ := os.ReadFile("keys/public.pem")
//	pubKey, err := middleware.ParseRSAPublicKey(pubKeyBytes)
//	jwtMw := middleware.NewJWTAuthMiddleware(pubKey, "nexussec")
func ParseRSAPublicKey(pemBytes []byte) (*rsa.PublicKey, error) {
	key, err := jwt.ParseRSAPublicKeyFromPEM(pemBytes)
	if err != nil {
		return nil, errors.New("jwt: failed to parse RSA public key from PEM")
	}
	return key, nil
}

// ParseRSAPrivateKey parses a PEM-encoded RSA private key.
// Used by the Auth Service to SIGN tokens. The Gateway does NOT need this.
//
// Example:
//
//	privKeyBytes, _ := os.ReadFile("keys/private.pem")
//	privKey, err := middleware.ParseRSAPrivateKey(privKeyBytes)
func ParseRSAPrivateKey(pemBytes []byte) (*rsa.PrivateKey, error) {
	key, err := jwt.ParseRSAPrivateKeyFromPEM(pemBytes)
	if err != nil {
		return nil, errors.New("jwt: failed to parse RSA private key from PEM")
	}
	return key, nil
}
