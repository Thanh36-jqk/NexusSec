package handler

import (
	"context"
	"crypto/rsa"
	"database/sql"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jmoiron/sqlx"
	"github.com/nexussec/nexussec/internal/infrastructure/config"
	"github.com/nexussec/nexussec/internal/gateway/middleware"
	"github.com/nexussec/nexussec/pkg/response"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"golang.org/x/crypto/bcrypt"
)

// ── Request / Response DTOs ──────────────────────────────────

type registerRequest struct {
	Email    string `json:"email"    binding:"required,email"`
	Username string `json:"username" binding:"required,min=3,max=100"`
	Password string `json:"password" binding:"required,min=8,max=72"`
}

type loginRequest struct {
	Email    string `json:"email"    binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type authResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int64  `json:"expires_in"` // seconds
}

type userResponse struct {
	ID       string `json:"id"`
	Email    string `json:"email"`
	Username string `json:"username"`
	Role     string `json:"role"`
}

// ── Database Row ─────────────────────────────────────────────

type userRow struct {
	ID           string  `db:"id"`
	Email        string  `db:"email"`
	Username     string  `db:"username"`
	Password     *string `db:"password"` // bcrypt hash, nullable for OAuth
	Role         string  `db:"role"`
	IsActive     bool    `db:"is_active"`
	IsVerified   bool    `db:"is_verified"`
	AuthProvider string  `db:"auth_provider"`
	ProviderID   *string `db:"provider_id"`
}

// ── AuthHandler ──────────────────────────────────────────────

// AuthHandler handles user registration and login.
// Dependencies are injected — no globals, no hardcoded keys.
type AuthHandler struct {
	db          *sqlx.DB
	redis       *redis.Client
	privateKey  *rsa.PrivateKey
	jwtCfg      *config.JWTConfig
	smtpCfg     *config.SMTPConfig
	oauthCfg    *config.OAuthConfig
	frontendURL string
	logger      zerolog.Logger
}

func NewAuthHandler(
	db *sqlx.DB,
	redisClient *redis.Client,
	privateKey *rsa.PrivateKey,
	jwtCfg *config.JWTConfig,
	smtpCfg *config.SMTPConfig,
	oauthCfg *config.OAuthConfig,
	frontendURL string,
	logger zerolog.Logger,
) *AuthHandler {
	return &AuthHandler{
		db:          db,
		redis:       redisClient,
		privateKey:  privateKey,
		jwtCfg:      jwtCfg,
		smtpCfg:     smtpCfg,
		oauthCfg:    oauthCfg,
		frontendURL: frontendURL,
		logger:      logger.With().Str("handler", "auth").Logger(),
	}
}

// ── Register ─────────────────────────────────────────────────

// Register creates a new user account.
//
//	POST /api/v1/auth/register
//	Request:  { "email": "...", "username": "...", "password": "..." }
//	Response: 201 Created with user info
//
// Password is hashed with bcrypt (cost=12) before storage.
// Returns 409 Conflict if email or username already exists.
func (h *AuthHandler) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	// Normalize email to lowercase
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Username = strings.TrimSpace(req.Username)

	// Hash password with bcrypt (cost=12 balances security and speed)
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		h.logger.Error().Err(err).Msg("failed to hash password")
		response.InternalError(c, "failed to process registration")
		return
	}

	// Insert user — PostgreSQL UNIQUE constraints handle duplicates
	var user userRow
	err = h.db.QueryRowContext(c.Request.Context(),
		`INSERT INTO users (email, username, password, is_verified, auth_provider)
		 VALUES ($1, $2, $3, false, 'local')
		 RETURNING id, email, username, role`,
		req.Email, req.Username, string(hashedPassword),
	).Scan(&user.ID, &user.Email, &user.Username, &user.Role)

	if err != nil {
		// Check for unique constraint violations
		if strings.Contains(err.Error(), "duplicate key") {
			if strings.Contains(err.Error(), "email") {
				response.Error(c, 409, "email already registered")
			} else if strings.Contains(err.Error(), "username") {
				response.Error(c, 409, "username already taken")
			} else {
				response.Error(c, 409, "user already exists")
			}
			return
		}

		h.logger.Error().Err(err).Msg("failed to insert user")
		response.InternalError(c, "failed to create user")
		return
	}

	// Generate 6-digit OTP
	otp := fmt.Sprintf("%06d", rand.Intn(1000000))
	
	// Save to Redis (ttl = 15m)
	cacheKey := fmt.Sprintf("nexussec:email_verify:%s", user.Email)
	err = h.redis.Set(context.Background(), cacheKey, otp, 15*time.Minute).Err()
	if err != nil {
		h.logger.Error().Err(err).Msg("failed to save OTP to redis")
	} else {
		// Send async email
		go h.sendVerificationEmail(user.Email, user.Username, otp)
	}

	h.logger.Info().
		Str("user_id", user.ID).
		Str("email", user.Email).
		Msg("user registered successfully")

	response.Created(c, "user registered successfully", userResponse{
		ID:       user.ID,
		Email:    user.Email,
		Username: user.Username,
		Role:     user.Role,
	})
}

// ── Login ────────────────────────────────────────────────────

// Login authenticates a user and returns a signed JWT.
//
//	POST /api/v1/auth/login
//	Request:  { "email": "...", "password": "..." }
//	Response: 200 OK with access_token (RS256 signed)
//
// Returns 401 Unauthorized if credentials are invalid.
// Returns 403 Forbidden if the account is deactivated.
func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	// Look up user by email (uses idx_users_email index)
	var user userRow
	err := h.db.QueryRowContext(c.Request.Context(),
		`SELECT id, email, username, password, role, is_active, is_verified, auth_provider
		 FROM users WHERE email = $1`,
		req.Email,
	).Scan(&user.ID, &user.Email, &user.Username, &user.Password, &user.Role, &user.IsActive, &user.IsVerified, &user.AuthProvider)

	if err != nil {
		if err == sql.ErrNoRows {
			response.Unauthorized(c, "invalid email or password")
			return
		}
		h.logger.Error().Err(err).Str("email", req.Email).Msg("failed to query user")
		response.InternalError(c, "login failed")
		return
	}

	if !user.IsActive {
		response.Forbidden(c, "account is deactivated")
		return
	}

	if !user.IsVerified && user.AuthProvider == "local" {
		response.Error(c, 403, "email_not_verified")
		return
	}
	
	if user.Password == nil {
		response.Unauthorized(c, "please use social login for this account")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*user.Password), []byte(req.Password)); err != nil {
		response.Unauthorized(c, "invalid email or password")
		return
	}

	// Generate JWT (RS256 signed with private key)
	token, err := h.generateToken(user)
	if err != nil {
		h.logger.Error().Err(err).Str("user_id", user.ID).Msg("failed to generate JWT")
		response.InternalError(c, "failed to generate token")
		return
	}

	h.logger.Info().
		Str("user_id", user.ID).
		Str("email", user.Email).
		Msg("user logged in successfully")

	response.Success(c, "login successful", authResponse{
		AccessToken: token,
		TokenType:   "Bearer",
		ExpiresIn:   int64(h.jwtCfg.Expiration.Seconds()),
	})
}

// ── JWT Generation ───────────────────────────────────────────

// generateToken creates an RS256-signed JWT with user claims.
//
// Claims:
//   - user_id: UUID from PostgreSQL
//   - email:   user's email address
//   - role:    user's role (user/admin)
//   - iss:     issuer (e.g., "nexussec")
//   - exp:     expiration timestamp
//   - iat:     issued-at timestamp
func (h *AuthHandler) generateToken(user userRow) (string, error) {
	now := time.Now()

	claims := middleware.Claims{
		UserID: user.ID,
		Email:  user.Email,
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    h.jwtCfg.Issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(h.jwtCfg.Expiration)),
		},
	}

	// CRITICAL: Sign with RS256 and the RSA private key.
	// Only this service holds the private key.
	// The Gateway (and other services) verify with the public key only.
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)

	return token.SignedString(h.privateKey)
}

// ── Me ───────────────────────────────────────────────────────

// Me returns the profile information of the currently authenticated user.
//
//	GET /api/v1/auth/me
//	Response: 200 OK with user info
func (h *AuthHandler) Me(c *gin.Context) {
	userID := c.GetString(middleware.ContextKeyUserID)
	if userID == "" {
		response.Unauthorized(c, "unauthorized")
		return
	}

	var user userRow
	err := h.db.QueryRowContext(c.Request.Context(),
		`SELECT id, email, username, role FROM users WHERE id = $1`,
		userID,
	).Scan(&user.ID, &user.Email, &user.Username, &user.Role)

	if err != nil {
		if err == sql.ErrNoRows {
			response.Unauthorized(c, "user not found")
			return
		}
		h.logger.Error().Err(err).Str("user_id", userID).Msg("failed to query user for /me")
		response.InternalError(c, "failed to get profile")
		return
	}

	response.Success(c, "profile retrieved", userResponse{
		ID:       user.ID,
		Email:    user.Email,
		Username: user.Username,
		Role:     user.Role,
	})
}

// ── Change Password ──────────────────────────────────────────

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password"     binding:"required,min=8,max=72"`
}

