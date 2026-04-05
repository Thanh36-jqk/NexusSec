"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchApi } from "@/lib/api";
import type { ScanJob, APIResponse } from "@/types";
import { FileText, Search, Loader2, Calendar, ShieldAlert } from "lucide-react";

export default function ReportsPage() {
    const [reports, setReports] = useState<ScanJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadReports() {
            try {
                const res = await fetchApi<APIResponse<ScanJob[]>>('/scans');
                // Filter only completed scans
                const completed = (res.data || []).filter(s => s.status === 'completed');
                setReports(completed);
            } catch (err: any) {
                setError(err.message || "Failed to load reports");
            } finally {
                setLoading(false);
            }
        }
        loadReports();
    }, []);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 border border-primary/20">
                        <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">
                            Scan Reports
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            View and download detailed vulnerability reports.
                        </p>
                    </div>
                </div>
            </div>

            {/* Error State */}
            {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
                    <ShieldAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-red-400">Error</p>
                        <p className="text-sm text-red-400/80 mt-1">{error}</p>
                    </div>
                </div>
            )}

            {/* Main Content */}
            {loading ? (
                <div className="flex items-center justify-center p-24">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                </div>
            ) : reports.length === 0 && !error ? (
                <div className="rounded-xl border border-dashed border-border p-12 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                        <Search className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="mt-4 text-sm font-semibold text-foreground">No reports available</h3>
                    <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
                        Reports are generated automatically once a scan job completes. Run your first scan to see reports here.
                    </p>
                    <Link
                        href="/scans/new"
                        className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
                    >
                        Start a Scan
                    </Link>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {reports.map((report) => (
                        <Link 
                            key={report.id} 
                            href={`/scans/${report.id}?tab=summary`}
                            className="group relative flex flex-col gap-4 rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/50 hover:shadow-md"
                        >
                            <div className="flex items-start justify-between">
                                <div className="space-y-1 block max-w-full overflow-hidden">
                                    <h3 className="font-semibold text-foreground text-sm truncate">
                                        {report.target_url}
                                    </h3>
                                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                        {report.scan_type} ENGINE
                                    </p>
                                </div>
                                <div className="rounded-full bg-primary/10 p-2 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                    <FileText className="h-4 w-4" />
                                </div>
                            </div>

                            <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Calendar className="h-3.5 w-3.5" />
                                    <span>
                                        {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(report.created_at))}
                                    </span>
                                </div>
                                <span className="text-xs font-medium text-primary">
                                    View Report &rarr;
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
