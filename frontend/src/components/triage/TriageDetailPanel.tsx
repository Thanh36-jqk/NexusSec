"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { useTriageStore } from "@/stores/useTriageStore";
import type { Vulnerability, Severity } from "@/types";
import { toast } from "sonner";
import { useParams } from "next/navigation";

import { fetchApi } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";
import {
    X,
    ExternalLink,
    Flag,
    FlagOff,
    EyeOff,
    Eye,
    ClipboardCopy,
    ShieldAlert,
    ShieldCheck,
    AlertTriangle,
    Info,
    AlertOctagon,
    Network,
    Server,
    Globe,
} from "lucide-react";

// ── Severity Config ──────────────────────────────────────────

const SEVERITY_ICON: Record<Severity, React.ElementType> = {
    critical: AlertOctagon,
    high: ShieldAlert,
    medium: AlertTriangle,
    low: ShieldCheck,
    info: Info,
};

const SEVERITY_COLOR: Record<Severity, string> = {
    critical: "text-red-400",
    high: "text-orange-400",
    medium: "text-amber-400",
    low: "text-blue-400",
    info: "text-gray-400",
};

const SEVERITY_BG: Record<Severity, string> = {
    critical: "bg-red-500/10 border-red-500/30",
    high: "bg-orange-500/10 border-orange-500/30",
    medium: "bg-amber-500/10 border-amber-500/30",
    low: "bg-blue-500/10 border-blue-500/30",
    info: "bg-gray-500/10 border-gray-500/30",
};

// ── Props ────────────────────────────────────────────────────

interface TriageDetailPanelProps {
    vuln: Vulnerability;
    /** Optional close handler — overrides Zustand clearSelection for reuse in Diff view */
    onClose?: () => void;
}

/**
 * Right-side detail panel for the triage view.
 *
 * Shows full vulnerability detail + actionable buttons.
 * Subscribes to Zustand store ONLY for the selected vuln's triage state.
 *
 * Actions:
 * - "Mark as False Positive" — toggles FP flag
 * - "Mute" — toggles muted flag
 * - "Copy for Jira" — formats vuln as Markdown, copies to clipboard
 */
