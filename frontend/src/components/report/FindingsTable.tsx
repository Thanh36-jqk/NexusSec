"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Vulnerability, Severity } from "@/types";
import {
    ShieldAlert,
    ShieldCheck,
    AlertTriangle,
    Info,
    AlertOctagon,
    ExternalLink,
    ChevronDown,
    ChevronUp,
    Search,
} from "lucide-react";

interface FindingsTableProps {
    vulnerabilities: Vulnerability[];
    className?: string;
}

const SEVERITY_ORDER: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
};

const SEVERITY_STYLES: Record<Severity, { badge: string; icon: React.ElementType }> = {
    critical: {
        badge: "bg-red-500/15 text-red-400 border-red-500/30",
        icon: AlertOctagon,
    },
    high: {
        badge: "bg-orange-500/15 text-orange-400 border-orange-500/30",
        icon: ShieldAlert,
    },
    medium: {
        badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        icon: AlertTriangle,
    },
    low: {
        badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",
        icon: ShieldCheck,
    },
    info: {
        badge: "bg-gray-500/15 text-gray-400 border-gray-500/30",
        icon: Info,
    },
};

/**
 * Data table for vulnerability findings with:
 * - Sortable by severity (default: critical first)
 * - Expandable row detail view
 * - Search/filter functionality
 * - Severity badge with icon and semantic color
 *
 * UX: Table is preferred over cards for findings because security
 * engineers need to scan many items quickly — density matters.
 */
export function FindingsTable({ vulnerabilities, className }: FindingsTableProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [expandedRow, setExpandedRow] = useState<number | null>(null);
    const [sortAsc, setSortAsc] = useState(false);

    // Filter by name, description, or CWE
    const filtered = vulnerabilities.filter((v) => {
        const q = searchTerm.toLowerCase();
        return (
            v.title.toLowerCase().includes(q) ||
            v.description.toLowerCase().includes(q) ||
            (v.cwe?.toLowerCase().includes(q) ?? false)
        );
    });

    // Sort by severity
    const sorted = [...filtered].sort((a, b) => {
        const diff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        return sortAsc ? -diff : diff;
    });

    return (
        <div className={cn("space-y-4", className)}>
            {/* ── Header + Search ───────────────────────────────── */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold text-foreground">Findings</h3>
                    <p className="text-sm text-muted-foreground">
                        {filtered.length} of {vulnerabilities.length} vulnerabilities
                    </p>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search findings..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={cn(
                            "h-9 w-64 rounded-lg border border-border bg-card pl-9 pr-4",
                            "text-sm text-foreground placeholder:text-muted-foreground",
                            "focus:outline-none focus:ring-2 focus:ring-primary/50",
                            "transition-all"
                        )}
                    />
                </div>
            </div>

            {/* ── Table ─────────────────────────────────────────── */}
            <div className="rounded-xl border border-border overflow-hidden bg-card">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border bg-muted/30">
                            <th
                                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                                onClick={() => setSortAsc(!sortAsc)}
                            >
                                <span className="inline-flex items-center gap-1">
                                    Severity
                                    {sortAsc ? (
                                        <ChevronUp className="h-3 w-3" />
                                    ) : (
                                        <ChevronDown className="h-3 w-3" />
                                    )}
                                </span>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                Vulnerability
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground hidden md:table-cell">
                                CWE
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground hidden lg:table-cell">
                                URL
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {sorted.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                                    {searchTerm
                                        ? "No findings match your search."
                                        : "No vulnerabilities found — the target appears secure."}
                                </td>
                            </tr>
                        ) : (
                            sorted.map((vuln, idx) => {
                                const style = SEVERITY_STYLES[vuln.severity];
                                const Icon = style.icon;
                                const isExpanded = expandedRow === idx;

                                return (
                                    <tr key={idx} className="group">
                                        <td colSpan={4} className="p-0">
                                            {/* Main Row */}
                                            <div
                                                className={cn(
                                                    "grid grid-cols-[120px_1fr_80px_1fr] items-center px-4 py-3 cursor-pointer",
                                                    "hover:bg-muted/20 transition-colors",
                                                    isExpanded && "bg-muted/10"
                                                )}
                                                onClick={() => setExpandedRow(isExpanded ? null : idx)}
                                            >
                                                {/* Severity Badge */}
                                                <div>
                                                    <span
                                                        className={cn(
                                                            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
                                                            style.badge
                                                        )}
                                                    >
                                                        <Icon className="h-3 w-3" />
                                                        {vuln.severity.charAt(0).toUpperCase() + vuln.severity.slice(1)}
                                                    </span>
                                                </div>

                                                {/* Title */}
                                                <div className="truncate pr-4">
                                                    <span className="text-sm font-medium text-foreground">{vuln.title}</span>
                                                </div>

                                                {/* CWE */}
                                                <div className="hidden md:block">
                                                    {vuln.cwe && (
                                                        <span className="text-xs font-mono text-muted-foreground">
                                                            {vuln.cwe}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* URL */}
                                                <div className="hidden lg:block truncate">
                                                    {vuln.url && (
                                                        <span className="text-xs text-muted-foreground font-mono">
                                                            {vuln.url}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Expanded Detail */}
                                            {isExpanded && (
                                                <div className="px-4 pb-4 pt-1 space-y-3 bg-muted/5 border-t border-border/50">
                                                    <div>
                                                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                                                            Description
                                                        </p>
                                                        <p className="text-sm text-foreground/90 leading-relaxed">
                                                            {vuln.description}
                                                        </p>
                                                    </div>

                                                    {vuln.remediation && (
                                                        <div>
                                                            <p className="text-xs font-medium uppercase tracking-wider text-emerald-400 mb-1">
                                                                Remediation
                                                            </p>
                                                            <p className="text-sm text-foreground/80 leading-relaxed">
                                                                {vuln.remediation}
                                                            </p>
                                                        </div>
                                                    )}

                                                    {vuln.evidence && (
                                                        <div>
                                                            <p className="text-xs font-medium uppercase tracking-wider text-red-400 mb-1">
                                                                Evidence Logic
                                                            </p>
                                                            <div className="bg-red-500/10 border border-red-500/20 p-2 rounded-md font-mono text-xs text-red-400 max-h-32 overflow-y-auto">
                                                                {vuln.evidence}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {vuln.param && (
                                                        <div>
                                                            <p className="text-xs font-medium uppercase tracking-wider text-amber-400 mb-1">
                                                                Vulnerable Parameter
                                                            </p>
                                                            <span className="inline-flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-mono text-amber-400">
                                                                {vuln.param}
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div className="flex items-center gap-4 pt-1">
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
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
