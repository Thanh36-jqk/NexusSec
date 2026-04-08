package handler

import (
	"crypto/rsa"
	"database/sql"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jmoiron/sqlx"
	"github.com/nexussec/nexussec/internal/gateway/middleware"
	"github.com/nexussec/nexussec/pkg/response"
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
	ID       string `db:"id"`
	Email    string `db:"email"`
	Username string `db:"username"`
	Password string `db:"password"` // bcrypt hash
	Role     string `db:"role"`
	IsActive bool   `db:"is_active"`
}

// ── AuthHandler ──────────────────────────────────────────────

// AuthHandler handles user registration and login.
// Dependencies are injected — no globals, no hardcoded keys.
type AuthHandler struct {
	db         *sqlx.DB
	privateKey *rsa.PrivateKey
	issuer     string
	expiration time.Duration
	logger     zerolog.Logger
}

// NewAuthHandler creates an auth handler with all required dependencies.
//
// Parameters:
//   - db:         PostgreSQL connection pool (sqlx)
//   - privateKey: RSA private key for signing JWTs (RS256)
//   - issuer:     JWT "iss" claim value (e.g., "nexussec")
//   - expiration: JWT lifetime (e.g., 24h)
//   - logger:     structured logger
func NewAuthHandler(
	db *sqlx.DB,
	privateKey *rsa.PrivateKey,
	issuer string,
	expiration time.Duration,
	logger zerolog.Logger,
) *AuthHandler {
	return &AuthHandler{
		db:         db,
		privateKey: privateKey,
		issuer:     issuer,
		expiration: expiration,
		logger:     logger.With().Str("handler", "auth").Logger(),
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
		`INSERT INTO users (email, username, password)
		 VALUES ($1, $2, $3)
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
		`SELECT id, email, username, password, role, is_active
		 FROM users WHERE email = $1`,
		req.Email,
	).Scan(&user.ID, &user.Email, &user.Username, &user.Password, &user.Role, &user.IsActive)

	if err != nil {
		if err == sql.ErrNoRows {
			// Deliberately vague message to prevent email enumeration
			response.Unauthorized(c, "invalid email or password")
			return
		}

		h.logger.Error().Err(err).Str("email", req.Email).Msg("failed to query user")
		response.InternalError(c, "login failed")
		return
	}

	// Check if account is active
	if !user.IsActive {
		response.Forbidden(c, "account is deactivated")
		return
	}

	// Verify password against bcrypt hash
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
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
		ExpiresIn:   int64(h.expiration.Seconds()),
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
			Issuer:    h.issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(h.expiration)),
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
