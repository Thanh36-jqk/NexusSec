"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { fetchApi } from "@/lib/api";
import type { ScanJob } from "@/types";

/* ── Status ───────────────────────────────────────────────── */

const STATUS_DOT: Record<string, string> = {
    completed: "bg-emerald-400",
    failed: "bg-rose-400",
    running: "bg-blue-400 animate-pulse",
    pending: "bg-zinc-500 animate-pulse",
    cancelled: "bg-zinc-600",
};

/* ── Page ──────────────────────────────────────────────────── */

export default function ScansPage() {
    const [scans, setScans] = useState<ScanJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchScans = useCallback(async () => {
        try {
            const data = await fetchApi<{ data: ScanJob[] }>("/scans");
            setScans(data.data || []);
        } catch (err: any) {
            setError(err instanceof Error ? err.message : "Failed to load scans");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchScans();
    }, [fetchScans]);

    const fmt = (d: string) =>
        new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(new Date(d));

    return (
        <div className="space-y-8 max-w-[1000px]">
            {/* ── Header ─────────────────────────────────────── */}
            <div className="flex items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        Scans
                    </h1>
                    <p className="text-sm text-zinc-500 mt-0.5">
                        All vulnerability scan jobs.
                    </p>
                </div>
                <Link
                    href="/scans/new"
                    className="h-9 px-4 rounded-lg text-xs font-medium bg-white/[0.06] text-zinc-200 border border-zinc-700 hover:bg-white/[0.1] hover:border-zinc-500 transition-all inline-flex items-center gap-1.5"
                >
                    <span className="text-zinc-400">+</span> New Scan
                </Link>
            </div>

            {/* ── Error ──────────────────────────────────────── */}
            {error && !loading && (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] px-5 py-4">
                    <p className="text-xs text-rose-400">{error}</p>
                    <button
                        onClick={() => {
                            setError(null);
                            setLoading(true);
                            fetchScans();
                        }}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 mt-2 transition-colors"
                    >
                        Retry →
                    </button>
                </div>
            )}

            {/* ── Loading ────────────────────────────────────── */}
            {loading && (
                <div className="py-20 text-center text-xs text-zinc-600">
                    Loading…
                </div>
            )}

            {/* ── Empty ──────────────────────────────────────── */}
            {!loading && !error && scans.length === 0 && (
                <div className="py-20 text-center">
                    <div className="text-4xl font-light font-mono text-zinc-700 mb-2">
                        0
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 mb-6">
                        scans recorded
                    </div>
                    <Link
                        href="/scans/new"
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        Launch your first scan →
                    </Link>
                </div>
            )}

            {/* ── Scan Table ─────────────────────────────────── */}
            {!loading && !error && scans.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                    className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 overflow-hidden"
                >
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-zinc-800/40">
                                {["Engine", "Target", "Status", "Progress", "Created"].map(
                                    (h) => (
                                        <th
                                            key={h}
                                            className="text-left px-5 py-3 text-[10px] uppercase tracking-[0.15em] text-zinc-600 font-medium"
                                        >
                                            {h}
                                        </th>
                                    )
                                )}
                                <th className="w-10" />
                            </tr>
                        </thead>
                        <tbody>
                            {scans.map((scan, i) => {
                                const sl = scan.status.toLowerCase();
                                const isTerminal = ["completed", "failed", "cancelled"].includes(sl);
                                const progress = isTerminal
                                    ? sl === "completed"
                                        ? 100
                                        : scan.progress
                                    : scan.progress;

                                return (
                                    <motion.tr
                                        key={scan.id}
                                        initial={{ opacity: 0, x: -6 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{
                                            delay: i * 0.03,
                                            duration: 0.25,
                                        }}
                                        className="border-b border-zinc-800/25 hover:bg-white/[0.015] transition-colors group"
                                    >
                                        <td className="px-5 py-3.5">
                                            <span className="text-xs font-mono text-zinc-300 uppercase">
                                                {scan.scan_type}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className="text-xs text-zinc-400 truncate block max-w-[300px]">
                                                {scan.target_url}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className={`w-1.5 h-1.5 rounded-full ${
                                                        STATUS_DOT[sl] || "bg-zinc-600"
                                                    }`}
                                                />
                                                <span className="text-xs text-zinc-500 capitalize">
                                                    {scan.status}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            {/* Mini progress bar */}
                                            <div className="flex items-center gap-2">
                                                <div className="w-16 h-1 rounded-full bg-zinc-800 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${
                                                            sl === "completed"
                                                                ? "bg-emerald-500"
                                                                : sl === "failed"
                                                                ? "bg-rose-500"
                                                                : "bg-blue-500"
                                                        }`}
                                                        style={{
                                                            width: `${progress}%`,
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-[10px] font-mono text-zinc-600 w-7 text-right">
                                                    {progress}%
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className="text-xs text-zinc-600 font-mono">
                                                {fmt(scan.created_at)}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3.5">
                                            <Link
                                                href={`/scans/${scan.id}`}
                                                className="text-zinc-700 hover:text-zinc-400 transition-colors text-xs"
                                            >
                                                →
                                            </Link>
                                        </td>
                                    </motion.tr>
                                );
                            })}
                        </tbody>
                    </table>
                </motion.div>
            )}
        </div>
    );
}
