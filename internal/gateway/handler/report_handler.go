package handler

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

// CleanVulnerability là struct đã được làm sạch để trả về cho Frontend
type CleanVulnerability struct {
	Name     string `json:"name"`
	Severity string `json:"severity"`
	URL      string `json:"url,omitempty"`
	Solution string `json:"solution"`
}

type MongoReport struct {
	ID              primitive.ObjectID `bson:"_id"`
	Vulnerabilities []MongoVuln        `bson:"vulnerabilities"`
}

type MongoVuln struct {
	Title       string `bson:"title"`
	Severity    string `bson:"severity"`
	Description string `bson:"description"`
	Remediation string `bson:"remediation"`
	CWE         string `bson:"cwe"`
	Reference   string `bson:"reference"`
	URL         string `bson:"url"` // <-- ADD THIS LINE
}

// ReportResponse là response cuối cùng trả về cho Frontend
type ReportResponse struct {
	ScanID          string               `json:"scan_id"`
	TotalVulns      int                  `json:"total_vulnerabilities"`
	Vulnerabilities []CleanVulnerability `json:"vulnerabilities"`
}

type ReportHandler struct {
	pgDB    *sqlx.DB
	mongoDB *mongo.Database
}

func NewReportHandler(pg *sqlx.DB, mongoClient *mongo.Database) *ReportHandler {
	return &ReportHandler{pgDB: pg, mongoDB: mongoClient}
}

func (h *ReportHandler) GetReport(c *gin.Context) {
	scanID := c.Param("id")

	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	userIDStr := fmt.Sprintf("%v", userID)

	var reportIDNull sql.NullString
	var status string

	// 1. Kiểm tra trạng thái và report_id trong Postgres
	err := h.pgDB.QueryRowxContext(c.Request.Context(),
		"SELECT report_id, status FROM scan_jobs WHERE id = $1 AND user_id = $2",
		scanID, userIDStr).Scan(&reportIDNull, &status)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "scan job not found or unauthorized"})
		return
	} else if err != nil {
		log.Printf("[GetReport] Postgres Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	statusUpper := strings.ToUpper(status)

	if statusUpper == "FAILED" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":          "scan job failed during execution. Please check target URL or scanner engine.",
			"current_status": status,
		})
		return
	}

	if statusUpper != "COMPLETED" || !reportIDNull.Valid || reportIDNull.String == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":          "report is not ready yet",
			"current_status": status,
		})
		return
	}

	objID, err := primitive.ObjectIDFromHex(reportIDNull.String)
	if err != nil {
		log.Printf("[GetReport] Invalid ObjectID hex: %q, err: %v", reportIDNull.String, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid report ID format in database"})
		return
	}

	// 2. Truy vấn MongoDB với Explicit Struct
	var report MongoReport

	err = h.mongoDB.Collection("reports").FindOne(c.Request.Context(), bson.M{"_id": objID}).Decode(&report)

	if err != nil {
		if err == mongo.ErrNoDocuments {
			log.Printf("[GetReport] MongoDB Error: Document not found for ID %s", objID.Hex())
			c.JSON(http.StatusNotFound, gin.H{"error": "report document not found in storage"})
			return
		}
		log.Printf("[GetReport] MongoDB Error: Failed to decode document ID %s: %v", objID.Hex(), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch report from storage"})
		return
	}

	// 3. LOG ĐIỀU TRA (CRITICAL)
	log.Printf("[GetReport] Decode OK | vulnerabilities_count=%d | report_id=%s", len(report.Vulnerabilities), objID.Hex())

	// 4. Mapping dữ liệu chuẩn hóa
	cleanVulns := make([]CleanVulnerability, 0, len(report.Vulnerabilities))
	for _, v := range report.Vulnerabilities {
		cleanVulns = append(cleanVulns, CleanVulnerability{
			Name:     v.Title,
			Severity: v.Severity,
			Solution: v.Remediation,
			URL:      v.URL,
		})
	}

	c.JSON(http.StatusOK, ReportResponse{
		ScanID:          scanID,
		TotalVulns:      len(cleanVulns),
		Vulnerabilities: cleanVulns,
	})
}
