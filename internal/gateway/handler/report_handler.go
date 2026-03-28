package handler

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

// 1. Struct dùng để hứng dữ liệu thô (Raw) cất trong MongoDB do ZAP nhả ra
type ZAPRawReport struct {
	ID   primitive.ObjectID `bson:"_id"`
	Site []struct {
		Host   string `bson:"@host"`
		Alerts []struct {
			Name      string `bson:"name"`
			RiskDesc  string `bson:"riskdesc"`
			Solution  string `bson:"solution"`
			Instances []struct {
				URI string `bson:"uri"`
			} `bson:"instances"`
		} `bson:"alerts"`
	} `bson:"site"`
}

// 2. Struct dùng để biểu diễn một lỗ hổng đã được "làm sạch"
type CleanVulnerability struct {
	Name     string `json:"name"`
	Severity string `json:"severity"`
	URL      string `json:"url,omitempty"`
	Solution string `json:"solution"`
}

// 3. Struct dùng để trả về toàn bộ báo cáo cuối cùng cho Frontend
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
		fmt.Printf("Database Error: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	// Chuyển status sang chữ hoa để so sánh, tránh lỗi "completed" vs "COMPLETED"
	statusUpper := strings.ToUpper(status)

	// --- ĐÂY LÀ PHẦN QUAN TRỌNG NHẤT VỪA THÊM VÀO ---
	if statusUpper == "FAILED" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":          "scan job failed during execution. Please check target URL or scanner engine.",
			"current_status": status,
		})
		return
	}

	// Nếu không phải FAILED, check tiếp xem đã COMPLETED chưa
	if statusUpper != "COMPLETED" || !reportIDNull.Valid || reportIDNull.String == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":          "report is not ready yet",
			"current_status": status,
		})
		return
	}
	// ------------------------------------------------

	objID, err := primitive.ObjectIDFromHex(reportIDNull.String)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid report ID format in database"})
		return
	}

	// 2. Truy vấn MongoDB để lấy dữ liệu báo cáo chi tiết
	var rawReport ZAPRawReport
	err = h.mongoDB.Collection("reports").FindOne(c.Request.Context(), bson.M{"_id": objID}).Decode(&rawReport)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch report from storage"})
		return
	}

	// 3. Lọc dữ liệu (Mapping sang DTO sạch sẽ cho Frontend)
	var cleanVulns []CleanVulnerability
	if len(rawReport.Site) > 0 {
		for _, alert := range rawReport.Site[0].Alerts {
			vuln := CleanVulnerability{
				Name:     alert.Name,
				Severity: alert.RiskDesc,
				Solution: alert.Solution,
			}
			if len(alert.Instances) > 0 {
				vuln.URL = alert.Instances[0].URI
			}
			cleanVulns = append(cleanVulns, vuln)
		}
	}

	if cleanVulns == nil {
		cleanVulns = []CleanVulnerability{}
	}

	c.JSON(http.StatusOK, ReportResponse{
		ScanID:          scanID,
		TotalVulns:      len(cleanVulns),
		Vulnerabilities: cleanVulns,
	})
}
