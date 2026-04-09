package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nexussec/nexussec/pkg/response"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"
	"golang.org/x/oauth2/google"
	"gopkg.in/gomail.v2"
)

type verifyEmailRequest struct {
	Email string `json:"email" binding:"required,email"`
	OTP   string `json:"otp" binding:"required,len=6"`
}

// ── Background Workers ───────────────────────────────────────

func (h *AuthHandler) sendVerificationEmail(to, username, otp string) {
	m := gomail.NewMessage()
	// Usually SMTP_USER is the sender, or a configured "From" address.
	// For SendGrid, it needs to be a verified sender in the console.
	// We will use a dummy one for now or assume SMTP_USER works if it's an email format.
	m.SetHeader("From", "noreply@nexussec.me")
	m.SetHeader("To", to)
	m.SetHeader("Subject", "Verify your NexusSec Account")
	m.SetBody("text/html", fmt.Sprintf(`
		<div style="font-family: sans-serif;">
			<h2>Welcome to NexusSec, %s!</h2>
			<p>Your verification code is: <b style="font-size: 24px; color: #4f46e5;">%s</b></p>
			<p>This code will expire in 15 minutes.</p>
		</div>
	`, username, otp))

	d := gomail.NewDialer(h.smtpCfg.Host, h.smtpCfg.Port, h.smtpCfg.User, h.smtpCfg.Password)

	if err := d.DialAndSend(m); err != nil {
		h.logger.Error().Err(err).Str("email", to).Msg("failed to send verification email")
	} else {
		h.logger.Info().Str("email", to).Msg("verification email sent successfully")
	}
}

// ── Verify Email ─────────────────────────────────────────────

func (h *AuthHandler) VerifyEmail(c *gin.Context) {
	var req verifyEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "email and 6-digit otp are required")
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	cacheKey := fmt.Sprintf("nexussec:email_verify:%s", req.Email)
	savedOtp, err := h.redis.Get(context.Background(), cacheKey).Result()
	if err != nil {
		h.logger.Warn().Str("email", req.Email).Msg("otp not found or expired")
		response.BadRequest(c, "invalid or expired OTP")
		return
	}

	if savedOtp != req.OTP {
		response.BadRequest(c, "incorrect OTP")
		return
	}

	// Update DB
	res, err := h.db.ExecContext(c.Request.Context(), `UPDATE users SET is_verified = TRUE WHERE email = $1`, req.Email)
	if err != nil {
		h.logger.Error().Err(err).Msg("failed to verify user in db")
		response.InternalError(c, "verification failed")
		return
	}

	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		response.BadRequest(c, "user not found")
		return
	}

	// Delete from Redis
	h.redis.Del(context.Background(), cacheKey)

	response.Success(c, "email verified successfully. you can now log in.", nil)
}

// ── OAuth Configurations ─────────────────────────────────────

func (h *AuthHandler) getGithubOauthConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     h.oauthCfg.GithubClientID,
		ClientSecret: h.oauthCfg.GithubClientSecret,
		RedirectURL:  h.frontendURL + "/api/v1/auth/github/callback", // Note: Usually proxying through gateway. This assumes the gateway handles API calls at the frontend URL via proxy
		Scopes:       []string{"user:email"},
		Endpoint:     github.Endpoint,
	}
}

func (h *AuthHandler) getGoogleOauthConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     h.oauthCfg.GoogleClientID,
		ClientSecret: h.oauthCfg.GoogleClientSecret,
		RedirectURL:  h.frontendURL + "/api/v1/auth/google/callback",
		Scopes:       []string{"https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"},
		Endpoint:     google.Endpoint,
	}
}

// ── GitHub Login ─────────────────────────────────────────────

func (h *AuthHandler) OAuthGitHubLogin(c *gin.Context) {
	url := h.getGithubOauthConfig().AuthCodeURL("state-github")
	c.Redirect(http.StatusTemporaryRedirect, url)
}

func (h *AuthHandler) OAuthGitHubCallback(c *gin.Context) {
	code := c.Query("code")
	if code == "" {
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=missing_code")
		return
	}

	token, err := h.getGithubOauthConfig().Exchange(context.Background(), code)
	if err != nil {
		h.logger.Error().Err(err).Msg("github exchange failed")
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=exchange_failed")
		return
	}

	client := h.getGithubOauthConfig().Client(context.Background(), token)
	resp, err := client.Get("https://api.github.com/user/emails")
	if err != nil {
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=github_api_failed")
		return
	}
	defer resp.Body.Close()

	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=github_parse_failed")
		return
	}

	var primaryEmail string
	for _, e := range emails {
		if e.Primary && e.Verified {
			primaryEmail = e.Email
			break
		}
	}

	if primaryEmail == "" {
		for _, e := range emails {
			if e.Verified {
				primaryEmail = e.Email
				break
			}
		}
	}

	if primaryEmail == "" {
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=no_email")
		return
	}

	h.processOAuthLogin(c, primaryEmail, primaryEmail, "github", primaryEmail) // Using email as provider ID for simplicity
}

