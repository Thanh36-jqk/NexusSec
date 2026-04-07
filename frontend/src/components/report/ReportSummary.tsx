"use client";

import { cn } from "@/lib/utils";
import type { ReportSummary as ReportSummaryType, Severity } from "@/types";
import {
    ShieldAlert,
    ShieldCheck,
    AlertTriangle,
    Info,
    AlertOctagon,
    type LucideIcon,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface ReportSummaryProps {
    summary: ReportSummaryType;
    className?: string;
}

interface SeverityCardConfig {
    key: keyof Omit<ReportSummaryType, "total">;
    label: string;
    icon: LucideIcon;
    color: string;
    bgColor: string;
    borderColor: string;
    ringColor: string;
}

const SEVERITY_CARDS: SeverityCardConfig[] = [
    {
        key: "critical",
        label: "Critical",
        icon: AlertOctagon,
        color: "text-red-400",
        bgColor: "bg-red-500/10",
        borderColor: "border-red-500/30",
        ringColor: "ring-red-500/20",
    },
    {
        key: "high",
        label: "High",
        icon: ShieldAlert,
        color: "text-orange-400",
        bgColor: "bg-orange-500/10",
        borderColor: "border-orange-500/30",
        ringColor: "ring-orange-500/20",
    },
    {
        key: "medium",
        label: "Medium",
        icon: AlertTriangle,
        color: "text-amber-400",
        bgColor: "bg-amber-500/10",
        borderColor: "border-amber-500/30",
        ringColor: "ring-amber-500/20",
    },
    {
        key: "low",
        label: "Low",
        icon: ShieldCheck,
        color: "text-blue-400",
        bgColor: "bg-blue-500/10",
        borderColor: "border-blue-500/30",
        ringColor: "ring-blue-500/20",
    },
    {
        key: "info",
        label: "Info",
        icon: Info,
        color: "text-gray-400",
        bgColor: "bg-gray-500/10",
        borderColor: "border-gray-500/30",
        ringColor: "ring-gray-500/20",
    },
];

/**
 * Visual breakdown of vulnerability findings by severity.
 *
 * UX Decisions:
 * - Card-based layout: each severity gets its own card with icon, count, and color
 * - Visual bar chart: proportional bars below cards show distribution at a glance
 * - Total prominently displayed: security engineers want the topline number first
 * - Semantic colors only: Red=critical, Orange=high, Amber=medium, Blue=low, Gray=info
 * - No pie charts: harder to read for small differences; bars are more precise
 */
export function ReportSummary({ summary, className }: ReportSummaryProps) {
    const chartData = SEVERITY_CARDS.map((card) => ({
        name: card.label,
        value: summary[card.key],
        color: card.key === "critical" ? "#ef4444" :
               card.key === "high" ? "#f97316" :
               card.key === "medium" ? "#f59e0b" :
               card.key === "low" ? "#3b82f6" : "#6b7280"
    })).filter(data => data.value > 0);

    return (
        <div className={cn("space-y-6", className)}>
            {/* ── Header: Total findings ────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-foreground">Vulnerability Summary</h3>
                    <p className="text-sm text-muted-foreground">
                        Breakdown of {summary.total} finding{summary.total !== 1 ? "s" : ""} by severity
                    </p>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-card border border-border px-4 py-2">
                    <span className="text-sm text-muted-foreground">Total</span>
                    <span className="text-2xl font-bold tabular-nums font-mono text-foreground">
                        {summary.total}
                    </span>
                </div>
            </div>

            {/* ── Severity Cards ────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {SEVERITY_CARDS.map((card) => {
                    const count = summary[card.key];
                    const Icon = card.icon;

                    return (
                        <div
                            key={card.key}
                            className={cn(
                                "relative rounded-xl border p-4 transition-all duration-200",
                                "hover:ring-2 hover:scale-[1.02] cursor-default",
                                card.bgColor,
                                card.borderColor,
                                card.ringColor
                            )}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Icon className={cn("h-4 w-4", card.color)} />
                                <span className={cn("text-xs font-medium uppercase tracking-wider", card.color)}>
                                    {card.label}
                                </span>
                            </div>
                            <p className={cn("text-3xl font-bold tabular-nums font-mono", card.color)}>
                                {count}
                            </p>
                        </div>
                    );
                })}
            </div>

            {/* ── Visual Charts using recharts ──────────────────────── */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="rounded-xl bg-card border border-border p-4 h-[300px] flex flex-col">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
                        Severity Distribution
                    </p>
                    <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "var(--card)",
                                        borderColor: "var(--border)",
                                        borderRadius: "8px",
                                    }}
                                    itemStyle={{ color: "var(--foreground)" }}
                                />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="rounded-xl bg-card border border-border p-4 flex flex-col justify-center">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
                        Distribution Metrics
                    </p>
                    <div className="space-y-4">
                        {SEVERITY_CARDS.map((card) => {
                            const count = summary[card.key];
                            const percentage = summary.total > 0 ? Math.round((count / summary.total) * 100) : 0;

                            return (
                                <div key={card.key} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("w-3 h-3 rounded-full", card.key === "critical" && "bg-red-500", card.key === "high" && "bg-orange-500", card.key === "medium" && "bg-amber-500", card.key === "low" && "bg-blue-500", card.key === "info" && "bg-gray-500")} />
                                        <span className="text-sm font-medium text-foreground">{card.label}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm text-muted-foreground">{count}</span>
                                        <span className="text-sm font-mono text-muted-foreground w-12 text-right">{percentage}%</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
