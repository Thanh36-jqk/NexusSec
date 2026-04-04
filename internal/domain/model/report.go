package model

import (
	"context"
	"time"
)

// Report represents a vulnerability report stored in MongoDB.
// This is the unified output regardless of which scan tool produced it.
type Report struct {
	ID              string          `json:"id" bson:"_id,omitempty"`
	ScanJobID       string          `json:"scan_job_id" bson:"scan_job_id"`
	TargetURL       string          `json:"target_url" bson:"target_url"`
	ScanType        string          `json:"scan_type" bson:"scan_type"`
	Summary         ReportSummary   `json:"summary" bson:"summary"`
	Vulnerabilities []Vulnerability `json:"vulnerabilities" bson:"vulnerabilities"`
	CreatedAt       time.Time       `json:"created_at" bson:"created_at"`
}

// ReportSummary holds aggregated counts by severity.
type ReportSummary struct {
	Total    int `json:"total" bson:"total"`
	Critical int `json:"critical" bson:"critical"`
	High     int `json:"high" bson:"high"`
	Medium   int `json:"medium" bson:"medium"`
	Low      int `json:"low" bson:"low"`
	Info     int `json:"info" bson:"info"`
}

// Vulnerability is the UNIFIED data model for all scan tools.
//
// Bất kể tool nào (ZAP, Nmap, Nikto, Nuclei...) quét ra kết quả,
// parser tương ứng PHẢI ép dữ liệu vào struct này trước khi lưu MongoDB.
// Frontend chỉ cần biết 1 format duy nhất.
//
// Fields:
//   - VulnID:      Mã định danh duy nhất (CVE-xxxx, CWE-xxxx, hoặc tool-generated ID)
//   - Title:       Tên ngắn gọn của lỗ hổng
//   - Severity:    Mức độ nghiêm trọng (critical/high/medium/low/info)
//   - CVSSScore:   Điểm CVSS 0.0–10.0 (0 nếu tool không cung cấp)
//   - Description: Mô tả chi tiết lỗ hổng
//   - Remediation: Giải pháp khắc phục
//   - CWE:         CWE ID (ví dụ: "79" cho XSS)
//   - Reference:   Liên kết tham khảo
//   - URL:         URL cụ thể bị ảnh hưởng
//   - Port:        Cổng mạng (chủ yếu từ Nmap)
//   - Protocol:    Giao thức (tcp/udp)
//   - Service:     Tên dịch vụ (http, ssh, ftp...)
//   - SourceTool:  Tool nào phát hiện (zap/nmap/nikto/nuclei...)
type Vulnerability struct {
	VulnID      string  `json:"vuln_id" bson:"vuln_id"`
	Title       string  `json:"title" bson:"title"`
	Severity    string  `json:"severity" bson:"severity"`
	CVSSScore   float64 `json:"cvss_score,omitempty" bson:"cvss_score,omitempty"`
	Description string  `json:"description" bson:"description"`
	Remediation string  `json:"remediation,omitempty" bson:"remediation,omitempty"`
	CWE         string  `json:"cwe,omitempty" bson:"cwe,omitempty"`
	Reference   string  `json:"reference,omitempty" bson:"reference,omitempty"`
	URL         string  `json:"url,omitempty" bson:"url,omitempty"`
	Port        int     `json:"port,omitempty" bson:"port,omitempty"`
	Protocol    string  `json:"protocol,omitempty" bson:"protocol,omitempty"`
	Service     string  `json:"service,omitempty" bson:"service,omitempty"`
	SourceTool  string  `json:"source_tool" bson:"source_tool"`
}

// ReportRepository defines the contract for report persistence (MongoDB).
// Implementations live in internal/repository/mongo/.
type ReportRepository interface {
	// Create stores a new vulnerability report and returns the generated MongoDB ID.
	Create(ctx context.Context, report *Report) (string, error)

	// GetByID fetches a report by its MongoDB ObjectID.
	GetByID(ctx context.Context, id string) (*Report, error)

	// GetByScanJobID fetches the report associated with a specific scan job.
	GetByScanJobID(ctx context.Context, scanJobID string) (*Report, error)
}
