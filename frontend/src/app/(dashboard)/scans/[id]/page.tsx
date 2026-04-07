"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
    ArrowLeft,
    Globe,
    Clock,
    ScanSearch,
    Wifi,
    WifiOff,
    AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/useWebSocket";
import { ScanProgressBar } from "@/components/scan/ScanProgressBar";
import { ReportSummary } from "@/components/report/ReportSummary";
import { FindingsTable } from "@/components/report/FindingsTable";
import { TriageView } from "@/components/triage/TriageView";
import { AttackSurfaceGraph } from "@/components/topology/AttackSurfaceGraph";
import { ScanDetailSkeleton } from "@/components/ui/skeleton-card";
import { useTriageStore } from "@/stores/useTriageStore";
import { fetchApi } from "@/lib/api";
import type { ScanJob, Report, WSMessage, APIResponse } from "@/types";

// ── Tab Types ────────────────────────────────────────────────

type ReportTab = "summary" | "topology" | "triage";

// ── API Config ───────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

/**
 * Derive WebSocket URL dynamically from current page origin.
 * - Production: https://nexussec.me → wss://nexussec.me/ws
 * - Development: http://localhost:3000 → ws://localhost:8080/ws
 */
function getWSUrl(): string {
    if (typeof window === "undefined") return "ws://localhost:8080/api/v1/ws";
    const env = process.env.NEXT_PUBLIC_WS_URL;
    if (env) return env;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    // In dev, Next.js runs on :3000 but the gateway is on :8080
    if (host.includes("localhost") || host.includes("127.0.0.1")) {
        return `ws://localhost:8080/api/v1/ws`;
    }
    return `${proto}//${host}/api/v1/ws`;
}

// ── Status Badge Component ───────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        pending: "bg-gray-500/15 text-gray-400 border-gray-500/30",
        running: "bg-blue-500/15 text-blue-400 border-blue-500/30",
        completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
        failed: "bg-red-500/15 text-red-400 border-red-500/30",
        cancelled: "bg-gray-500/15 text-gray-400 border-gray-500/30",
    };

    return (
        <span
            className={cn(
                "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider",
                styles[status] || styles.pending
            )}
        >
            {status}
        </span>
    );
}

// ── Connection Indicator ─────────────────────────────────────