// ── Google Login ─────────────────────────────────────────────

func (h *AuthHandler) OAuthGoogleLogin(c *gin.Context) {
	url := h.getGoogleOauthConfig().AuthCodeURL("state-google")
	c.Redirect(http.StatusTemporaryRedirect, url)
}

func (h *AuthHandler) OAuthGoogleCallback(c *gin.Context) {
	code := c.Query("code")
	if code == "" {
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=missing_code")
		return
	}

	token, err := h.getGoogleOauthConfig().Exchange(context.Background(), code)
	if err != nil {
		h.logger.Error().Err(err).Msg("google exchange failed")
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=exchange_failed")
		return
	}

	client := h.getGoogleOauthConfig().Client(context.Background(), token)
	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=google_api_failed")
		return
	}
	defer resp.Body.Close()

	var userInfo struct {
		Email         string `json:"email"`
		Id            string `json:"id"`
		Name          string `json:"name"`
		VerifiedEmail bool   `json:"verified_email"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&userInfo); err != nil {
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=google_parse_failed")
		return
	}

	if userInfo.Email == "" || !userInfo.VerifiedEmail {
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=unverified_email")
		return
	}

	h.processOAuthLogin(c, userInfo.Email, userInfo.Name, "google", userInfo.Id)
}

// ── Shared OAuth Login ───────────────────────────────────────

func (h *AuthHandler) processOAuthLogin(c *gin.Context, email, rawName, provider, providerID string) {
	email = strings.ToLower(strings.TrimSpace(email))
	username := strings.ReplaceAll(strings.ToLower(rawName), " ", "_")
	if username == "" {
		username = strings.Split(email, "@")[0]
	}

	// 1. Check if user exists
	var user userRow
	err := h.db.QueryRowContext(c.Request.Context(),
		`SELECT id, email, username, password, role, is_active, is_verified, auth_provider
		 FROM users WHERE email = $1`,
		email,
	).Scan(&user.ID, &user.Email, &user.Username, &user.Password, &user.Role, &user.IsActive, &user.IsVerified, &user.AuthProvider)

	if err != nil {
		if err == sql.ErrNoRows {
			// Account doesn't exist, create it
			err = h.db.QueryRowContext(c.Request.Context(),
				`INSERT INTO users (email, username, password, is_verified, auth_provider, provider_id)
				 VALUES ($1, $2, NULL, true, $3, $4)
				 RETURNING id, email, username, role, is_active, is_verified, auth_provider`,
				email, username, provider, providerID,
			).Scan(&user.ID, &user.Email, &user.Username, &user.Role, &user.IsActive, &user.IsVerified, &user.AuthProvider)

			if err != nil {
				h.logger.Error().Err(err).Msg("failed to create oauth user")
				// Try falling back to random username if unique violation
				if strings.Contains(err.Error(), "users_username_key") {
					username = fmt.Sprintf("%s_%d", username, time.Now().Unix())
					err = h.db.QueryRowContext(c.Request.Context(),
						`INSERT INTO users (email, username, password, is_verified, auth_provider, provider_id)
						 VALUES ($1, $2, NULL, true, $3, $4)
						 RETURNING id, email, username, role, is_active, is_verified, auth_provider`,
						email, username, provider, providerID,
					).Scan(&user.ID, &user.Email, &user.Username, &user.Role, &user.IsActive, &user.IsVerified, &user.AuthProvider)
				}
				
				if err != nil {
					c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=account_creation_failed")
					return
				}
			}
		} else {
			h.logger.Error().Err(err).Msg("failed to query oauth user")
			c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=database_error")
			return
		}
	} else {
		// User exists. Account Linking: Update provider ID if missing (or even if local, they just logged in with social)
		if user.AuthProvider == "local" || user.ProviderID == nil {
			if !user.IsVerified {
				// Alice registered locally but didn't verify OTP. Bob mapped Alice's email to his GitHub account to steal it.
				// BLOCK linking because local owner hasn't proven ownership of that email yet!
				c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=account_not_verified_for_linking")
				return
			}
			h.db.ExecContext(c.Request.Context(), `UPDATE users SET auth_provider = $1, provider_id = $2, is_verified = true WHERE id = $3`, provider, providerID, user.ID)
		}
	}

	if !user.IsActive {
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=account_deactivated")
		return
	}

	// 2. Generate JWT
	token, err := h.generateToken(user)
	if err != nil {
		h.logger.Error().Err(err).Msg("failed to generate token for oauth")
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/login?error=token_generation_failed")
		return
	}

	// 3. Set HttpOnly Cookie
	// The domain should ideally be '.nexussec.me' if frontendURL is 'nexussec.me'
	// For now, let Gin set the default domain based on the request host.
	secure := true
	if strings.Contains(h.frontendURL, "localhost") {
		secure = false
	}
	
	// MaxAge is in seconds. Exp is 24 hours.
	maxAge := int(h.jwtCfg.Expiration.Seconds())
	c.SetCookie("nexussec_token", token, maxAge, "/", "", secure, true)

	// 4. Redirect to Dashboard
	c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"/dashboard")
}
