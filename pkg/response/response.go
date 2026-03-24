package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Response is the standardized JSON envelope for all API responses.
//
//	{
//	  "status":  "success" | "error",
//	  "code":    200,
//	  "message": "descriptive message",
//	  "data":    { ... } | null
//	}
type Response struct {
	Status  string `json:"status"`
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data"`
}

// Success sends a 200 OK response with data.
func Success(c *gin.Context, message string, data any) {
	c.JSON(http.StatusOK, Response{
		Status:  "success",
		Code:    http.StatusOK,
		Message: message,
		Data:    data,
	})
}

// Created sends a 201 Created response with data.
func Created(c *gin.Context, message string, data any) {
	c.JSON(http.StatusCreated, Response{
		Status:  "success",
		Code:    http.StatusCreated,
		Message: message,
		Data:    data,
	})
}

// Accepted sends a 202 Accepted response (for async operations).
func Accepted(c *gin.Context, message string, data any) {
	c.JSON(http.StatusAccepted, Response{
		Status:  "success",
		Code:    http.StatusAccepted,
		Message: message,
		Data:    data,
	})
}

// Error sends an error response with the given HTTP status code.
func Error(c *gin.Context, code int, message string) {
	c.AbortWithStatusJSON(code, Response{
		Status:  "error",
		Code:    code,
		Message: message,
		Data:    nil,
	})
}

// BadRequest sends a 400 Bad Request error.
func BadRequest(c *gin.Context, message string) {
	Error(c, http.StatusBadRequest, message)
}

// Unauthorized sends a 401 Unauthorized error.
func Unauthorized(c *gin.Context, message string) {
	Error(c, http.StatusUnauthorized, message)
}

// Forbidden sends a 403 Forbidden error.
func Forbidden(c *gin.Context, message string) {
	Error(c, http.StatusForbidden, message)
}

// NotFound sends a 404 Not Found error.
func NotFound(c *gin.Context, message string) {
	Error(c, http.StatusNotFound, message)
}

// TooManyRequests sends a 429 Too Many Requests error.
func TooManyRequests(c *gin.Context, message string) {
	Error(c, http.StatusTooManyRequests, message)
}

// InternalError sends a 500 Internal Server Error.
func InternalError(c *gin.Context, message string) {
	Error(c, http.StatusInternalServerError, message)
}
