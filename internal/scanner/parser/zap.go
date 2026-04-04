package parser

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/nexussec/nexussec/internal/domain/model"
)

// ── ZAP-specific raw structs (internal only) ────────────────

type zapInstance struct {
	URI string `json:"uri"`
}

type zapAlert struct {
	AlertRef  string        `json:"alertRef"`
	Name      string        `json:"name"`
	RiskDesc  string        `json:"riskdesc"`
	RiskCode  string        `json:"riskcode"` // 0=Info, 1=Low, 2=Medium, 3=High
	Desc      string        `json:"desc"`
	Solution  string        `json:"solution"`
	Reference string        `json:"reference"`
	CWEID     string        `json:"cweid"`
	Instances []zapInstance `json:"instances"`
}

type zapSite struct {
	Name   string     `json:"@name"` // Target URL
	Alerts []zapAlert `json:"alerts"`
}

type zapReport struct {
	Site []zapSite `json:"site"`
}

// ── ZAPParser implements VulnerabilityParser ─────────────────

// ZAPParser parses OWASP ZAP JSON reports into the unified format.
// Uses json.NewDecoder for streaming — does NOT load entire file into memory.
type ZAPParser struct{}

// Parse reads a ZAP JSON report from an io.Reader and returns
// normalized vulnerabilities in the unified data model.
//
// ZAP JSON structure:
//
//	{ "site": [{ "alerts": [{ "name": "...", "riskdesc": "...", ... }] }] }
//
// Streaming: json.NewDecoder reads tokens incrementally from the reader.
func (p *ZAPParser) Parse(reader io.Reader) ([]model.Vulnerability, error) {
	var report zapReport
	decoder := json.NewDecoder(reader)
	if err := decoder.Decode(&report); err != nil {
		return nil, fmt.Errorf("zap parser: failed to decode JSON: %w", err)
	}

	var vulns []model.Vulnerability
	for _, site := range report.Site {
		for _, alert := range site.Alerts {
			vulns = append(vulns, mapZAPAlert(alert))
		}
	}

	return vulns, nil
}

// mapZAPAlert converts a single ZAP alert into the unified Vulnerability model.
func mapZAPAlert(alert zapAlert) model.Vulnerability {
	// Extract clean severity from "High (3)" → "high"
	severity := normalizeSeverity(alert.RiskDesc)

	// Extract first affected URI
	var uri string
	if len(alert.Instances) > 0 {
		uri = alert.Instances[0].URI
	}

	// Build VulnID: prefer CWE, fallback to ZAP's alertRef
	vulnID := buildVulnID("CWE", alert.CWEID, "ZAP", alert.AlertRef)

	return model.Vulnerability{
		VulnID:      vulnID,
		Title:       alert.Name,
		Severity:    severity,
		CVSSScore:   zapRiskCodeToCVSS(alert.RiskCode),
		Description: cleanHTML(alert.Desc),
		Remediation: cleanHTML(alert.Solution),
		CWE:         alert.CWEID,
		Reference:   cleanHTML(alert.Reference),
		URL:         uri,
		SourceTool:  "zap",
	}
}

// zapRiskCodeToCVSS maps ZAP's risk code to an approximate CVSS score.
// ZAP doesn't provide CVSS directly, so we use a conservative mapping.
func zapRiskCodeToCVSS(riskCode string) float64 {
	switch riskCode {
	case "3": // High
		return 8.0
	case "2": // Medium
		return 5.5
	case "1": // Low
		return 3.0
	case "0": // Informational
		return 0.0
	default:
		return 0.0
	}
}

// ── Shared utilities ────────────────────────────────────────

// cleanHTML strips common HTML tags from ZAP's description/solution text.
func cleanHTML(text string) string {
	text = strings.ReplaceAll(text, "<p>", "")
	text = strings.ReplaceAll(text, "</p>", "\n")
	text = strings.ReplaceAll(text, "<br>", "\n")
	text = strings.ReplaceAll(text, "<br/>", "\n")
	text = strings.ReplaceAll(text, "<li>", "- ")
	text = strings.ReplaceAll(text, "</li>", "\n")
	text = strings.ReplaceAll(text, "<ul>", "")
	text = strings.ReplaceAll(text, "</ul>", "")
	text = strings.ReplaceAll(text, "<ol>", "")
	text = strings.ReplaceAll(text, "</ol>", "")
	return strings.TrimSpace(text)
}

// normalizeSeverity extracts a clean lowercase severity from tool-specific strings.
// Examples:
//   - "High (3)" → "high"
//   - "MEDIUM"   → "medium"
//   - "Info"     → "info"
//   - "Informational" → "info"
func normalizeSeverity(raw string) string {
	// Take the first word (ZAP format: "High (3)")
	if idx := strings.Index(raw, " "); idx != -1 {
		raw = raw[:idx]
	}

	s := strings.ToLower(strings.TrimSpace(raw))

	switch s {
	case "critical":
		return "critical"
	case "high":
		return "high"
	case "medium":
		return "medium"
	case "low":
		return "low"
	case "informational", "info":
		return "info"
	default:
		return "info"
	}
}

// buildVulnID constructs a vulnerability ID with preference order.
// If preferred source has a value, use it. Otherwise fallback.
// Example: buildVulnID("CWE", "79", "ZAP", "10016") → "CWE-79"
//          buildVulnID("CWE", "", "ZAP", "10016")   → "ZAP-10016"
func buildVulnID(preferredPrefix, preferredID, fallbackPrefix, fallbackID string) string {
	if preferredID != "" && preferredID != "0" && preferredID != "-1" {
		return fmt.Sprintf("%s-%s", preferredPrefix, preferredID)
	}
	if fallbackID != "" && fallbackID != "0" {
		return fmt.Sprintf("%s-%s", fallbackPrefix, fallbackID)
	}
	return "UNKNOWN"
}