export function TriageDetailPanel({ vuln, onClose }: TriageDetailPanelProps) {
    // ── Subscribe to only this vuln's triage state ──────────
    const triageState = useTriageStore(
        (s) => s.triageStates.get(vuln.vuln_id) ?? { is_false_positive: false, is_muted: false }
    );
    const toggleFalsePositive = useTriageStore((s) => s.toggleFalsePositive);
    const toggleMuted = useTriageStore((s) => s.toggleMuted);
    const storeClearSelection = useTriageStore((s) => s.clearSelection);
    const handleClose = onClose ?? storeClearSelection;

    const Icon = SEVERITY_ICON[vuln.severity];

    const params = useParams();
    const scanId = params.id as string;

    const handleToggleFalsePositive = async () => {
        const nextState = !triageState.is_false_positive;
        toggleFalsePositive(vuln.vuln_id); // Optimistic UI
        
        if (!scanId) return;
        try {
            await fetchApi(`/scans/${scanId}/triage/${encodeURIComponent(vuln.vuln_id)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    is_false_positive: nextState,
                    is_muted: triageState.is_muted
                })
            });
        } catch {
            toggleFalsePositive(vuln.vuln_id); // Rollback
            toast.error("Failed to save False Positive state");
        }
    };

    const handleToggleMuted = async () => {
        const nextState = !triageState.is_muted;
        toggleMuted(vuln.vuln_id); // Optimistic UI
        
        if (!scanId) return;
        try {
            await fetchApi(`/scans/${scanId}/triage/${encodeURIComponent(vuln.vuln_id)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    is_false_positive: triageState.is_false_positive,
                    is_muted: nextState
                })
            });
        } catch {
            toggleMuted(vuln.vuln_id); // Rollback
            toast.error("Failed to save Muted state");
        }
    };

    // ── Copy to Clipboard as Jira-formatted Markdown ────────
    const handleCopyForJira = useCallback(async () => {
        const lines = [
            `## 🛡️ ${vuln.name}`,
            ``,
            `| Field | Value |`,
            `|-------|-------|`,
            `| **Severity** | ${vuln.severity.toUpperCase()} |`,
            vuln.cvss_score ? `| **CVSS** | ${vuln.cvss_score} |` : null,
            vuln.vuln_id ? `| **Vuln ID** | ${vuln.vuln_id} |` : null,
            vuln.cwe ? `| **CWE** | ${vuln.cwe} |` : null,
            vuln.url ? `| **URL** | \`${vuln.url}\` |` : null,
            vuln.port ? `| **Port** | ${vuln.port}/${vuln.protocol ?? "tcp"} |` : null,
            vuln.service ? `| **Service** | ${vuln.service} |` : null,
            `| **Source** | ${vuln.source_tool} |`,
            ``,
            `### Description`,
            vuln.description || "_No description available._",
            ``,
            vuln.solution ? `### Solution\n${vuln.solution}` : null,
            vuln.reference ? `\n### References\n${vuln.reference}` : null,
        ].filter(Boolean).join("\n");

        try {
            await navigator.clipboard.writeText(lines);
            toast.success("Copied to clipboard", {
                description: "Vulnerability formatted as Markdown for Jira.",
                duration: 2500,
            });
        } catch {
            toast.error("Failed to copy", {
                description: "Clipboard access denied.",
            });
        }
    }, [vuln]);

    return (
        <div className="animate-slide-in-right h-full flex flex-col" key={vuln.vuln_id}>
            {/* ── Header ──────────────────────────────────────── */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
                <div className="flex items-start gap-3 min-w-0">
                    <div
                        className={cn(
                            "flex items-center justify-center h-9 w-9 rounded-lg border shrink-0",
                            SEVERITY_BG[vuln.severity]
                        )}
                    >
                        <Icon className={cn("h-5 w-5", SEVERITY_COLOR[vuln.severity])} />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-foreground leading-tight break-words">
                            {vuln.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span
                                className={cn(
                                    "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                                    SEVERITY_BG[vuln.severity],
                                    SEVERITY_COLOR[vuln.severity]
                                )}
                            >
                                {vuln.severity}
                            </span>
                            {vuln.cvss_score != null && vuln.cvss_score > 0 && (
                                <span className="text-[11px] font-mono text-muted-foreground">
                                    CVSS {vuln.cvss_score.toFixed(1)}
                                </span>
                            )}
                            {vuln.vuln_id && (
                                <span className="text-[11px] font-mono text-muted-foreground">
                                    {vuln.vuln_id}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <button
                    onClick={handleClose}
                    className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
                    aria-label="Close detail panel"
                >
                    <X className="h-4 w-4 text-muted-foreground" />
                </button>
            </div>

            {/* ── Content (scrollable) ────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {/* Triage state badges */}
                {(triageState.is_false_positive || triageState.is_muted) && (
                    <div className="flex items-center gap-2">
                        {triageState.is_false_positive && (
                            <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium bg-amber-500/15 text-amber-400 border-amber-500/30">
                                <Flag className="h-3 w-3" />
                                False Positive
                            </span>
                        )}
                        {triageState.is_muted && (
                            <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium bg-gray-500/15 text-gray-400 border-gray-500/30">
                                <EyeOff className="h-3 w-3" />
                                Muted
                            </span>
                        )}
                    </div>
                )}

                {/* Network info (Port / Protocol / Service) */}
                {(vuln.port || vuln.service || vuln.url) && (
                    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            Network Context
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            {vuln.url && (
                                <div className="col-span-2 flex items-center gap-1.5">
                                    <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <span className="font-mono text-foreground/80 break-all">
                                        {vuln.url}
                                    </span>
                                </div>
                            )}
                            {vuln.port != null && vuln.port > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <Network className="h-3 w-3 text-muted-foreground" />
                                    <span className="font-mono text-foreground/80">
                                        {vuln.port}/{vuln.protocol ?? "tcp"}
                                    </span>
                                </div>
                            )}
                            {vuln.service && (
                                <div className="flex items-center gap-1.5">
                                    <Server className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-foreground/80">{vuln.service}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Description */}
                <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                        Description
                    </p>
                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                        {vuln.description || "No description available."}
                    </p>
                </div>

                {/* Solution */}
                {vuln.solution && (
                    <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-400 mb-1.5">
                            Solution
                        </p>
                        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                            {vuln.solution}
                        </p>
                    </div>
                )}

                {/* References */}
                <div className="flex items-center gap-3 flex-wrap">
                    {vuln.cwe && (
                        <a
                            href={`https://cwe.mitre.org/data/definitions/${vuln.cwe.replace("CWE-", "")}.html`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                            {vuln.cwe}
                            <ExternalLink className="h-3 w-3" />
                        </a>
                    )}
                    {vuln.reference && (
                        <a
                            href={vuln.reference}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                            Reference
                            <ExternalLink className="h-3 w-3" />
                        </a>
                    )}
                </div>

                {/* Source tool */}
                <div className="text-[10px] text-muted-foreground/60">
                    Detected by <span className="font-semibold uppercase">{vuln.source_tool}</span>
                </div>
            </div>

            {/* ── Action Bar (sticky bottom) ──────────────────── */}
            <div className="shrink-0 px-5 py-3 border-t border-border bg-card/90 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                    {/* False Positive toggle */}
                    <button
                        onClick={handleToggleFalsePositive}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                            triageState.is_false_positive
                                ? "bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
                                : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground"
                        )}
                    >
                        {triageState.is_false_positive ? (
                            <>
                                <FlagOff className="h-3.5 w-3.5" />
                                Unmark FP
                            </>
                        ) : (
                            <>
                                <Flag className="h-3.5 w-3.5" />
                                False Positive
                            </>
                        )}
                    </button>

                    {/* Mute toggle */}
                    <button
                        onClick={handleToggleMuted}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                            triageState.is_muted
                                ? "bg-gray-500/15 text-gray-400 border-gray-500/30 hover:bg-gray-500/25"
                                : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground"
                        )}
                    >
                        {triageState.is_muted ? (
                            <>
                                <Eye className="h-3.5 w-3.5" />
                                Unmute
                            </>
                        ) : (
                            <>
                                <EyeOff className="h-3.5 w-3.5" />
                                Mute
                            </>
                        )}
                    </button>

                    {/* Export to Jira (clipboard) */}
                    <button
                        onClick={handleCopyForJira}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-all"
                    >
                        <ClipboardCopy className="h-3.5 w-3.5" />
                        Export to Jira
                    </button>
                </div>
                <p className="text-[10px] text-muted-foreground/50 mt-2">
                    Keyboard: ↑↓ navigate • Esc close
                </p>
            </div>
        </div>
    );
}
