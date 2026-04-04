"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import type { Vulnerability, Severity } from "@/types";
import {
    ShieldAlert,
    ShieldCheck,
    AlertTriangle,
    Info,
    AlertOctagon,
    EyeOff,
    Flag,
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

const SEVERITY_BADGE: Record<Severity, string> = {
    critical: "bg-red-500/15 text-red-400 border-red-500/30",
    high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    low: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    info: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

// ── Props ────────────────────────────────────────────────────

interface TriageListItemProps {
    vuln: Vulnerability;
    index: number;
    isSelected: boolean;
    isFalsePositive: boolean;
    isMuted: boolean;
    onSelect: (index: number) => void;
}

/**
 * Compact row for the triage list (left panel).
 *
 * Rendering rules:
 * - severity icon + badge (always visible)
 * - vulnerability name (truncated, strike-through if FP)
 * - source tool tag (zap/nmap)
 * - muted overlay + icon when muted
 * - false-positive badge when flagged
 * - selected state highlight via CSS class
 *
 * Performance:
 * - Wrapped in React.memo — only re-renders when its specific props change.
 * - No Zustand subscription here — parent passes pre-selected props.
 *   Actually, this component receives props from TriageView which
 *   subscribes to the store. But since TriageListItem is memo'd,
 *   it only re-renders when its individual vuln state changes.
 */
const TriageListItem = memo(function TriageListItem({
    vuln,
    index,
    isSelected,
    isFalsePositive,
    isMuted,
    onSelect,
}: TriageListItemProps) {
    const Icon = SEVERITY_ICON[vuln.severity];

    return (
        <div
            id={`triage-row-${index}`}
            role="option"
            aria-selected={isSelected}
            className={cn(
                "triage-row px-3 py-2.5",
                isSelected && "triage-row--selected",
                isMuted && "triage-row--muted",
                isFalsePositive && "triage-row--false-positive"
            )}
            onClick={() => onSelect(index)}
        >
            <div className="flex items-center gap-2.5">
                {/* Severity icon */}
                <Icon className={cn("h-4 w-4 shrink-0", SEVERITY_COLOR[vuln.severity])} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        {/* Name */}
                        <span className="triage-row__name text-sm font-medium text-foreground truncate">
                            {vuln.name}
                        </span>

                        {/* False positive badge */}
                        {isFalsePositive && (
                            <span className="shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                <Flag className="h-2.5 w-2.5" />
                                FP
                            </span>
                        )}

                        {/* Muted icon */}
                        {isMuted && (
                            <EyeOff className="shrink-0 h-3 w-3 text-muted-foreground" />
                        )}
                    </div>

                    {/* Meta row: severity + URL + source_tool */}
                    <div className="flex items-center gap-2 mt-0.5">
                        <span
                            className={cn(
                                "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium",
                                SEVERITY_BADGE[vuln.severity]
                            )}
                        >
                            {vuln.severity.charAt(0).toUpperCase() + vuln.severity.slice(1)}
                        </span>

                        {vuln.url && (
                            <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">
                                {vuln.url}
                            </span>
                        )}

                        <span className="ml-auto shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 bg-muted/50 rounded px-1.5 py-0.5">
                            {vuln.source_tool}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
});

export { TriageListItem };
