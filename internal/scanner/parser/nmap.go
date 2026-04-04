package parser

import (
	"encoding/xml"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/nexussec/nexussec/internal/domain/model"
)

// ── Nmap XML structs (internal only) ────────────────────────
// These map to Nmap's -oX output structure.
// Only the fields we need are defined — the rest is ignored by encoding/xml.

// nmapHost represents a single <host> element in the Nmap XML output.
// We decode hosts one-by-one using xml.Decoder to avoid loading the
// entire XML file into memory (stream parsing for large network scans).
type nmapHost struct {
	Addresses []nmapAddress `xml:"address"`
	Hostnames []nmapName    `xml:"hostnames>hostname"`
	Ports     []nmapPort    `xml:"ports>port"`
}

type nmapAddress struct {
	Addr     string `xml:"addr,attr"`
	AddrType string `xml:"addrtype,attr"` // ipv4, ipv6, mac
}

type nmapName struct {
	Name string `xml:"name,attr"`
	Type string `xml:"type,attr"` // user, PTR
}

type nmapPort struct {
	Protocol string       `xml:"protocol,attr"` // tcp, udp
	PortID   int          `xml:"portid,attr"`
	State    nmapState    `xml:"state"`
	Service  nmapService  `xml:"service"`
	Scripts  []nmapScript `xml:"script"`
}

type nmapState struct {
	State string `xml:"state,attr"` // open, closed, filtered
}

type nmapService struct {
	Name    string `xml:"name,attr"`
	Product string `xml:"product,attr"`
	Version string `xml:"version,attr"`
}

// nmapScript represents a single NSE script result.
// For `--script=vuln`, the structure contains nested <table> and <elem> elements.
type nmapScript struct {
	ID     string      `xml:"id,attr"`
	Output string      `xml:"output,attr"`
	Tables []nmapTable `xml:"table"`
	Elems  []nmapElem  `xml:"elem"`
}

type nmapTable struct {
	Key    string      `xml:"key,attr"`
	Elems  []nmapElem  `xml:"elem"`
	Tables []nmapTable `xml:"table"`
}

type nmapElem struct {
	Key   string `xml:"key,attr"`
	Value string `xml:",chardata"`
}

// ── NmapParser implements VulnerabilityParser ────────────────

// NmapParser parses Nmap XML output (-oX) into the unified vulnerability format.
//
// CRITICAL: Uses encoding/xml.Decoder for STREAM PARSING.
// Instead of loading the entire XML into memory (which would OOM on large scans),
// we use decoder.Token() to find each <host> start element, then
// decoder.DecodeElement() to decode just that host's data.
// This keeps memory usage proportional to a single host, not the entire scan.
type NmapParser struct{}

// Parse reads Nmap XML output from an io.Reader using stream parsing.
//
// Flow:
//  1. Create xml.Decoder (reads tokens incrementally)
//  2. Scan for <host> start elements
//  3. DecodeElement each host individually (one host in memory at a time)
//  4. Extract vulnerabilities from NSE script results + service info
//  5. Map everything to unified model.Vulnerability
func (p *NmapParser) Parse(reader io.Reader) ([]model.Vulnerability, error) {
	decoder := xml.NewDecoder(reader)
	var vulns []model.Vulnerability

	for {
		// Read next XML token (start element, end element, char data, etc.)
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("nmap parser: XML stream error: %w", err)
		}

		// We only care about <host> start elements
		startElem, ok := token.(xml.StartElement)
		if !ok || startElem.Name.Local != "host" {
			continue
		}

		// Decode this single <host> element into struct
		// This is the key to stream parsing — only ONE host in memory at a time
		var host nmapHost
		if err := decoder.DecodeElement(&host, &startElem); err != nil {
			return nil, fmt.Errorf("nmap parser: failed to decode <host>: %w", err)
		}

		// Extract target info from this host
		hostAddr := extractHostAddr(host)

		// Process each port on this host
		for _, port := range host.Ports {
			if port.State.State != "open" {
				continue // Skip closed/filtered ports
			}

			// Extract vulns from NSE scripts (--script=vuln)
			scriptVulns := extractScriptVulns(port, hostAddr)
			vulns = append(vulns, scriptVulns...)

			// If no script vulns but service detected, create a service info entry
			if len(scriptVulns) == 0 && port.Service.Name != "" {
				vulns = append(vulns, buildServiceVuln(port, hostAddr))
			}
		}
	}

	return vulns, nil
}

// extractHostAddr returns the best address for this host.
// Prefers hostname > IPv4 > IPv6.
func extractHostAddr(host nmapHost) string {
	// Prefer hostname if available
	for _, h := range host.Hostnames {
		if h.Name != "" {
			return h.Name
		}
	}
	// Fallback to IP address
	for _, a := range host.Addresses {
		if a.AddrType == "ipv4" || a.AddrType == "ipv6" {
			return a.Addr
		}
	}
	return "unknown"
}