// ChangePassword updates the authenticated user's password.
//
//	PUT /api/v1/auth/password
//	Body: { "current_password": "...", "new_password": "..." }
//	Response: 200 OK
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID := c.GetString(middleware.ContextKeyUserID)
	if userID == "" {
		response.Unauthorized(c, "unauthorized")
		return
	}

	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "current_password and new_password (min 8 chars) are required")
		return
	}

	// Fetch current hash
	var currentHash string
	err := h.db.QueryRowContext(c.Request.Context(),
		`SELECT password FROM users WHERE id = $1`, userID,
	).Scan(&currentHash)
	if err != nil {
		if err == sql.ErrNoRows {
			response.Unauthorized(c, "user not found")
			return
		}
		h.logger.Error().Err(err).Str("user_id", userID).Msg("failed to query user for password change")
		response.InternalError(c, "failed to change password")
		return
	}

	// Verify current password
	if err := bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(req.CurrentPassword)); err != nil {
		response.BadRequest(c, "current password is incorrect")
		return
	}

	// Hash new password
	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		h.logger.Error().Err(err).Msg("failed to hash new password")
		response.InternalError(c, "failed to change password")
		return
	}

	// Update
	_, err = h.db.ExecContext(c.Request.Context(),
		`UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2`,
		string(newHash), userID,
	)
	if err != nil {
		h.logger.Error().Err(err).Str("user_id", userID).Msg("failed to update password")
		response.InternalError(c, "failed to change password")
		return
	}

	h.logger.Info().Str("user_id", userID).Msg("password changed successfully")
	response.Success(c, "password updated", nil)
}