function ConnectionIndicator({ state }: { state: string }) {
    if (state === "connected") {
        return (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <Wifi className="h-3 w-3" />
                <span>Live</span>
            </div>
        );
    }
    if (state === "reconnecting") {
        return (
            <div className="flex items-center gap-1.5 text-xs text-amber-400 animate-pulse">
                <WifiOff className="h-3 w-3" />
                <span>Reconnecting...</span>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <WifiOff className="h-3 w-3" />
            <span>Offline</span>
        </div>
    );
}

// ── Main Page Component ──────────────────────────────────────

/**
 * Scan Detail Dashboard — the centerpiece of the application.
 *
 * UX Architecture:
 * 1. LOADING: Shaped skeleton loaders (no blank screen, no CLS)
 * 2. PENDING/RUNNING: Progress bar with real-time WebSocket updates
 * 3. COMPLETED: Elegant transition to ReportSummary + FindingsTable
 * 4. FAILED: Error message with context
 *
 * The page subscribes to WebSocket updates filtered by the current job_id.
 * When status transitions to COMPLETED, it automatically fetches the report.
 */
export default function ScanDetailPage() {
    const params = useParams<{ id: string }>();
    const jobId = params.id;

    // ── State ────────────────────────────────────────────────
    const [scan, setScan] = useState<ScanJob | null>(null);
    const [report, setReport] = useState<Report | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<ReportTab>("summary");

    // ── WebSocket ────────────────────────────────────────────

    const handleWSMessage = useCallback(
        (message: WSMessage) => {
            if (message.job_id !== jobId) return;

            setScan((prev) => {
                if (!prev) return prev;

                const updated = { ...prev };

                if (message.status) updated.status = message.status;
                if (message.progress !== undefined) updated.progress = message.progress;
                if (message.error) updated.error_message = message.error;

                return updated;
            });

            // Auto-fetch report when scan completes
            if (message.type === "scan_completed") {
                fetchReport();
            }
        },
        [jobId]
    );

    const { connectionState } = useWebSocket({
        url: `${getWSUrl()}?job_id=${jobId}`,
        onMessage: handleWSMessage,
    });

    // ── Data Fetching ────────────────────────────────────────

    const fetchScan = useCallback(async () => {
        try {
            const json = await fetchApi<APIResponse<ScanJob>>(`/scans/${jobId}`);
            setScan(json.data);

            // If already completed, fetch report immediately
            if (json.data.status === "completed" && json.data.report_id) {
                await fetchReport();
            }
        } catch (err: any) {
            setError(err.message || "Failed to load scan");
        } finally {
            setLoading(false);
        }
    }, [jobId]);

    const fetchReport = useCallback(async () => {
        try {
            const [reportRes, triageRes] = await Promise.all([
                fetchApi<APIResponse<Report[]>>(`/reports?scan_job_id=${jobId}`),
                fetchApi<APIResponse<any[]>>(`/scans/${jobId}/triage`)
            ]);

            if (reportRes.data && reportRes.data.length > 0) {
                setReport(reportRes.data[0]);
            }

            // Map array of rules to a Record<vuln_fingerprint, VulnTriageState>
            const stateMap: Record<string, { is_muted: boolean; is_false_positive: boolean }> = {};
            for (const rule of triageRes.data || []) {
                stateMap[rule.vuln_fingerprint] = {
                    is_muted: rule.is_muted,
                    is_false_positive: rule.is_false_positive,
                };
            }
            useTriageStore.getState().hydrateTriageStates(stateMap);
        } catch (err) {
            console.warn("Failed to fetch report or triage states", err);
        }
    }, [jobId]);

    useEffect(() => {
        fetchScan();
    }, [fetchScan]);

    // ── Render: Loading ──────────────────────────────────────

    if (loading) {
        return <ScanDetailSkeleton />;
    }

    // ── Render: Error ────────────────────────────────────────

    if (error || !scan) {
        return (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
                <AlertCircle className="h-12 w-12 text-red-400" />
                <h2 className="text-xl font-semibold text-foreground">Scan Not Found</h2>
                <p className="text-sm text-muted-foreground">{error || "The scan could not be loaded."}</p>
                <Link
                    href="/scans"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Scans
                </Link>
            </div>
        );
    }

    // ── Derived State ────────────────────────────────────────

    const isComplete = scan.status === "completed";
    const isFailed = scan.status === "failed";
    const isActive = scan.status === "running" || scan.status === "pending";

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return "—";
        return new Intl.DateTimeFormat("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(new Date(dateStr));
    };

    const formatDuration = () => {
        if (!scan.started_at) return "—";
        const end = scan.completed_at ? new Date(scan.completed_at) : new Date();
        const start = new Date(scan.started_at);
        const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    };

    // ── Render: Page ─────────────────────────────────────────

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* ── Header ──────────────────────────────────────── */}
            <div className="flex items-start justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/scans"
                            className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border hover:bg-muted transition-colors"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">Scan Details</h1>
                        <StatusBadge status={scan.status} />
                    </div>
                    <p className="text-sm text-muted-foreground pl-11">
                        Job ID: <span className="font-mono text-xs">{scan.id}</span>
                    </p>
                </div>
                <ConnectionIndicator state={connectionState} />
            </div>

            {/* ── Info Cards ──────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Target
                        </span>
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">{scan.target_url || "—"}</p>
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <ScanSearch className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Scan Type
                        </span>
                    </div>
                    <p className="text-sm font-medium text-foreground uppercase">{scan.scan_type}</p>
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Duration
                        </span>
                    </div>
                    <p className="text-sm font-medium text-foreground font-mono">{formatDuration()}</p>
                </div>
            </div>

            {/* ── Progress Bar (always shown for context) ─────── */}
            <ScanProgressBar progress={scan.progress} status={scan.status} />

            {/* ── Error State ────────────────────────────────── */}
            {isFailed && scan.error_message && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-medium text-red-400">Scan Failed</p>
                            <p className="text-sm text-red-400/80 mt-1 font-mono">{scan.error_message}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Report (shown when COMPLETED) ──────────────── */}
            {isComplete && report && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

                    {/* Tab Bar */}
                    <div className="tab-bar">
                        <button
                            className={cn("tab-item", activeTab === "summary" && "tab-item--active")}
                            onClick={() => setActiveTab("summary")}
                            id="tab-summary"
                        >
                            Summary
                        </button>
                        <button
                            className={cn("tab-item", activeTab === "topology" && "tab-item--active")}
                            onClick={() => setActiveTab("topology")}
                            id="tab-topology"
                        >
                            Topology
                        </button>
                        <button
                            className={cn("tab-item", activeTab === "triage" && "tab-item--active")}
                            onClick={() => setActiveTab("triage")}
                            id="tab-triage"
                        >
                            Triage
                        </button>
                    </div>

                    {/* Tab Content */}
                    {activeTab === "summary" && (
                        <div className="space-y-8 animate-fade-scale-in">
                            <ReportSummary summary={report.summary} />
                            <FindingsTable vulnerabilities={report.vulnerabilities} />
                        </div>
                    )}

                    {activeTab === "topology" && (
                        <div className="animate-fade-scale-in">
                            <AttackSurfaceGraph 
                                targetUrl={report.target_url || scan.target_url} 
                                vulnerabilities={report.vulnerabilities} 
                            />
                        </div>
                    )}

                    {activeTab === "triage" && (
                        <TriageView vulnerabilities={report.vulnerabilities} />
                    )}
                </div>
            )}

            {/* ── Waiting state ─────────────────────────────── */}
            {isActive && (
                <div className="text-center py-12 space-y-3">
                    <div className="mx-auto h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <ScanSearch className="h-6 w-6 text-blue-400 animate-pulse" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {scan.status === "pending"
                            ? "Waiting for a worker to pick up this scan..."
                            : "Scan in progress — results will appear here automatically."}
                    </p>
                </div>
            )}

            {/* ── Timestamps Footer ─────────────────────────── */}
            <div className="flex items-center gap-6 pt-4 border-t border-border text-xs text-muted-foreground">
                <span>Created: {formatDate(scan.created_at)}</span>
                {scan.started_at && <span>Started: {formatDate(scan.started_at)}</span>}
                {scan.completed_at && <span>Completed: {formatDate(scan.completed_at)}</span>}
            </div>
        </div>
    );
}
