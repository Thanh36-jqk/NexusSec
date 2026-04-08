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

    // Filters
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");

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

    // Filtered scans
    const filtered = scans.filter((s) => {
        const matchSearch =
            !search ||
            s.target_url.toLowerCase().includes(search.toLowerCase()) ||
            s.scan_type.toLowerCase().includes(search.toLowerCase());
        const matchStatus =
            statusFilter === "all" || s.status.toLowerCase() === statusFilter;
        return matchSearch && matchStatus;
    });

    // Stats
    const counts = {
        all: scans.length,
        completed: scans.filter((s) => s.status.toLowerCase() === "completed").length,
        running: scans.filter((s) => ["running", "pending"].includes(s.status.toLowerCase())).length,
        failed: scans.filter((s) => s.status.toLowerCase() === "failed").length,
    };

    return (
        <div className="space-y-6 max-w-[1100px]">
            {/* ── Header ─────────────────────────────────────── */}
            <div className="flex items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        Scans
                    </h1>
                    <p className="text-sm text-zinc-500 mt-0.5">
                        Manage and monitor your vulnerability scan jobs.
                    </p>
                </div>
                <Link
                    href="/scans/new"
                    className="h-10 px-5 rounded-xl text-sm font-medium inline-flex items-center gap-2 transition-all"
                    style={{
                        background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                        color: "#fff",
                        boxShadow: "0 0 0 1px rgba(59,130,246,0.3), 0 4px 20px rgba(59,130,246,0.25)",
                    }}
                >
                    <span className="text-blue-200 text-lg leading-none">+</span>
                    New Scan
                </Link>
            </div>

            {/* ── Filter Bar ─────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col sm:flex-row gap-3"
            >
                {/* Search */}
                <div className="flex-1">
                    <input
                        type="text"
                        placeholder="Search by target or engine…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-sm text-foreground placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                    />
                </div>

                {/* Status tabs */}
                <div className="flex gap-1 bg-zinc-900/80 rounded-lg p-0.5 border border-zinc-800/60">
                    {(
                        [
                            { key: "all", label: "All" },
                            { key: "completed", label: "Done" },
                            { key: "running", label: "Active" },
                            { key: "failed", label: "Failed" },
                        ] as const
                    ).map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setStatusFilter(tab.key)}
                            className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                                statusFilter === tab.key
                                    ? "bg-zinc-800 text-zinc-200 shadow-sm"
                                    : "text-zinc-500 hover:text-zinc-400"
                            }`}
                        >
                            {tab.label}
                            <span className="ml-1.5 text-zinc-600">
                                {counts[tab.key as keyof typeof counts] ?? 0}
                            </span>
                        </button>
                    ))}
                </div>
            </motion.div>

            {/* ── Error ──────────────────────────────────────── */}
            {error && !loading && (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] px-5 py-4 flex items-center justify-between">
                    <p className="text-xs text-rose-400">{error}</p>
                    <button
                        onClick={() => {
                            setError(null);
                            setLoading(true);
                            fetchScans();
                        }}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
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
                    <div className="text-5xl font-extralight font-mono text-zinc-800 mb-3">
                        ∅
                    </div>
                    <p className="text-sm text-zinc-500 mb-4">
                        No scans recorded yet.
                    </p>
                    <Link
                        href="/scans/new"
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                        Launch your first scan →
                    </Link>
                </div>
            )}

            {/* ── No results for filter ──────────────────────── */}
            {!loading && !error && scans.length > 0 && filtered.length === 0 && (
                <div className="py-16 text-center">
                    <p className="text-sm text-zinc-500">No scans match your filters.</p>
                    <button
                        onClick={() => {
                            setSearch("");
                            setStatusFilter("all");
                        }}
                        className="text-xs text-zinc-600 hover:text-zinc-400 mt-2 transition-colors"
                    >
                        Clear filters →
                    </button>
                </div>
            )}

            {/* ── Scan Table ─────────────────────────────────── */}
            {!loading && !error && filtered.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                    className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 overflow-hidden"
                >
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-zinc-800/40">
                                {["Engine", "Target", "Status", "Progress", "Created", ""].map(
                                    (h) => (
                                        <th
                                            key={h || "action"}
                                            className={`text-left px-5 py-3 text-[10px] uppercase tracking-[0.15em] text-zinc-600 font-medium ${
                                                h === "" ? "w-16" : ""
                                            }`}
                                        >
                                            {h}
                                        </th>
                                    )
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((scan, i) => {
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
                                        className="border-b border-zinc-800/25 hover:border-l-zinc-600 border-l-2 border-l-transparent transition-all group"
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
                                        <td className="px-5 py-3.5 text-right">
                                            <Link
                                                href={`/scans/${scan.id}`}
                                                className="inline-flex h-7 px-3 rounded-md text-[10px] font-medium items-center bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700/40 transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                View
                                            </Link>
                                        </td>
                                    </motion.tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Table footer */}
                    <div className="px-5 py-2.5 border-t border-zinc-800/40 flex items-center justify-between">
                        <span className="text-[10px] text-zinc-600">
                            {filtered.length} of {scans.length} scans
                        </span>
                        {filtered.length < scans.length && (
                            <button
                                onClick={() => {
                                    setSearch("");
                                    setStatusFilter("all");
                                }}
                                className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                            >
                                Clear filters
                            </button>
                        )}
                    </div>
                </motion.div>
            )}
        </div>
    );
}
