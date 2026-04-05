"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
    ScanSearch,
    Plus,
    Globe,
    Clock,
    AlertCircle,
    CheckCircle2,
    Loader2,
    XCircle,
    ChevronRight,
} from "lucide-react";
import { fetchApi } from "@/lib/api";
import type { ScanJob } from "@/types";

// ── Status Config ────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
    pending:   { icon: Clock,        color: "text-gray-400",    bg: "bg-gray-500/10 border-gray-500/30" },
    running:   { icon: Loader2,      color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/30" },
    completed: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
    failed:    { icon: XCircle,      color: "text-red-400",     bg: "bg-red-500/10 border-red-500/30" },
    cancelled: { icon: AlertCircle,  color: "text-gray-400",    bg: "bg-gray-500/10 border-gray-500/30" },
};

// ── Main Page Component ──────────────────────────────────────

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

    const formatDate = (dateStr: string) => {
        return new Intl.DateTimeFormat("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(new Date(dateStr));
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* ── Header ──────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        Scan History
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        View and manage your vulnerability scan jobs.
                    </p>
                </div>
                <Link
                    href="/scans/new"
                    className={cn(
                        "inline-flex items-center gap-2 rounded-xl px-4 py-2.5",
                        "bg-primary text-primary-foreground text-sm font-medium",
                        "hover:bg-primary/90 transition-colors",
                        "shadow-lg shadow-primary/25"
                    )}
                >
                    <Plus className="h-4 w-4" />
                    New Scan
                </Link>
            </div>

            {/* ── Loading State ────────────────────────────────── */}
            {loading && (
                <div className="flex flex-col items-center justify-center py-24 space-y-4">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading scans...</p>
                </div>
            )}

            {/* ── Error State ──────────────────────────────────── */}
            {error && !loading && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-center">
                    <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-3" />
                    <p className="text-sm text-red-400">{error}</p>
                    <button
                        onClick={() => { setError(null); setLoading(true); fetchScans(); }}
                        className="mt-4 text-xs text-primary hover:underline"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* ── Empty State ──────────────────────────────────── */}
            {!loading && !error && scans.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 space-y-4 rounded-xl border border-dashed border-border bg-card/50">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <ScanSearch className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">No scans yet</h3>
                    <p className="text-sm text-muted-foreground max-w-sm text-center">
                        Start your first security scan by clicking the &quot;New Scan&quot; button above.
                    </p>
                </div>
            )}

            {/* ── Scan List ────────────────────────────────────── */}
            {!loading && !error && scans.length > 0 && (
                <div className="space-y-3">
                    {scans.map((scan) => {
                        const cfg = STATUS_CONFIG[scan.status] || STATUS_CONFIG.pending;
                        const Icon = cfg.icon;
                        return (
                            <Link
                                key={scan.id}
                                href={`/scans/${scan.id}`}
                                className={cn(
                                    "flex items-center gap-4 p-4 rounded-xl border border-border bg-card",
                                    "hover:border-primary/30 hover:bg-card/80 transition-all group"
                                )}
                            >
                                {/* Status Icon */}
                                <div className={cn("flex items-center justify-center h-10 w-10 rounded-lg border shrink-0", cfg.bg)}>
                                    <Icon className={cn("h-5 w-5", cfg.color, scan.status === "running" && "animate-spin")} />
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        <span className="text-sm font-medium text-foreground truncate">
                                            {scan.target_url || "Unknown target"}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                        <span className="uppercase font-semibold tracking-wider">{scan.scan_type}</span>
                                        <span>•</span>
                                        <span>{formatDate(scan.created_at)}</span>
                                        {scan.status === "running" && scan.progress > 0 && (
                                            <>
                                                <span>•</span>
                                                <span className="text-blue-400 font-mono">{scan.progress}%</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Status Badge */}
                                <span className={cn(
                                    "inline-flex items-center rounded-md border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                                    cfg.bg, cfg.color
                                )}>
                                    {scan.status}
                                </span>

                                {/* Arrow */}
                                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
