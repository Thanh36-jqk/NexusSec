"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { fetchApi } from "@/lib/api";
import type { ScanJob, APIResponse, Report } from "@/types";

/* ── Severity color dots ──────────────────────────────────── */

const SEV_COLORS: Record<string, string> = {
    critical: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-amber-400",
    low: "bg-blue-500",
    info: "bg-zinc-500",
};

export default function ReportsPage() {
    const [reports, setReports] = useState<
        Array<ScanJob & { summary?: { total: number; critical: number; high: number; medium: number; low: number; info: number } }>
    >([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            try {
                const res = await fetchApi<APIResponse<ScanJob[]>>("/scans");
                const completed = (res.data || []).filter(
                    (s) => s.status === "completed"
                );

                // Fetch summaries in parallel for richer cards
                const withSummaries = await Promise.all(
                    completed.slice(0, 20).map(async (scan) => {
                        try {
                            const r = (await fetchApi(
                                `/scans/${scan.id}/report`
                            )) as APIResponse<Report>;
                            return { ...scan, summary: r.data?.summary };
                        } catch {
                            return { ...scan, summary: undefined };
                        }
                    })
                );
                setReports(withSummaries);
            } catch (err: any) {
                setError(err.message || "Failed to load reports");
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    const fmt = (d: string) =>
        new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        }).format(new Date(d));

    return (
        <div className="space-y-8 max-w-[1000px]">
            {/* ── Header ─────────────────────────────────────── */}
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Reports
                </h1>
                <p className="text-sm text-zinc-500 mt-0.5">
                    Detailed vulnerability analysis from completed scans.
                </p>
            </div>

            {/* ── Error ──────────────────────────────────────── */}
            {error && (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] px-5 py-4">
                    <p className="text-xs text-rose-400">{error}</p>
                </div>
            )}

            {/* ── Loading ────────────────────────────────────── */}
            {loading && (
                <div className="py-20 text-center text-xs text-zinc-600">
                    Loading…
                </div>
            )}

            {/* ── Empty ──────────────────────────────────────── */}
            {!loading && !error && reports.length === 0 && (
                <div className="py-20 text-center">
                    <div className="text-4xl font-light font-mono text-zinc-700 mb-2">
                        0
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 mb-6">
                        reports available
                    </div>
                    <Link
                        href="/scans/new"
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        Run a scan to generate reports →
                    </Link>
                </div>
            )}

            {/* ── Report Grid ────────────────────────────────── */}
            {!loading && !error && reports.length > 0 && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {reports.map((report, i) => {
                        const s = report.summary;
                        const total = s?.total ?? 0;
                        const hasCritical = (s?.critical ?? 0) > 0;
                        const hasHigh = (s?.high ?? 0) > 0;

                        return (
                            <motion.div
                                key={report.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.04, duration: 0.3 }}
                            >
                                <Link
                                    href={`/scans/${report.id}?tab=summary`}
                                    className={`group block rounded-xl border bg-zinc-950/50 p-5 transition-all hover:bg-white/[0.02] ${
                                        hasCritical
                                            ? "border-red-500/20 hover:border-red-500/40"
                                            : hasHigh
                                            ? "border-orange-500/15 hover:border-orange-500/30"
                                            : "border-zinc-800/80 hover:border-zinc-700"
                                    }`}
                                >
                                    {/* Top row */}
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-mono text-zinc-300 uppercase mb-1">
                                                {report.scan_type}
                                            </div>
                                            <div className="text-sm text-zinc-400 truncate">
                                                {report.target_url}
                                            </div>
                                        </div>
                                        <div className="text-right pl-3">
                                            <div className="text-2xl font-light font-mono text-foreground leading-none">
                                                {total}
                                            </div>
                                            <div className="text-[9px] uppercase tracking-[0.15em] text-zinc-600 mt-0.5">
                                                findings
                                            </div>
                                        </div>
                                    </div>

                                    {/* Severity bar */}
                                    {s && total > 0 && (
                                        <div className="flex gap-px h-1.5 rounded-full overflow-hidden mb-4">
                                            {(
                                                [
                                                    ["critical", s.critical],
                                                    ["high", s.high],
                                                    ["medium", s.medium],
                                                    ["low", s.low],
                                                    ["info", s.info],
                                                ] as [string, number][]
                                            )
                                                .filter(([, v]) => v > 0)
                                                .map(([severity, count]) => (
                                                    <div
                                                        key={severity}
                                                        className={`${SEV_COLORS[severity]} opacity-70`}
                                                        style={{
                                                            width: `${(count / total) * 100}%`,
                                                        }}
                                                    />
                                                ))}
                                        </div>
                                    )}

                                    {/* Bottom */}
                                    <div className="flex items-center justify-between pt-3 border-t border-zinc-800/40">
                                        <span className="text-[10px] font-mono text-zinc-600">
                                            {fmt(report.created_at)}
                                        </span>
                                        <span className="text-[10px] text-zinc-600 group-hover:text-zinc-400 transition-colors">
                                            Open →
                                        </span>
                                    </div>
                                </Link>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
