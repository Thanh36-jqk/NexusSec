"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useScanDiff } from "@/hooks/useScanDiff";
import { useTriageStore } from "@/stores/useTriageStore";
import { TriageListItem } from "@/components/triage/TriageListItem";
import { TriageDetailPanel } from "@/components/triage/TriageDetailPanel";
import { fetchApi } from "@/lib/api";
import type { Vulnerability, Severity, APIResponse } from "@/types";

/* ── Types ────────────────────────────────────────────────── */

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

const SEVERITY_ORDER: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
};

/* ── Page ──────────────────────────────────────────────────── */

export default function DiffPage() {
    const [scans, setScans] = useState<ScanListItem[]>([]);
    const [loadingScans, setLoadingScans] = useState(true);
    const [scanError, setScanError] = useState<string | null>(null);

    const [baselineId, setBaselineId] = useState<string>("");
    const [compareId, setCompareId] = useState<string>("");

    const [baselineVulns, setBaselineVulns] = useState<Vulnerability[] | null>(null);
    const [compareVulns, setCompareVulns] = useState<Vulnerability[] | null>(null);
    const [loadingReports, setLoadingReports] = useState(false);

    const [activeTab, setActiveTab] = useState<DiffTab>("new");
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    const triageStates = useTriageStore((s) => s.triageStates);
    const diffResult = useScanDiff(baselineVulns, compareVulns);

    /* ── Load scans ────────────────────────────────────────── */

    useEffect(() => {
        async function load() {
            try {
                const res = await fetchApi<APIResponse<ScanListItem[]>>("/scans");
                const completed = (res.data ?? []).filter(
                    (s) => s.status.toUpperCase() === "COMPLETED"
                );
                setScans(completed);
            } catch (err: any) {
                setScanError(err.message || "Failed to load scans");
            } finally {
                setLoadingScans(false);
            }
        }
        load();
    }, []);

    /* ── Fetch report ──────────────────────────────────────── */

    const fetchReport = useCallback(
        async (scanId: string): Promise<Vulnerability[]> => {
            const res = await fetchApi<
                APIResponse<{ vulnerabilities?: Vulnerability[] }>
            >(`/scans/${scanId}/report`);
            return res.data?.vulnerabilities ?? [];
        },
        []
    );

    /* ── Compare ───────────────────────────────────────────── */

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

    /* ── Current list ──────────────────────────────────────── */

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

    const selectedVuln =
        selectedIndex !== null ? currentList[selectedIndex] ?? null : null;

    /* ── Keyboard ──────────────────────────────────────────── */

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    setSelectedIndex((prev) =>
                        prev === null
                            ? 0
                            : Math.min(currentList.length - 1, prev + 1)
                    );
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    setSelectedIndex((prev) =>
                        prev === null ? 0 : Math.max(0, prev - 1)
                    );
                    break;
                case "Escape":
                    e.preventDefault();
                    setSelectedIndex(null);
                    break;
            }
        },
        [currentList.length]
    );

    const switchTab = useCallback((tab: DiffTab) => {
        setActiveTab(tab);
        setSelectedIndex(null);
    }, []);

    const formatLabel = (s: ScanListItem) => {
        const date = new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(s.created_at));
        return `${s.scan_type.toUpperCase()} — ${s.target_url} — ${date}`;
    };

    /* ── Render ────────────────────────────────────────────── */

    return (
        <div className="space-y-8 max-w-[1200px]">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Diff
                </h1>
                <p className="text-sm text-zinc-500 mt-0.5">
                    Compare two scans to track new, resolved, and persistent
                    vulnerabilities.
                </p>
            </div>

            {/* ── Loading / Error ─────────────────────────────── */}
            {loadingScans && (
                <div className="py-16 text-center text-xs text-zinc-600">
                    Loading scan history…
                </div>
            )}

            {scanError && (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] px-5 py-4">
                    <p className="text-xs text-rose-400">{scanError}</p>
                </div>
            )}

            {/* ── Selector ───────────────────────────────────── */}
            {!loadingScans && scans.length >= 2 && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-5"
                >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr_auto] items-end">
                        {/* Baseline */}
                        <div>
                            <label className="block text-[10px] uppercase tracking-[0.2em] text-zinc-600 mb-2">
                                Baseline
                            </label>
                            <select
                                value={baselineId}
                                onChange={(e) => setBaselineId(e.target.value)}
                                className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 appearance-none cursor-pointer transition-colors"
                            >
                                <option value="">Select older scan…</option>
                                {scans.map((s) => (
                                    <option
                                        key={s.id}
                                        value={s.id}
                                        disabled={s.id === compareId}
                                    >
                                        {formatLabel(s)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Arrow */}
                        <div className="hidden md:flex items-center justify-center h-9 text-zinc-700">
                            →
                        </div>

                        {/* Compare */}
                        <div>
                            <label className="block text-[10px] uppercase tracking-[0.2em] text-zinc-600 mb-2">
                                Compare
                            </label>
                            <select
                                value={compareId}
                                onChange={(e) => setCompareId(e.target.value)}
                                className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 appearance-none cursor-pointer transition-colors"
                            >
                                <option value="">Select newer scan…</option>
                                {scans.map((s) => (
                                    <option
                                        key={s.id}
                                        value={s.id}
                                        disabled={s.id === baselineId}
                                    >
                                        {formatLabel(s)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Button */}
                        <button
                            onClick={handleCompare}
                            disabled={
                                !baselineId ||
                                !compareId ||
                                baselineId === compareId ||
                                loadingReports
                            }
                            className="h-9 px-5 rounded-lg text-xs font-medium bg-white/[0.06] text-zinc-200 border border-zinc-700 hover:bg-white/[0.1] hover:border-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            {loadingReports ? "Loading…" : "Compare"}
                        </button>
                    </div>
                </motion.div>
            )}

            {/* ── Not enough scans ────────────────────────────── */}
            {!loadingScans && scans.length < 2 && !scanError && (
                <div className="py-16 text-center">
                    <div className="text-4xl font-light font-mono text-zinc-700 mb-2">
                        {scans.length}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 mb-2">
                        completed scans
                    </div>
                    <p className="text-xs text-zinc-600">
                        You need at least 2 completed scans to perform a diff.
                    </p>
                </div>
            )}

            {/* ── Diff Results ────────────────────────────────── */}
            <AnimatePresence>
                {diffResult && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="space-y-5"
                    >
                        {/* ── Counter tabs ────────────────────────── */}
                        <div className="grid grid-cols-3 gap-px bg-zinc-800/50 rounded-xl overflow-hidden border border-zinc-800/80">
                            {(
                                [
                                    {
                                        key: "new" as DiffTab,
                                        label: "new",
                                        count: diffResult.newVulns.length,
                                        accent: "text-rose-400",
                                    },
                                    {
                                        key: "resolved" as DiffTab,
                                        label: "resolved",
                                        count: diffResult.resolvedVulns.length,
                                        accent: "text-emerald-400",
                                    },
                                    {
                                        key: "unchanged" as DiffTab,
                                        label: "unchanged",
                                        count: diffResult.unchangedVulns.length,
                                        accent: "text-zinc-400",
                                    },
                                ] as const
                            ).map((t) => (
                                <button
                                    key={t.key}
                                    onClick={() => switchTab(t.key)}
                                    className={`bg-zinc-950 px-5 py-4 text-left transition-colors ${
                                        activeTab === t.key
                                            ? "bg-white/[0.02]"
                                            : "hover:bg-white/[0.01]"
                                    }`}
                                >
                                    <div
                                        className={`text-3xl font-light font-mono tracking-tight ${t.accent}`}
                                    >
                                        {t.count}
                                    </div>
                                    <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 mt-1">
                                        {t.label}
                                    </div>
                                    {activeTab === t.key && (
                                        <div className="w-6 h-[2px] bg-zinc-500 mt-2 rounded" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* ── Split Pane ───────────────────────────── */}
                        <div
                            className="triage-split rounded-xl border border-zinc-800/80 overflow-hidden bg-zinc-950/50"
                            onKeyDown={handleKeyDown}
                            tabIndex={0}
                            role="listbox"
                            aria-label={`${activeTab} vulnerabilities`}
                        >
                            {/* List */}
                            <div className="triage-list">
                                {currentList.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full py-12">
                                        <div className="text-4xl font-light font-mono text-zinc-700 mb-2">
                                            0
                                        </div>
                                        <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                                            {activeTab === "new"
                                                ? "new findings"
                                                : activeTab === "resolved"
                                                ? "resolved"
                                                : "unchanged"}
                                        </div>
                                    </div>
                                ) : (
                                    currentList.map((vuln, idx) => {
                                        const state = triageStates.get(
                                            vuln.vuln_id
                                        );
                                        return (
                                            <TriageListItem
                                                key={vuln.vuln_id}
                                                vuln={vuln}
                                                index={idx}
                                                isSelected={
                                                    selectedIndex === idx
                                                }
                                                isFalsePositive={
                                                    state?.is_false_positive ??
                                                    false
                                                }
                                                isMuted={
                                                    state?.is_muted ?? false
                                                }
                                                onSelect={(i) =>
                                                    setSelectedIndex(
                                                        selectedIndex === i
                                                            ? null
                                                            : i
                                                    )
                                                }
                                            />
                                        );
                                    })
                                )}
                            </div>

                            {/* Detail */}
                            {selectedVuln ? (
                                <div className="triage-detail">
                                    <TriageDetailPanel
                                        vuln={selectedVuln}
                                        onClose={() =>
                                            setSelectedIndex(null)
                                        }
                                    />
                                </div>
                            ) : (
                                <div className="triage-detail flex flex-col items-center justify-center">
                                    <div className="text-center space-y-2 px-8">
                                        <p className="text-xs text-zinc-500">
                                            Select a vulnerability to inspect.
                                        </p>
                                        <p className="text-[10px] text-zinc-700">
                                            ↑↓ Navigate · Esc Close
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Footer ──────────────────────────────── */}
                        <div className="flex items-center gap-3 text-[10px] text-zinc-600 font-mono">
                            <span>
                                {scans.find((s) => s.id === baselineId)
                                    ?.target_url ?? "—"}{" "}
                                ({baselineVulns?.length ?? 0})
                            </span>
                            <span className="text-zinc-700">→</span>
                            <span>
                                {scans.find((s) => s.id === compareId)
                                    ?.target_url ?? "—"}{" "}
                                ({compareVulns?.length ?? 0})
                            </span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
