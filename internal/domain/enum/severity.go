package enum

// Severity represents the severity level of a vulnerability finding.
type Severity string

const (
	SeverityCritical Severity = "critical"
	SeverityHigh     Severity = "high"
	SeverityMedium   Severity = "medium"
	SeverityLow      Severity = "low"
	SeverityInfo     Severity = "info"
)

func (s Severity) String() string {
	return string(s)
}

// ScanType represents the type of scan to perform.
type ScanType string

const (
	ScanTypeZAP  ScanType = "zap"
	ScanTypeNmap ScanType = "nmap"
	ScanTypeFull ScanType = "full"
)

func (s ScanType) String() string {
	return string(s)
}
