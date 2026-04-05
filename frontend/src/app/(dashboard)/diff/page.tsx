"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useScanDiff } from "@/hooks/useScanDiff";
import { useTriageStore } from "@/stores/useTriageStore";
import { TriageListItem } from "@/components/triage/TriageListItem";
import { TriageDetailPanel } from "@/components/triage/TriageDetailPanel";
import { fetchApi } from "@/lib/api";
import type { Vulnerability, Severity, APIResponse } from "@/types";
import {
    GitCompareArrows,
    AlertCircle,
    ShieldCheck,
    ShieldAlert,
    Minus,
    Loader2,
    Search,
    ListChecks,
    ArrowRight,
} from "lucide-react";

// ── API Config ───────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

// ── Types ────────────────────────────────────────────────────

interface ScanListItem {
    id: string;
    target_url: string;
    scan_type: string;
    status: string;
    progress: number;
    error_message?: string;
    created_at: string;
}

type DiffTab = "new" | "resolved" | "unchanged";

// ── Severity sort order ──────────────────────────────────────

const SEVERITY_ORDER: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
};

// ── Main Page Component ──────────────────────────────────────

/**
 * Historical Scan Diffing page.
 *
 * Flow:
 * 1. Fetch all scans → filter completed → populate dropdowns
 * 2. User picks Baseline (Scan A) and Compare (Scan B)
 * 3. Fetch both reports
 * 4. Run O(N) diff via useScanDiff hook
 * 5. Display results in 3 tabs: New | Resolved | Unchanged
 *
 * Reuses TriageListItem + TriageDetailPanel from Triage feature (DRY).
 */
