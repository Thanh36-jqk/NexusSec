package parser

import (
	"fmt"
	"io"

	"github.com/nexussec/nexussec/internal/domain/model"
)

// VulnerabilityParser is the Strategy interface for all scan tool parsers.
//
// Mỗi tool (ZAP, Nmap, Nikto, Nuclei...) implement interface này.
// Worker chỉ cần gọi parser.Parse(reader) mà KHÔNG cần biết tool nào đang chạy.
//
// Quy tắc bắt buộc cho mọi implementation:
//  1. Nhận io.Reader — KHÔNG dùng os.ReadFile() (tránh OOM với file lớn)
//  2. Trả về []model.Vulnerability — dữ liệu đã chuẩn hóa theo Unified Model
//  3. Set SourceTool cho mỗi vulnerability
//  4. Normalize Severity thành lowercase: critical/high/medium/low/info
type VulnerabilityParser interface {
	// Parse đọc raw output từ scan tool (qua io.Reader) và trả về danh sách
	// vulnerabilities đã chuẩn hóa theo Unified Data Model.
	//
	// io.Reader được dùng thay vì []byte/string để hỗ trợ stream parsing,
	// tránh OOM khi xử lý file scan lớn (hàng trăm MB từ Nmap network scan).
	Parse(reader io.Reader) ([]model.Vulnerability, error)
}

// ── Parser Registry ─────────────────────────────────────────
// Map scan type → parser implementation.
// Khi thêm tool mới, chỉ cần:
//  1. Tạo file parser/<tool>.go implement VulnerabilityParser
//  2. Đăng ký vào registry bên dưới

var registry = map[string]VulnerabilityParser{
	"zap":  &ZAPParser{},
	"nmap": &NmapParser{},
	"full": &ZAPParser{}, // "full" hiện dùng ZAP parser (ZAP full-scan cũng output JSON)
}

// GetParser returns the appropriate parser for the given scan type.
// Returns an error if no parser is registered for that type.
//
// Worker chỉ cần gọi:
//
//	p, err := parser.GetParser(scanType)
//	vulns, err := p.Parse(reader)
//
// Không cần if-else hay switch-case nào.
func GetParser(scanType string) (VulnerabilityParser, error) {
	p, ok := registry[scanType]
	if !ok {
		return nil, fmt.Errorf("parser: no parser registered for scan type %q", scanType)
	}
	return p, nil
}

// RegisterParser adds a new parser to the registry at runtime.
// Useful for plugins or dynamically loaded scan tools.
func RegisterParser(scanType string, p VulnerabilityParser) {
	registry[scanType] = p
}

// ── Merge & Deduplication ───────────────────────────────────

// MergeAndDeduplicate gộp kết quả từ nhiều tool khác nhau và loại bỏ trùng lặp.
// Strategy:
// 1. Tạo Hash Signature = CWE (hoặc Title) + URL + Protocol.
// 2. Nếu có xung đột, ưu tiên giữ lại vuln có CVSSScore cao hơn.
// 3. Vuln bị loại bỏ sẽ được nối phần Description/Tool vào Reference của Vuln chính để không mất dữ liệu.
func MergeAndDeduplicate(lists ...[]model.Vulnerability) []model.Vulnerability {
	dedupMap := make(map[string]model.Vulnerability)

	for _, list := range lists {
		for _, v := range list {
			sig := generateSignature(v)

			existing, exists := dedupMap[sig]
			if !exists {
				dedupMap[sig] = v
			} else {
				// Xung đột: Ưu tiên CVSS Score cao hơn
				if v.CVSSScore > existing.CVSSScore {
					// v thắng, ghép data của existing vào v
					v.Reference = mergeReferences(v.Reference, existing)
					dedupMap[sig] = v
				} else {
					// existing thắng hoặc hòa (giữ existing), ghép data của v vào existing
					existing.Reference = mergeReferences(existing.Reference, v)
					dedupMap[sig] = existing
				}
			}
		}
	}

	// Đổ map ra slice
	merged := make([]model.Vulnerability, 0, len(dedupMap))
	for _, v := range dedupMap {
		merged = append(merged, v)
	}

	return merged
}

func generateSignature(v model.Vulnerability) string {
	feature := v.Title
	if v.CWE != "" {
		feature = "CWE-" + v.CWE
	}
	// Chữ ký CWE_ID (hoặc Title) + TargetURL + Protocol
	return fmt.Sprintf("%s|%s|%s", feature, v.URL, v.Protocol)
}

func mergeReferences(baseRef string, dropped model.Vulnerability) string {
	info := fmt.Sprintf("[%s also detected this. Desc: %s]", dropped.SourceTool, dropped.Description)
	if baseRef == "" {
		return info
	}
	return baseRef + "\n" + info
}