// extractScriptVulns parses NSE vuln script results from a port's scripts.
// Nmap vuln scripts have a specific structure with <table> and <elem> children
// containing title, state, CVE IDs, risk_factor, description, etc.
func extractScriptVulns(port nmapPort, hostAddr string) []model.Vulnerability {
	var vulns []model.Vulnerability

	for _, script := range port.Scripts {
		// Skip scripts that didn't find anything
		if !isVulnScript(script) {
			continue
		}

		vuln := parseVulnScript(script, port, hostAddr)
		vulns = append(vulns, vuln)
	}

	return vulns
}

// isVulnScript checks if an NSE script result indicates a vulnerability was found.
// Vuln scripts typically have "VULNERABLE" in their output or specific table keys.
func isVulnScript(script nmapScript) bool {
	// Check for explicit VULNERABLE state in output
	if strings.Contains(strings.ToUpper(script.Output), "VULNERABLE") {
		return true
	}

	// Check nested tables for state=VULNERABLE
	for _, table := range script.Tables {
		for _, elem := range table.Elems {
			if elem.Key == "state" && strings.Contains(strings.ToUpper(elem.Value), "VULNERABLE") {
				return true
			}
		}
	}

	return false
}

// parseVulnScript extracts vulnerability details from an NSE script result.
func parseVulnScript(script nmapScript, port nmapPort, hostAddr string) model.Vulnerability {
	v := model.Vulnerability{
		Title:      script.ID,
		Severity:   "medium", // default
		Port:       port.PortID,
		Protocol:   port.Protocol,
		Service:    port.Service.Name,
		URL:        fmt.Sprintf("%s:%d", hostAddr, port.PortID),
		SourceTool: "nmap",
	}

	// Parse nested tables for detailed vuln info
	for _, table := range script.Tables {
		parseVulnTable(&v, table)
	}

	// Parse top-level elems
	for _, elem := range script.Elems {
		applyElem(&v, elem)
	}

	// If no VulnID was set from CVE/references, use the script ID
	if v.VulnID == "" {
		v.VulnID = fmt.Sprintf("NMAP-%s", script.ID)
	}

	// Extract description from output if not set by table parsing
	if v.Description == "" && script.Output != "" {
		v.Description = strings.TrimSpace(script.Output)
		// Truncate very long output
		if len(v.Description) > 2000 {
			v.Description = v.Description[:2000] + "..."
		}
	}

	return v
}

// parseVulnTable recursively extracts vulnerability fields from NSE <table> elements.
func parseVulnTable(v *model.Vulnerability, table nmapTable) {
	for _, elem := range table.Elems {
		applyElem(v, elem)
	}

	// Recurse into nested tables (NSE vuln scripts often nest tables)
	for _, sub := range table.Tables {
		parseVulnTable(v, sub)
	}
}

// applyElem maps a single NSE <elem key="...">value</elem> to the vulnerability struct.
func applyElem(v *model.Vulnerability, elem nmapElem) {
	switch strings.ToLower(elem.Key) {
	case "title":
		v.Title = strings.TrimSpace(elem.Value)
	case "state":
		// Already checked in isVulnScript, but can refine severity
	case "description":
		v.Description = strings.TrimSpace(elem.Value)
	case "risk_factor":
		v.Severity = normalizeSeverity(elem.Value)
		v.CVSSScore = riskFactorToCVSS(elem.Value)
	case "cve":
		v.VulnID = elem.Value
	case "cvss":
		if score, err := strconv.ParseFloat(elem.Value, 64); err == nil {
			v.CVSSScore = score
		}
	case "references":
		v.Reference = strings.TrimSpace(elem.Value)
	case "ids":
		// Nested table with CVE/BID — handled via recursion
	}
}

// buildServiceVuln creates an informational vulnerability entry for a detected
// service that had no specific script vulns. This provides port/service visibility.
func buildServiceVuln(port nmapPort, hostAddr string) model.Vulnerability {
	title := fmt.Sprintf("Open Port: %d/%s", port.PortID, port.Protocol)
	desc := fmt.Sprintf("Service detected: %s", port.Service.Name)
	if port.Service.Product != "" {
		desc += fmt.Sprintf(" (%s", port.Service.Product)
		if port.Service.Version != "" {
			desc += fmt.Sprintf(" %s", port.Service.Version)
		}
		desc += ")"
	}

	return model.Vulnerability{
		VulnID:      fmt.Sprintf("NMAP-SVC-%d-%s", port.PortID, port.Protocol),
		Title:       title,
		Severity:    "info",
		CVSSScore:   0.0,
		Description: desc,
		Port:        port.PortID,
		Protocol:    port.Protocol,
		Service:     port.Service.Name,
		URL:         fmt.Sprintf("%s:%d", hostAddr, port.PortID),
		SourceTool:  "nmap",
	}
}

// riskFactorToCVSS maps Nmap's risk_factor string to a CVSS score.
func riskFactorToCVSS(riskFactor string) float64 {
	switch strings.ToLower(strings.TrimSpace(riskFactor)) {
	case "critical":
		return 9.5
	case "high":
		return 8.0
	case "medium":
		return 5.5
	case "low":
		return 3.0
	default:
		return 0.0
	}
}
