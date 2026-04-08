"use client";

import { useEffect, useState } from "react";
import { Activity, CheckCircle2, ShieldAlert, Timer, XCircle, ChevronRight, BarChart3, Target } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import Link from "next/link";
import { ScanJob, ReportSummary, APIResponse, Report } from "@/types";

export default function DashboardPage() {
    const [scans, setScans] = useState<ScanJob[]>([]);
    const [latestReport, setLatestReport] = useState<ReportSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadDashboard = async () => {
            try {
                // Fetch all scans
                const res = await fetchApi("/scans") as APIResponse<ScanJob[]>;
                const scanData = res.data || [];
                setScans(scanData);

                // Find the latest completed scan (must be uppercase COMPLETED from backend enum!)
                const latestCompleted = scanData.find((s) => s.status.toLowerCase() === "completed");
                if (latestCompleted) {
                    const reportRes = await fetchApi(`/scans/${latestCompleted.id}/report`) as APIResponse<Report>;
                    setLatestReport(reportRes.data.summary);
                }
            } catch (err) {
                console.error("Failed to load dashboard data", err);
            } finally {
                setLoading(false);
            }
        };

        loadDashboard();
    }, []);

    // Derived statistics
    const stats = {
        total: scans.length,
        completed: scans.filter(s => s.status === "completed").length,
        active: scans.filter(s => s.status === "running" || s.status === "pending").length,
        failed: scans.filter(s => s.status === "failed").length,
    };

    // Chart Data Preparation
    const rawChartData = latestReport ? [
        { name: "Critical", value: latestReport.critical, color: "#ef4444" },
        { name: "High", value: latestReport.high, color: "#f97316" },
        { name: "Medium", value: latestReport.medium, color: "#f59e0b" },
        { name: "Low", value: latestReport.low, color: "#3b82f6" },
        { name: "Info", value: latestReport.info, color: "#6b7280" },
    ] : [];
    // Only show non-zero for better pie visually
    const chartData = rawChartData.filter(d => d.value > 0);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Command Center</h1>
                <p className="text-muted-foreground mt-1 text-sm">
                    High-level overview of your enterprise API security posture.
                </p>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <MetricCard icon={<Target className="h-5 w-5 text-primary" />} label="Total Scans" value={loading ? "-" : stats.total} />
                <MetricCard icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} label="Completed" value={loading ? "-" : stats.completed} />
                <MetricCard icon={<Timer className="h-5 w-5 text-amber-500 animate-pulse" />} label="Active" value={loading ? "-" : stats.active} />
                <MetricCard icon={<XCircle className="h-5 w-5 text-rose-500" />} label="Failed" value={loading ? "-" : stats.failed} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Latest Scan Overview */}
                <div className="lg:col-span-2 rounded-xl border border-border bg-card/60 backdrop-blur-md overflow-hidden shadow-sm flex flex-col">
                    <div className="border-b border-border bg-muted/20 px-6 py-4 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <BarChart3 className="h-4 w-4" /> Latest Scan Results
                        </h2>
                        {latestReport && (
                            <span className="text-xs font-medium px-2 py-1 bg-primary/10 text-primary rounded-md">
                                {latestReport.total} Findings
                            </span>
                        )}
                    </div>
                    <div className="p-6 flex-1 flex flex-col justify-center items-center">
                        {loading ? (
                            <div className="animate-pulse flex flex-col items-center gap-4">
                                <div className="h-48 w-48 rounded-full border-4 border-muted/50 border-t-primary animate-spin" />
                            </div>
                        ) : !latestReport ? (
                            <div className="text-center py-12">
                                <ShieldAlert className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                                <p className="text-sm text-muted-foreground">No completed scans available to analyze.</p>
                            </div>
                        ) : chartData.length === 0 ? (
                            <div className="text-center py-12">
                                <CheckCircle2 className="h-16 w-16 text-emerald-500/80 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-foreground">Perfect Score!</h3>
                                <p className="text-sm text-muted-foreground mt-1 max-w-[250px] mx-auto">No vulnerabilities detected in your most recent scan run.</p>
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
                                            {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }}
                                            itemStyle={{ color: 'var(--foreground)' }}
                                        />
                                        <Legend verticalAlign="bottom" height={36} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="rounded-xl border border-border bg-card/60 backdrop-blur-md overflow-hidden shadow-sm flex flex-col">
                    <div className="border-b border-border bg-muted/20 px-6 py-4">
                        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Activity className="h-4 w-4" /> Recent Executions
                        </h2>
                    </div>
                    <div className="flex-1 divide-y divide-border/50 overflow-y-auto max-h-[350px]">
                        {loading ? (
                            Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="p-4 flex gap-3 animate-pulse">
                                    <div className="w-8 h-8 rounded-full bg-muted" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3 bg-muted rounded w-3/4" />
                                        <div className="h-3 bg-muted rounded w-1/2" />
                                    </div>
                                </div>
                            ))
                        ) : scans.length === 0 ? (
                            <div className="p-8 text-center text-sm text-muted-foreground">No scans found.</div>
                        ) : (
                            scans.slice(0, 7).map((scan) => (
                                <Link
                                    key={scan.id}
                                    href={`/scans/${scan.id}`}
                                    className="p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors group"
                                >
                                    <div className={`w-2 h-2 rounded-full ${
                                        scan.status === 'completed' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                                        scan.status === 'failed' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' :
                                        'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse'
                                    }`} />
                                    <div className="flex-1 overflow-hidden">
                                        <div className="text-xs font-semibold text-foreground truncate">{scan.scan_type} ENGINE</div>
                                        <div className="text-[10px] text-muted-foreground truncate">{scan.target_url}</div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                                </Link>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: string | number }) {
    return (
        <div className="rounded-xl border border-border bg-card/60 backdrop-blur-md p-5 flex items-center gap-4 shadow-sm hover:border-primary/30 transition-colors">
            <div className="p-3 bg-muted/30 rounded-lg">
                {icon}
            </div>
            <div>
                <div className="text-2xl font-bold text-foreground leading-none mb-1">{value}</div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
            </div>
        </div>
    );
}
