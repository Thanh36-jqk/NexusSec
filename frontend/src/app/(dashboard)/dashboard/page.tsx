"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { fetchApi } from "@/lib/api";
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ScanJob, ReportSummary, APIResponse, Report } from "@/types";

/* ── Constants ─────────────────────────────────────────────── */

const SEVERITY_COLORS: Record<string, string> = {
    Critical: "#ef4444",
    High: "#f97316",
    Medium: "#eab308",
    Low: "#3b82f6",
    Info: "#52525b",
};

const STATUS_DOT: Record<string, string> = {
    completed: "bg-emerald-400",
    failed: "bg-rose-400",
    running: "bg-blue-400 animate-pulse",
    pending: "bg-zinc-500 animate-pulse",
};

/* ── Page Component ────────────────────────────────────────── */

export default function DashboardPage() {
    const router = useRouter();
    const [scans, setScans] = useState<ScanJob[]>([]);
    const [loading, setLoading] = useState(true);

    const [selectedScan, setSelectedScan] = useState<ScanJob | null>(null);
    const [selectedReport, setSelectedReport] = useState<ReportSummary | null>(null);
    const [reportLoading, setReportLoading] = useState(false);

    // Trend data — severity distribution across last N completed scans
    const [trendData, setTrendData] = useState<Array<Record<string, unknown>>>([]);

    // Quick-launch
    const [quickUrl, setQuickUrl] = useState("");
    const [quickType, setQuickType] = useState<"zap" | "nmap" | "full">("zap");
    const [quickLoading, setQuickLoading] = useState(false);

    /* ── Data loading ──────────────────────────────────────── */

    useEffect(() => {
        const load = async () => {
            try {
                const res = (await fetchApi("/scans")) as APIResponse<ScanJob[]>;
                const data = res.data || [];
                setScans(data);

                const completed = data.filter(
                    (s) => s.status.toLowerCase() === "completed"
                );
                if (completed.length > 0) {
                    setSelectedScan(completed[0]);
                }

                // Fetch reports for last 7 completed scans → build trend
                const last7 = completed.slice(0, 7).reverse();
                const trend: Array<Record<string, unknown>> = [];
                for (const scan of last7) {
                    try {
                        const r = (await fetchApi(
                            `/scans/${scan.id}/report`
                        )) as APIResponse<Report>;
                        if (r.data?.summary) {
                            const s = r.data.summary;
                            trend.push({
                                name: scan.scan_type.toUpperCase(),
                                Critical: s.critical,
                                High: s.high,
                                Medium: s.medium,
                                Low: s.low,
                                Info: s.info,
                            });
                        }
                    } catch {
                        /* skip */
                    }
                }
                setTrendData(trend);
            } catch (err) {
                console.error("Dashboard load failed", err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    /* ── Report for selected scan ──────────────────────────── */

    const fetchReport = useCallback(async (scan: ScanJob) => {
        setReportLoading(true);
        setSelectedReport(null);
        try {
            const r = (await fetchApi(
                `/scans/${scan.id}/report`
            )) as APIResponse<Report>;
            setSelectedReport(r.data?.summary ?? null);
        } catch {
            setSelectedReport(null);
        } finally {
            setReportLoading(false);
        }
    }, []);

    useEffect(() => {
        if (selectedScan?.status.toLowerCase() === "completed") {
            fetchReport(selectedScan);
        } else {
            setSelectedReport(null);
        }
    }, [selectedScan, fetchReport]);

    /* ── Quick launch ──────────────────────────────────────── */

    const handleQuickLaunch = async () => {
        if (!quickUrl.trim()) return;
        setQuickLoading(true);
        try {
            // Create target first
            const tRes = (await fetchApi("/targets", {
                method: "POST",
                body: JSON.stringify({
                    name: new URL(quickUrl).hostname,
                    base_url: quickUrl,
                    description: "Quick launch from dashboard",
                }),
            })) as { data: { id: string } };

            // Start scan
            const sRes = (await fetchApi("/scans", {
                method: "POST",
                body: JSON.stringify({
                    target_id: tRes.data.id,
                    scan_type: quickType,
                }),
            })) as { data: { id: string } };

            router.push(`/scans/${sRes.data.id}`);
        } catch (err: any) {
            console.error("Quick launch failed:", err.message);
        } finally {
            setQuickLoading(false);
        }
    };

    /* ── Derived stats ─────────────────────────────────────── */

    const stats = {
        total: scans.length,
        completed: scans.filter((s) => s.status.toLowerCase() === "completed").length,
        active: scans.filter((s) =>
            ["running", "pending"].includes(s.status.toLowerCase())
        ).length,
        failed: scans.filter((s) => s.status.toLowerCase() === "failed").length,
    };

    /* ── Chart data ────────────────────────────────────────── */

    const chartData = selectedReport
        ? [
              { name: "Critical", value: selectedReport.critical, color: SEVERITY_COLORS.Critical },
              { name: "High", value: selectedReport.high, color: SEVERITY_COLORS.High },
              { name: "Medium", value: selectedReport.medium, color: SEVERITY_COLORS.Medium },
              { name: "Low", value: selectedReport.low, color: SEVERITY_COLORS.Low },
              { name: "Info", value: selectedReport.info, color: SEVERITY_COLORS.Info },
          ].filter((d) => d.value > 0)
        : [];

    const totalFindings = selectedReport?.total ?? 0;

    /* ── Render ─────────────────────────────────────────────── */

    return (
        <div className="space-y-8 max-w-[1200px]">
            {/* ── Header Row ─────────────────────────────────── */}
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        Overview
                    </h1>
                    <p className="text-sm text-zinc-500 mt-0.5">
                        Security posture at a glance.
                    </p>
                </div>

                {/* Quick Launch */}
                <div className="flex items-center gap-2">
                    <input
                        type="url"
                        placeholder="https://target.com"
                        value={quickUrl}
                        onChange={(e) => setQuickUrl(e.target.value)}
                        className="h-9 w-56 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-sm text-foreground placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                    />
                    <select
                        value={quickType}
                        onChange={(e) => setQuickType(e.target.value as typeof quickType)}
                        className="h-9 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 appearance-none cursor-pointer"
                    >
                        <option value="zap">ZAP</option>
                        <option value="nmap">Nmap</option>
                        <option value="full">Full</option>
                    </select>
                    <button
                        onClick={handleQuickLaunch}
                        disabled={quickLoading || !quickUrl.trim()}
                        className="h-9 px-4 rounded-lg text-xs font-medium bg-white/[0.06] text-zinc-200 border border-zinc-700 hover:bg-white/[0.1] hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                        {quickLoading ? "..." : "Scan"}
                    </button>
                </div>
            </div>

            {/* ── Metrics Row ────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-zinc-800/50 rounded-xl overflow-hidden border border-zinc-800/80">
                {[
                    { label: "scans", value: stats.total },
                    { label: "clear", value: stats.completed },
                    { label: "active", value: stats.active },
                    { label: "failed", value: stats.failed },
                ].map((m, i) => (
                    <motion.div
                        key={m.label}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06, duration: 0.35 }}
                        className="bg-zinc-950 px-5 py-4"
                    >
                        <div className="text-3xl font-light font-mono text-foreground tracking-tight">
                            {loading ? "—" : m.value}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mt-1">
                            {m.label}
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* ── Charts Row ─────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Severity Breakdown (doughnut) */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.4 }}
                    className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 overflow-hidden"
                >
                    <div className="px-5 py-3 border-b border-zinc-800/60 flex items-center justify-between">
                        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                            Severity Breakdown
                        </h2>
                        {selectedScan && (
                            <Link
                                href={`/scans/${selectedScan.id}`}
                                className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                            >
                                Open →
                            </Link>
                        )}
                    </div>
                    <div className="p-5 min-h-[280px] flex items-center justify-center">
                        <AnimatePresence mode="wait">
                            {loading || reportLoading ? (
                                <motion.div
                                    key="loader"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="text-xs text-zinc-600"
                                >
                                    Loading…
                                </motion.div>
                            ) : !selectedScan || chartData.length === 0 ? (
                                <motion.div
                                    key="empty"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="text-center"
                                >
                                    <div className="text-4xl font-light font-mono text-emerald-400">0</div>
                                    <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mt-2">
                                        vulnerabilities
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key={selectedScan.id}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ duration: 0.3 }}
                                    className="flex items-center gap-6 w-full"
                                >
                                    <div className="h-[220px] w-[220px] shrink-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={chartData}
                                                    innerRadius={60}
                                                    outerRadius={85}
                                                    paddingAngle={2}
                                                    dataKey="value"
                                                    stroke="none"
                                                >
                                                    {chartData.map((entry, i) => (
                                                        <Cell key={i} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    contentStyle={{
                                                        background: "#18181b",
                                                        border: "1px solid #27272a",
                                                        borderRadius: "8px",
                                                        fontSize: "12px",
                                                    }}
                                                    itemStyle={{ color: "#fafafa" }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="flex-1 space-y-3">
                                        <div>
                                            <div className="text-3xl font-light font-mono text-foreground">
                                                {totalFindings}
                                            </div>
                                            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mt-0.5">
                                                total findings
                                            </div>
                                        </div>
                                        <div className="h-px bg-zinc-800/60" />
                                        <div className="space-y-1.5">
                                            {chartData.map((d) => (
                                                <div key={d.name} className="flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            className="w-2 h-2 rounded-full"
                                                            style={{ background: d.color }}
                                                        />
                                                        <span className="text-zinc-400">{d.name}</span>
                                                    </div>
                                                    <span className="font-mono text-zinc-300">{d.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>

                {/* Right: Severity Trend (stacked bar) */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25, duration: 0.4 }}
                    className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 overflow-hidden"
                >
                    <div className="px-5 py-3 border-b border-zinc-800/60">
                        <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                            Scan Trend
                        </h2>
                    </div>
                    <div className="p-5 min-h-[280px] flex items-center justify-center">
                        {loading ? (
                            <div className="text-xs text-zinc-600">Loading…</div>
                        ) : trendData.length === 0 ? (
                            <div className="text-center">
                                <div className="text-xs text-zinc-600">
                                    Not enough data yet — complete more scans.
                                </div>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={trendData} barCategoryGap="20%">
                                    <CartesianGrid
                                        vertical={false}
                                        stroke="#27272a"
                                        strokeDasharray="3 3"
                                    />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fontSize: 10, fill: "#52525b" }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 10, fill: "#52525b" }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={28}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            background: "#18181b",
                                            border: "1px solid #27272a",
                                            borderRadius: "8px",
                                            fontSize: "11px",
                                        }}
                                        itemStyle={{ color: "#a1a1aa" }}
                                    />
                                    <Bar dataKey="Critical" stackId="a" fill={SEVERITY_COLORS.Critical} radius={[0, 0, 0, 0]} />
                                    <Bar dataKey="High" stackId="a" fill={SEVERITY_COLORS.High} />
                                    <Bar dataKey="Medium" stackId="a" fill={SEVERITY_COLORS.Medium} />
                                    <Bar dataKey="Low" stackId="a" fill={SEVERITY_COLORS.Low} />
                                    <Bar dataKey="Info" stackId="a" fill={SEVERITY_COLORS.Info} radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* ── Recent Activity Table ───────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.4 }}
                className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 overflow-hidden"
            >
                <div className="px-5 py-3 border-b border-zinc-800/60 flex items-center justify-between">
                    <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        Recent Activity
                    </h2>
                    <Link
                        href="/scans"
                        className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                        View all →
                    </Link>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-xs text-zinc-600">Loading…</div>
                ) : scans.length === 0 ? (
                    <div className="p-8 text-center text-xs text-zinc-600">
                        No scans yet — use the form above to launch your first scan.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-800/40">
                                    <th className="text-left px-5 py-2.5 text-[10px] uppercase tracking-[0.15em] text-zinc-600 font-medium">
                                        Engine
                                    </th>
                                    <th className="text-left px-5 py-2.5 text-[10px] uppercase tracking-[0.15em] text-zinc-600 font-medium">
                                        Target
                                    </th>
                                    <th className="text-left px-5 py-2.5 text-[10px] uppercase tracking-[0.15em] text-zinc-600 font-medium">
                                        Status
                                    </th>
                                    <th className="text-left px-5 py-2.5 text-[10px] uppercase tracking-[0.15em] text-zinc-600 font-medium">
                                        Date
                                    </th>
                                    <th className="w-8" />
                                </tr>
                            </thead>
                            <tbody>
                                {scans.slice(0, 8).map((scan, i) => {
                                    const sl = scan.status.toLowerCase();
                                    const isSelected = selectedScan?.id === scan.id;
                                    return (
                                        <motion.tr
                                            key={scan.id}
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.35 + i * 0.04, duration: 0.3 }}
                                            onClick={() => setSelectedScan(scan)}
                                            className={`border-b border-zinc-800/30 cursor-pointer transition-colors ${
                                                isSelected
                                                    ? "bg-white/[0.03]"
                                                    : "hover:bg-white/[0.02]"
                                            }`}
                                        >
                                            <td className="px-5 py-3">
                                                <span className="text-xs font-mono text-zinc-300 uppercase">
                                                    {scan.scan_type}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className="text-xs text-zinc-400 truncate block max-w-[280px]">
                                                    {scan.target_url}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3">
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
                                            <td className="px-5 py-3">
                                                <span className="text-xs text-zinc-600 font-mono">
                                                    {new Intl.DateTimeFormat("en-US", {
                                                        month: "short",
                                                        day: "numeric",
                                                    }).format(new Date(scan.created_at))}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3">
                                                <Link
                                                    href={`/scans/${scan.id}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="text-zinc-700 hover:text-zinc-400 transition-colors"
                                                >
                                                    →
                                                </Link>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