export default function DiffPage() {
    // ── Scan list state ──────────────────────────────────────
    const [scans, setScans] = useState<ScanListItem[]>([]);
    const [loadingScans, setLoadingScans] = useState(true);
    const [scanError, setScanError] = useState<string | null>(null);

    // ── Selected scan IDs ────────────────────────────────────
    const [baselineId, setBaselineId] = useState<string>("");
    const [compareId, setCompareId] = useState<string>("");

    // ── Report data ──────────────────────────────────────────
    const [baselineVulns, setBaselineVulns] = useState<Vulnerability[] | null>(null);
    const [compareVulns, setCompareVulns] = useState<Vulnerability[] | null>(null);
    const [loadingReports, setLoadingReports] = useState(false);

    // ── UI state ─────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<DiffTab>("new");
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    // ── Triage store (shared FP/Mute state) ──────────────────
    const triageStates = useTriageStore((s) => s.triageStates);

    // ── Diff computation (O(N)) ──────────────────────────────
    const diffResult = useScanDiff(baselineVulns, compareVulns);

    // ── Fetch scan list on mount ─────────────────────────────
    useEffect(() => {
        async function loadScans() {
            try {
                const res = await fetchApi<APIResponse<ScanListItem[]>>(`/scans`);
                const all: ScanListItem[] = res.data ?? [];
                // Only completed scans have reports to diff
                const completed = all.filter(
                    (s) => s.status.toUpperCase() === "COMPLETED"
                );
                setScans(completed);
            } catch (err: any) {
                setScanError(
                    err.message || "Failed to load scans"
                );
            } finally {
                setLoadingScans(false);
            }
        }
        loadScans();
    }, []);

    // ── Fetch report for a scan ──────────────────────────────
    const fetchReport = useCallback(async (scanId: string): Promise<Vulnerability[]> => {
        const res = await fetchApi<APIResponse<{ vulnerabilities?: Vulnerability[] }>>(`/scans/${scanId}/report`);
        return res.data?.vulnerabilities ?? [];
    }, []);

    // ── Compare button handler ───────────────────────────────
    const handleCompare = useCallback(async () => {
        if (!baselineId || !compareId) return;
        setLoadingReports(true);
        setSelectedIndex(null);
        setActiveTab("new");
        try {
            const [a, b] = await Promise.all([
                fetchReport(baselineId),
                fetchReport(compareId),
            ]);
            setBaselineVulns(a);
            setCompareVulns(b);
        } catch (err) {
            setScanError(
                err instanceof Error ? err.message : "Failed to load reports"
            );
        } finally {
            setLoadingReports(false);
        }
    }, [baselineId, compareId, fetchReport]);

    // ── Current tab's vulnerability list ─────────────────────
    const currentList = useMemo(() => {
        if (!diffResult) return [];
        const list =
            activeTab === "new"
                ? diffResult.newVulns
                : activeTab === "resolved"
                    ? diffResult.resolvedVulns
                    : diffResult.unchangedVulns;
        return [...list].sort(
            (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
        );
    }, [diffResult, activeTab]);

    // ── Selected vulnerability ───────────────────────────────
    const selectedVuln = selectedIndex !== null ? currentList[selectedIndex] ?? null : null;

    // ── Keyboard handler ─────────────────────────────────────
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    setSelectedIndex((prev) => {
                        if (prev === null) return 0;
                        return Math.min(currentList.length - 1, prev + 1);
                    });
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    setSelectedIndex((prev) => {
                        if (prev === null) return 0;
                        return Math.max(0, prev - 1);
                    });
                    break;
                case "Escape":
                    e.preventDefault();
                    setSelectedIndex(null);
                    break;
            }
        },
        [currentList.length]
    );

    // ── Clear selection on tab switch ─────────────────────────
    const switchTab = useCallback((tab: DiffTab) => {
        setActiveTab(tab);
        setSelectedIndex(null);
    }, []);

    // ── Format scan label for dropdown ───────────────────────
    const formatScanLabel = (s: ScanListItem) => {
        const date = new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(s.created_at));
        return `${s.scan_type.toUpperCase()} — ${s.target_url} — ${date}`;
    };

    // ── Render ───────────────────────────────────────────────

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* ── Page Header ─────────────────────────────────── */}
            <div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 border border-primary/20">
                        <GitCompareArrows className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">
                            Scan Diffing
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Compare two scans to identify new, resolved, and
                            unchanged vulnerabilities.
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Loading/Error state for scan list ────────────── */}
            {loadingScans && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 text-primary animate-spin" />
                    <span className="ml-2 text-sm text-muted-foreground">
                        Loading scan history...
                    </span>
                </div>
            )}

            {scanError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-medium text-red-400">
                                Error
                            </p>
                            <p className="text-sm text-red-400/80 mt-1">
                                {scanError}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Dropdown Controls ───────────────────────────── */}
            {!loadingScans && scans.length >= 2 && (
                <div className="rounded-xl border border-border bg-card p-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr_auto]  items-end">
                        {/* Baseline (Scan A) */}
                        <div>
                            <label
                                htmlFor="diff-baseline"
                                className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5"
                            >
                                Baseline (Older Scan)
                            </label>
                            <select
                                id="diff-baseline"
                                value={baselineId}
                                onChange={(e) => setBaselineId(e.target.value)}
                                className={cn(
                                    "h-10 w-full rounded-lg border border-border bg-background px-3",
                                    "text-sm text-foreground appearance-none cursor-pointer",
                                    "focus:outline-none focus:ring-2 focus:ring-primary/50",
                                    "transition-all"
                                )}
                            >
                                <option value="">Select baseline scan...</option>
                                {scans.map((s) => (
                                    <option
                                        key={s.id}
                                        value={s.id}
                                        disabled={s.id === compareId}
                                    >
                                        {formatScanLabel(s)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Arrow */}
                        <div className="hidden md:flex items-center justify-center h-10">
                            <ArrowRight className="h-5 w-5 text-muted-foreground" />
                        </div>

                        {/* Compare (Scan B) */}
                        <div>
                            <label
                                htmlFor="diff-compare"
                                className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5"
                            >
                                Compare (Newer Scan)
                            </label>
                            <select
                                id="diff-compare"
                                value={compareId}
                                onChange={(e) => setCompareId(e.target.value)}
                                className={cn(
                                    "h-10 w-full rounded-lg border border-border bg-background px-3",
                                    "text-sm text-foreground appearance-none cursor-pointer",
                                    "focus:outline-none focus:ring-2 focus:ring-primary/50",
                                    "transition-all"
                                )}
                            >
                                <option value="">Select compare scan...</option>
                                {scans.map((s) => (
                                    <option
                                        key={s.id}
                                        value={s.id}
                                        disabled={s.id === baselineId}
                                    >
                                        {formatScanLabel(s)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Compare Button */}
                        <button
                            onClick={handleCompare}
                            disabled={
                                !baselineId ||
                                !compareId ||
                                baselineId === compareId ||
                                loadingReports
                            }
                            className={cn(
                                "h-10 rounded-lg px-5 text-sm font-medium transition-all",
                                "inline-flex items-center justify-center gap-2",
                                baselineId && compareId && baselineId !== compareId
                                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                    : "bg-muted text-muted-foreground cursor-not-allowed"
                            )}
                        >
                            {loadingReports ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Comparing...
                                </>
                            ) : (
                                <>
                                    <GitCompareArrows className="h-4 w-4" />
                                    Compare
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Not enough scans ────────────────────────────── */}
            {!loadingScans && scans.length < 2 && !scanError && (
                <div className="text-center py-16 space-y-3">
                    <div className="mx-auto h-14 w-14 rounded-full bg-muted/30 flex items-center justify-center">
                        <GitCompareArrows className="h-7 w-7 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                        Not enough scans to compare
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                        You need at least 2 completed scans to perform a diff.
                        Run another scan first.
                    </p>
                </div>
            )}

            {/* ── Diff Results ─────────────────────────────────── */}
            {diffResult && (
                <div className="space-y-5 animate-fade-scale-in">
                    {/* ── Summary Cards ────────────────────────────── */}
                    <div className="grid grid-cols-3 gap-4">
                        {/* New */}
                        <div
                            className={cn(
                                "rounded-xl border p-4 cursor-pointer transition-all hover:scale-[1.02]",
                                "bg-red-500/5 border-red-500/20",
                                activeTab === "new" && "ring-2 ring-red-500/40"
                            )}
                            onClick={() => switchTab("new")}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <ShieldAlert className="h-4 w-4 text-red-400" />
                                <span className="text-[11px] font-medium uppercase tracking-wider text-red-400">
                                    New
                                </span>
                            </div>
                            <p className="text-3xl font-bold tabular-nums font-mono text-red-400">
                                {diffResult.newVulns.length}
                            </p>
                            <p className="text-[10px] text-red-400/60 mt-1">
                                Appeared since baseline
                            </p>
                        </div>

                        {/* Resolved */}
                        <div
                            className={cn(
                                "rounded-xl border p-4 cursor-pointer transition-all hover:scale-[1.02]",
                                "bg-emerald-500/5 border-emerald-500/20",
                                activeTab === "resolved" &&
                                "ring-2 ring-emerald-500/40"
                            )}
                            onClick={() => switchTab("resolved")}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                                <span className="text-[11px] font-medium uppercase tracking-wider text-emerald-400">
                                    Resolved
                                </span>
                            </div>
                            <p className="text-3xl font-bold tabular-nums font-mono text-emerald-400">
                                {diffResult.resolvedVulns.length}
                            </p>
                            <p className="text-[10px] text-emerald-400/60 mt-1">
                                Fixed since baseline
                            </p>
                        </div>

                        {/* Unchanged */}
                        <div
                            className={cn(
                                "rounded-xl border p-4 cursor-pointer transition-all hover:scale-[1.02]",
                                "bg-gray-500/5 border-gray-500/20",
                                activeTab === "unchanged" &&
                                "ring-2 ring-gray-500/40"
                            )}
                            onClick={() => switchTab("unchanged")}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Minus className="h-4 w-4 text-gray-400" />
                                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                                    Unchanged
                                </span>
                            </div>
                            <p className="text-3xl font-bold tabular-nums font-mono text-gray-400">
                                {diffResult.unchangedVulns.length}
                            </p>
                            <p className="text-[10px] text-gray-400/60 mt-1">
                                Still present
                            </p>
                        </div>
                    </div>

                    {/* ── Tab Bar ──────────────────────────────────── */}
                    <div className="tab-bar">
                        <button
                            className={cn(
                                "tab-item",
                                activeTab === "new" && "tab-item--active"
                            )}
                            onClick={() => switchTab("new")}
                        >
                            New ({diffResult.newVulns.length})
                        </button>
                        <button
                            className={cn(
                                "tab-item",
                                activeTab === "resolved" && "tab-item--active"
                            )}
                            onClick={() => switchTab("resolved")}
                        >
                            Resolved ({diffResult.resolvedVulns.length})
                        </button>
                        <button
                            className={cn(
                                "tab-item",
                                activeTab === "unchanged" && "tab-item--active"
                            )}
                            onClick={() => switchTab("unchanged")}
                        >
                            Unchanged ({diffResult.unchangedVulns.length})
                        </button>
                    </div>

                    {/* ── Split Pane (reuses Triage components) ────── */}
                    <div
                        className="triage-split rounded-xl border border-border overflow-hidden bg-card"
                        onKeyDown={handleKeyDown}
                        tabIndex={0}
                        role="listbox"
                        aria-label={`${activeTab} vulnerabilities`}
                    >
                        {/* Left: List */}
                        <div className="triage-list">
                            {currentList.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                                    <Search className="h-8 w-8 mb-3 opacity-40" />
                                    <p className="text-sm font-medium">
                                        {activeTab === "new"
                                            ? "No new vulnerabilities"
                                            : activeTab === "resolved"
                                                ? "No resolved vulnerabilities"
                                                : "No unchanged vulnerabilities"}
                                    </p>
                                    <p className="text-xs mt-1 text-center px-4">
                                        {activeTab === "new"
                                            ? "Great news! No new findings appeared since the baseline scan."
                                            : activeTab === "resolved"
                                                ? "No vulnerabilities were fixed between these two scans."
                                                : "All vulnerabilities either appeared or disappeared."}
                                    </p>
                                </div>
                            ) : (
                                currentList.map((vuln, idx) => {
                                    const state = triageStates.get(vuln.vuln_id);
                                    return (
                                        <TriageListItem
                                            key={vuln.vuln_id}
                                            vuln={vuln}
                                            index={idx}
                                            isSelected={selectedIndex === idx}
                                            isFalsePositive={
                                                state?.is_false_positive ?? false
                                            }
                                            isMuted={state?.is_muted ?? false}
                                            onSelect={(i) =>
                                                setSelectedIndex(
                                                    selectedIndex === i ? null : i
                                                )
                                            }
                                        />
                                    );
                                })
                            )}
                        </div>

                        {/* Right: Detail Panel */}
                        {selectedVuln ? (
                            <div className="triage-detail">
                                <TriageDetailPanel
                                    vuln={selectedVuln}
                                    onClose={() => setSelectedIndex(null)}
                                />
                            </div>
                        ) : (
                            <div className="triage-detail flex flex-col items-center justify-center text-muted-foreground">
                                <div className="text-center space-y-2 px-8">
                                    <div className="mx-auto h-12 w-12 rounded-full bg-muted/30 flex items-center justify-center">
                                        <ListChecks className="h-6 w-6 opacity-40" />
                                    </div>
                                    <p className="text-sm font-medium">
                                        Select a vulnerability
                                    </p>
                                    <p className="text-xs">
                                        Click on any finding to view full details
                                        and triage actions.
                                    </p>
                                    <p className="text-[10px] text-muted-foreground/50 mt-4">
                                        ↑↓ Navigate • Esc Close
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Footer context ──────────────────────────── */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
                        <span>
                            Baseline: {scans.find((s) => s.id === baselineId)?.target_url ?? "—"}{" "}
                            ({baselineVulns?.length ?? 0} vulns)
                        </span>
                        <ArrowRight className="h-3 w-3" />
                        <span>
                            Compare: {scans.find((s) => s.id === compareId)?.target_url ?? "—"}{" "}
                            ({compareVulns?.length ?? 0} vulns)
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
