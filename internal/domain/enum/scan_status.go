package enum

// ScanStatus represents the lifecycle state of a scan job.
type ScanStatus string

const (
	ScanStatusPending   ScanStatus = "pending"
	ScanStatusRunning   ScanStatus = "running"
	ScanStatusCompleted ScanStatus = "completed"
	ScanStatusFailed    ScanStatus = "failed"
	ScanStatusCancelled ScanStatus = "cancelled"
)

// IsTerminal returns true if the status is a final state (no further transitions).
func (s ScanStatus) IsTerminal() bool {
	return s == ScanStatusCompleted || s == ScanStatusFailed || s == ScanStatusCancelled
}

func (s ScanStatus) String() string {
	return string(s)
}
