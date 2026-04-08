"use client";

import { useEffect, useState, useCallback } from "react";
import {
    Activity, CheckCircle2, ShieldAlert, Timer, XCircle,
    ChevronRight, BarChart3, Target, ExternalLink, Loader2
} from "lucide-react";
import { fetchApi } from "@/lib/api";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import Link from "next/link";
import { ScanJob, ReportSummary, APIResponse, Report } from "@/types";

const SEVERITY_COLORS: Record<string, string> = {
    Critical: "#ef4444",
    High: "#f97316",
    Medium: "#f59e0b",
    Low: "#3b82f6",
    Info: "#6b7280",
};

export default function DashboardPage() {
    const [scans, setScans] = useState<ScanJob[]>([]);
    const [loading, setLoading] = useState(true);
    // selectedScan drives the left panel. null = show auto-latest
    const [selectedScan, setSelectedScan] = useState<ScanJob | null>(null);
    const [selectedReport, setSelectedReport] = useState<ReportSummary | null>(null);
    const [reportLoading, setReportLoading] = useState(false);

    // ── Initial load ──────────────────────────────────────────
    useEffect(() => {
        const loadDashboard = async () => {
            try {
                const res = await fetchApi("/scans") as APIResponse<ScanJob[]>;
                const scanData = res.data || [];
                setScans(scanData);

                // Auto-select the latest completed scan
                const latest = scanData.find(s => s.status.toLowerCase() === "completed");
                if (latest) {
                    setSelectedScan(latest);
                }
            } catch (err) {
                console.error("Failed to load dashboard data", err);
            } finally {
                setLoading(false);
            }
        };
        loadDashboard();
    }, []);

    // ── Fetch report whenever selectedScan changes ─────────────
    const fetchReportForScan = useCallback(async (scan: ScanJob) => {
        setReportLoading(true);
        setSelectedReport(null);
        try {
            const reportRes = await fetchApi(`/scans/${scan.id}/report`) as APIResponse<Report>;
            setSelectedReport(reportRes.data?.summary ?? null);
        } catch {
            setSelectedReport(null);
        } finally {
            setReportLoading(false);
        }
    }, []);

    useEffect(() => {
        if (selectedScan && selectedScan.status.toLowerCase() === "completed") {
            fetchReportForScan(selectedScan);
        } else {
            setSelectedReport(null);
        }
    }, [selectedScan, fetchReportForScan]);

    // ── Derived stats ─────────────────────────────────────────
    const stats = {
        total: scans.length,
        completed: scans.filter(s => s.status.toLowerCase() === "completed").length,
        active: scans.filter(s => ["running", "pending"].includes(s.status.toLowerCase())).length,
        failed: scans.filter(s => s.status.toLowerCase() === "failed").length,
    };

    // ── Chart data ────────────────────────────────────────────
    const rawChartData = selectedReport ? [
        { name: "Critical", value: selectedReport.critical, color: SEVERITY_COLORS.Critical },
        { name: "High",     value: selectedReport.high,     color: SEVERITY_COLORS.High },
        { name: "Medium",   value: selectedReport.medium,   color: SEVERITY_COLORS.Medium },
        { name: "Low",      value: selectedReport.low,      color: SEVERITY_COLORS.Low },
        { name: "Info",     value: selectedReport.info,     color: SEVERITY_COLORS.Info },
    ] : [];
    const chartData = rawChartData.filter(d => d.value > 0);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Command Center</h1>
                <p className="text-muted-foreground mt-1 text-sm">
                    Click any scan in the list to drill into its vulnerability breakdown.
                </p>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <MetricCard icon={<Target className="h-5 w-5 text-primary" />}        label="Total Scans" value={loading ? "-" : stats.total} />
                <MetricCard icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} label="Completed"   value={loading ? "-" : stats.completed} />
                <MetricCard icon={<Timer className="h-5 w-5 text-amber-500 animate-pulse" />} label="Active"  value={loading ? "-" : stats.active} />
                <MetricCard icon={<XCircle className="h-5 w-5 text-rose-500" />}      label="Failed"      value={loading ? "-" : stats.failed} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ── Left: Selected Scan Chart ─────────────────── */}
                <div className="lg:col-span-2 rounded-xl border border-border bg-card/60 backdrop-blur-md overflow-hidden shadow-sm flex flex-col">
                    <div className="border-b border-border bg-muted/20 px-6 py-4 flex items-center justify-between flex-wrap gap-2">
                        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <BarChart3 className="h-4 w-4" />
                            {selectedScan ? (
                                <span className="truncate max-w-[260px]">
                                    {selectedScan.scan_type.toUpperCase()} — {selectedScan.target_url}
                                </span>
                            ) : "Scan Breakdown"}
                        </h2>
                        <div className="flex items-center gap-3">
                            {selectedReport && (
                                <span className="text-xs font-medium px-2 py-1 bg-primary/10 text-primary rounded-md">
                                    {selectedReport.total} Findings
                                </span>
                            )}
                            {selectedScan && (
                                <Link
                                    href={`/scans/${selectedScan.id}`}
                                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                                >
                                    Full Report <ExternalLink className="h-3 w-3" />
                                </Link>
                            )}
                        </div>
                    </div>

                    <div className="p-6 flex-1 flex flex-col justify-center items-center min-h-[300px]">
                        {loading ? (
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        ) : !selectedScan ? (
                            <div className="text-center py-12">
                                <ShieldAlert className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                                <p className="text-sm text-muted-foreground">No completed scans yet.</p>
                            </div>
                        ) : reportLoading ? (
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-xs text-muted-foreground">Loading report…</p>
                            </div>
                        ) : selectedScan.status.toLowerCase() !== "completed" ? (
                            <div className="text-center py-12">
                                <Timer className="h-12 w-12 text-amber-500/60 mx-auto mb-3 animate-pulse" />
                                <p className="text-sm text-muted-foreground">
                                    This scan is <span className="font-semibold capitalize">{selectedScan.status}</span> — report will appear when it completes.
                                </p>
                            </div>
                        ) : chartData.length === 0 ? (
                            <div className="text-center py-12">
                                <CheckCircle2 className="h-16 w-16 text-emerald-500/80 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-foreground">Clean Scan!</h3>
                                <p className="text-sm text-muted-foreground mt-1">No vulnerabilities detected in this scan.</p>
                            </div>
                        ) : (
                            <div className="h-[280px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={chartData}
                                            innerRadius={70}
                                            outerRadius={100}
                                            paddingAngle={3}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {chartData.map((entry, i) => (
                                                <Cell key={i} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)", borderRadius: "8px" }}
                                            itemStyle={{ color: "var(--foreground)" }}
                                        />
                                        <Legend verticalAlign="bottom" height={36} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right: Clickable Execution List ──────────── */}
                <div className="rounded-xl border border-border bg-card/60 backdrop-blur-md overflow-hidden shadow-sm flex flex-col">
                    <div className="border-b border-border bg-muted/20 px-6 py-4">
                        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Activity className="h-4 w-4" /> Recent Executions
                        </h2>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Click to view breakdown</p>
                    </div>

                    <div className="flex-1 divide-y divide-border/50 overflow-y-auto max-h-[380px]">
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="p-4 flex gap-3 animate-pulse">
                                    <div className="w-2 h-2 mt-1.5 rounded-full bg-muted" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3 bg-muted rounded w-3/4" />
                                        <div className="h-3 bg-muted rounded w-1/2" />
                                    </div>
                                </div>
                            ))
                        ) : scans.length === 0 ? (
                            <div className="p-8 text-center text-sm text-muted-foreground">No scans found.</div>
                        ) : (
                            scans.slice(0, 10).map(scan => {
                                const isSelected = selectedScan?.id === scan.id;
                                const statusLower = scan.status.toLowerCase();
                                return (
                                    <button
                                        key={scan.id}
                                        onClick={() => setSelectedScan(scan)}
                                        className={`w-full text-left p-4 flex items-center gap-3 transition-colors group ${
                                            isSelected
                                                ? "bg-primary/10 border-l-2 border-primary"
                                                : "hover:bg-muted/30 border-l-2 border-transparent"
                                        }`}
                                    >
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                                            statusLower === "completed" ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" :
                                            statusLower === "failed"    ? "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]" :
                                            "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)] animate-pulse"
                                        }`} />
                                        <div className="flex-1 overflow-hidden">
                                            <div className="text-xs font-semibold text-foreground truncate">
                                                {scan.scan_type.toUpperCase()} ENGINE
                                            </div>
                                            <div className="text-[10px] text-muted-foreground truncate">
                                                {scan.target_url}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground/60 mt-0.5 capitalize">
                                                {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(scan.created_at))} · {scan.status}
                                            </div>
                                        </div>
                                        <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-colors ${isSelected ? "text-primary" : "text-muted-foreground/40 group-hover:text-primary"}`} />
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {scans.length > 0 && (
                        <div className="border-t border-border px-4 py-3">
                            <Link href="/scans" className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                                View all scans <ChevronRight className="h-3 w-3" />
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
    return (
        <div className="rounded-xl border border-border bg-card/60 backdrop-blur-md p-5 flex items-center gap-4 shadow-sm hover:border-primary/30 transition-colors">
            <div className="p-3 bg-muted/30 rounded-lg shrink-0">{icon}</div>
            <div>
                <div className="text-2xl font-bold text-foreground leading-none mb-1">{value}</div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
            </div>
        </div>
    );
}
