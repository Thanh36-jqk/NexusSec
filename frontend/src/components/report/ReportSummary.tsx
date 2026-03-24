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
    const maxCount = Math.max(
        summary.critical,
        summary.high,
        summary.medium,
        summary.low,
        summary.info,
        1 // prevent division by zero
    );

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

            {/* ── Distribution Bars ─────────────────────────────── */}
            <div className="space-y-2.5 rounded-xl bg-card border border-border p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                    Distribution
                </p>
                {SEVERITY_CARDS.map((card) => {
                    const count = summary[card.key];
                    const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;

                    return (
                        <div key={card.key} className="flex items-center gap-3">
                            <span
                                className={cn(
                                    "w-16 text-xs font-medium text-right shrink-0",
                                    card.color
                                )}
                            >
                                {card.label}
                            </span>
                            <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
                                <div
                                    className={cn(
                                        "h-full rounded-full transition-all duration-500 ease-out",
                                        card.key === "critical" && "bg-red-500",
                                        card.key === "high" && "bg-orange-500",
                                        card.key === "medium" && "bg-amber-500",
                                        card.key === "low" && "bg-blue-500",
                                        card.key === "info" && "bg-gray-500"
                                    )}
                                    style={{ width: `${percentage}%` }}
                                />
                            </div>
                            <span className="w-8 text-xs tabular-nums font-mono text-muted-foreground text-right">
                                {count}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
