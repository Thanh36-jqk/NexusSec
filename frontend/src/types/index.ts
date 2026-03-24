/**
 * NexusSec API types — mirrors the Go domain models.
 * Single source of truth for frontend type safety.
 */

// ── Enums ─────────────────────────────────────────────────────

export type ScanStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type ScanType = "zap" | "nmap" | "full";
export type Severity = "critical" | "high" | "medium" | "low" | "info";

// ── Scan Job ──────────────────────────────────────────────────

export interface ScanJob {
    id: string;
    user_id: string;
    target_id: string;
    target_url: string;
    scan_type: ScanType;
    status: ScanStatus;
    progress: number;
    report_id?: string;
    error_message?: string;
    started_at?: string;
    completed_at?: string;
    created_at: string;
    updated_at: string;
}

// ── Report ────────────────────────────────────────────────────

export interface Report {
    id: string;
    scan_job_id: string;
    target_url: string;
    scan_type: string;
    summary: ReportSummary;
    vulnerabilities: Vulnerability[];
    raw_output: Record<string, unknown>;
    created_at: string;
}

export interface ReportSummary {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
}

export interface Vulnerability {
    name: string;
    severity: Severity;
    description: string;
    url?: string;
    solution?: string;
    reference?: string;
    cwe?: string;
}

// ── WebSocket Messages ────────────────────────────────────────

export interface WSMessage {
    type: "scan_update" | "scan_completed" | "scan_failed" | "heartbeat";
    job_id: string;
    status?: ScanStatus;
    progress?: number;
    error?: string;
    timestamp: string;
}

// ── API Responses ─────────────────────────────────────────────

export interface APIResponse<T> {
    status: "success" | "error";
    code: number;
    message: string;
    data: T;
}
