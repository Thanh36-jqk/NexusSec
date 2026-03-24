package parser

import (
	"encoding/json"
	"io"
	"strings"

	"github.com/nexussec/nexussec/internal/domain/model"
)

type zapAlert struct {
	Name      string `json:"name"`
	RiskDesc  string `json:"riskdesc"`
	Desc      string `json:"desc"`
	Solution  string `json:"solution"`
	Reference string `json:"reference"`
	CWEID     string `json:"cweid"`
}

type zapSite struct {
	Alerts []zapAlert `json:"alerts"`
}

type zapReport struct {
	Site []zapSite `json:"site"`
}

func cleanHTML(text string) string {
	text = strings.ReplaceAll(text, "<p>", "")
	text = strings.ReplaceAll(text, "</p>", "\n")
	text = strings.ReplaceAll(text, "<br>", "\n")
	return strings.TrimSpace(text)
}

// ParseZAPReport parses a ZAP JSON report from an io.Reader,
// minimizing memory usage via json.NewDecoder streaming.
func ParseZAPReport(reader io.Reader) ([]model.Vulnerability, error) {
	var report zapReport
	decoder := json.NewDecoder(reader)
	if err := decoder.Decode(&report); err != nil {
		return nil, err
	}

	var vulns []model.Vulnerability
	for _, site := range report.Site {
		for _, alert := range site.Alerts {
			severity := alert.RiskDesc
			if idx := strings.Index(severity, " "); idx != -1 {
				severity = severity[:idx]
			}

			vulns = append(vulns, model.Vulnerability{
				Title:       alert.Name,
				Severity:    severity,
				Description: cleanHTML(alert.Desc),
				Remediation: cleanHTML(alert.Solution),
				CWE:         alert.CWEID,
				Reference:   cleanHTML(alert.Reference),
			})
		}
	}

	return vulns, nil
}
