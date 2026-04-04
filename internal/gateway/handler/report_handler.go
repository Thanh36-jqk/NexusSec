package handler

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	"github.com/nexussec/nexussec/internal/gateway/middleware"
	"github.com/nexussec/nexussec/pkg/response"
	"github.com/rs/zerolog"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

// ── MongoDB document structs (explicit BSON mapping) ─────────

// MongoReport maps to the MongoDB document written by the Worker.
// Must stay in sync with model.Report's BSON tags.
type MongoReport struct {
	ID              primitive.ObjectID `bson:"_id"`
	Summary         MongoSummary       `bson:"summary"`
	Vulnerabilities []MongoVuln        `bson:"vulnerabilities"`
}

type MongoSummary struct {
	Total    int `bson:"total"`
	Critical int `bson:"critical"`
	High     int `bson:"high"`
	Medium   int `bson:"medium"`
	Low      int `bson:"low"`
	Info     int `bson:"info"`
}

// MongoVuln maps to the unified model.Vulnerability stored in MongoDB.
type MongoVuln struct {
	VulnID      string  `bson:"vuln_id"`
	Title       string  `bson:"title"`
	Severity    string  `bson:"severity"`
	CVSSScore   float64 `bson:"cvss_score"`
	Description string  `bson:"description"`
	Remediation string  `bson:"remediation"`
	CWE         string  `bson:"cwe"`
	Reference   string  `bson:"reference"`
	URL         string  `bson:"url"`
	Port        int     `bson:"port"`
	Protocol    string  `bson:"protocol"`
	Service     string  `bson:"service"`
	SourceTool  string  `bson:"source_tool"`
}

// ── API Response DTOs ────────────────────────────────────────

// CleanVulnerability is the unified struct returned to the frontend.
// Frontend chỉ cần đọc 1 format duy nhất — bất kể tool nào quét.
type CleanVulnerability struct {
	VulnID      string  `json:"vuln_id"`
	Name        string  `json:"name"`
	Severity    string  `json:"severity"`
	CVSSScore   float64 `json:"cvss_score,omitempty"`
	URL         string  `json:"url,omitempty"`
	Solution    string  `json:"solution,omitempty"`
	Port        int     `json:"port,omitempty"`
	Protocol    string  `json:"protocol,omitempty"`
	Service     string  `json:"service,omitempty"`
	SourceTool  string  `json:"source_tool"`
}

// SummaryResponse is the aggregated severity counts.
type SummaryResponse struct {
	Total    int `json:"total"`
	Critical int `json:"critical"`
	High     int `json:"high"`
	Medium   int `json:"medium"`
	Low      int `json:"low"`
	Info     int `json:"info"`
}

// ReportResponse is the final API response for a scan report.
type ReportResponse struct {
	ScanID          string               `json:"scan_id"`
	Summary         SummaryResponse      `json:"summary"`
	Vulnerabilities []CleanVulnerability `json:"vulnerabilities"`
}

// ── ReportHandler ────────────────────────────────────────────

// ReportHandler retrieves vulnerability reports from MongoDB,
// cross-referencing scan ownership via PostgreSQL.
type ReportHandler struct {
	pgDB    *sqlx.DB
	mongoDB *mongo.Database
	logger  zerolog.Logger
}

// NewReportHandler creates a report handler with injected dependencies.
func NewReportHandler(pg *sqlx.DB, mongoClient *mongo.Database, logger zerolog.Logger) *ReportHandler {
	return &ReportHandler{
		pgDB:    pg,
		mongoDB: mongoClient,
		logger:  logger.With().Str("handler", "report").Logger(),
	}
}

// GetReport retrieves the vulnerability report for a completed scan.
//
//	GET /api/v1/scans/:id/report
//	Response: 200 OK with vulnerabilities list
//
// Flow:
//  1. Verify scan ownership via PostgreSQL (user_id from JWT)
//  2. Check scan status = COMPLETED and report_id exists
//  3. Fetch report document from MongoDB by ObjectID
//  4. Map to clean API response
func (h *ReportHandler) GetReport(c *gin.Context) {
	scanID := c.Param("id")

	// Use the CONSTANT from middleware — not a hardcoded string
	userID, exists := c.Get(middleware.ContextKeyUserID)
	if !exists {
		response.Unauthorized(c, "user_id not found in token")
		return
	}

	userIDStr := fmt.Sprintf("%v", userID)

	var reportIDNull sql.NullString
	var status string

	// 1. Check scan ownership and status in PostgreSQL
	err := h.pgDB.QueryRowxContext(c.Request.Context(),
		"SELECT report_id, status FROM scan_jobs WHERE id = $1 AND user_id = $2",
		scanID, userIDStr).Scan(&reportIDNull, &status)

	if err == sql.ErrNoRows {
		response.NotFound(c, "scan job not found or does not belong to you")
		return
	} else if err != nil {
		h.logger.Error().Err(err).Str("scan_id", scanID).Msg("failed to query scan job")
		response.InternalError(c, "failed to look up scan job")
		return
	}

	statusUpper := strings.ToUpper(status)

	if statusUpper == "FAILED" {
		response.BadRequest(c, "scan job failed during execution — check target URL or scanner engine")
		return
	}

	if statusUpper != "COMPLETED" || !reportIDNull.Valid || reportIDNull.String == "" {
		response.BadRequest(c, fmt.Sprintf("report is not ready yet (current status: %s)", status))
		return
	}

	// 2. Parse MongoDB ObjectID
	objID, err := primitive.ObjectIDFromHex(reportIDNull.String)
	if err != nil {
		h.logger.Error().
			Str("report_id", reportIDNull.String).
			Err(err).
			Msg("invalid ObjectID format in database")
		response.InternalError(c, "invalid report ID format in database")
		return
	}

	// 3. Fetch report document from MongoDB
	var report MongoReport
	err = h.mongoDB.Collection("reports").FindOne(
		c.Request.Context(),
		bson.M{"_id": objID},
	).Decode(&report)

	if err != nil {
		if err == mongo.ErrNoDocuments {
			h.logger.Warn().Str("report_id", objID.Hex()).Msg("report document not found in MongoDB")
			response.NotFound(c, "report document not found in storage")
			return
		}
		h.logger.Error().Err(err).Str("report_id", objID.Hex()).Msg("failed to fetch report from MongoDB")
		response.InternalError(c, "failed to fetch report from storage")
		return
	}

	h.logger.Info().
		Str("scan_id", scanID).
		Str("report_id", objID.Hex()).
		Int("vuln_count", len(report.Vulnerabilities)).
		Msg("report retrieved successfully")

	// 4. Map to clean API response
	cleanVulns := make([]CleanVulnerability, 0, len(report.Vulnerabilities))
	for _, v := range report.Vulnerabilities {
		cleanVulns = append(cleanVulns, CleanVulnerability{
			VulnID:     v.VulnID,
			Name:       v.Title,
			Severity:   v.Severity,
			CVSSScore:  v.CVSSScore,
			URL:        v.URL,
			Solution:   v.Remediation,
			Port:       v.Port,
			Protocol:   v.Protocol,
			Service:    v.Service,
			SourceTool: v.SourceTool,
		})
	}

	response.Success(c, "report retrieved", ReportResponse{
		ScanID: scanID,
		Summary: SummaryResponse{
			Total:    report.Summary.Total,
			Critical: report.Summary.Critical,
			High:     report.Summary.High,
			Medium:   report.Summary.Medium,
			Low:      report.Summary.Low,
			Info:     report.Summary.Info,
		},
		Vulnerabilities: cleanVulns,
	})
}
