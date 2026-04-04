"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useTriageStore } from "@/stores/useTriageStore";
import { TriageListItem } from "@/components/triage/TriageListItem";
import { TriageDetailPanel } from "@/components/triage/TriageDetailPanel";
import type { Vulnerability, Severity } from "@/types";
import {
    Search,
    Eye,
    EyeOff,
    Filter,
    ListChecks,
    Flag,
} from "lucide-react";

// ── Severity order for sorting ───────────────────────────────

const SEVERITY_ORDER: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
};

const SEVERITY_OPTIONS: { value: string; label: string }[] = [
    { value: "critical", label: "Critical" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
    { value: "info", label: "Info" },
];

// ── Props ────────────────────────────────────────────────────

interface TriageViewProps {
    vulnerabilities: Vulnerability[];
}

/**
 * Split-pane triage view.
 *
 * Left: scrollable list of vulnerabilities (filterable, searchable).
 * Right: detail panel for the selected vulnerability (slides in).
 *
 * State management: Zustand store (useTriageStore).
 * Each child subscribes to its own slice via selectors.
 *
 * Keyboard:
 * - ↑/↓ : Navigate list
 * - Esc  : Close detail panel
 * - Enter: Select focused row
 */
export function TriageView({ vulnerabilities }: TriageViewProps) {
    const listRef = useRef<HTMLDivElement>(null);

    // ── Store subscriptions (selectors) ──────────────────────
    const setVulnerabilities = useTriageStore((s) => s.setVulnerabilities);
    const selectedIndex = useTriageStore((s) => s.selectedIndex);
    const setSelectedIndex = useTriageStore((s) => s.setSelectedIndex);
    const moveSelection = useTriageStore((s) => s.moveSelection);
    const clearSelection = useTriageStore((s) => s.clearSelection);
    const searchTerm = useTriageStore((s) => s.searchTerm);
    const setSearchTerm = useTriageStore((s) => s.setSearchTerm);
    const severityFilter = useTriageStore((s) => s.severityFilter);
    const setSeverityFilter = useTriageStore((s) => s.setSeverityFilter);
    const showMuted = useTriageStore((s) => s.showMuted);
    const toggleShowMuted = useTriageStore((s) => s.toggleShowMuted);
    const triageStates = useTriageStore((s) => s.triageStates);

    // ── Load vulns into store on mount ───────────────────────
    useEffect(() => {
        setVulnerabilities(vulnerabilities);
    }, [vulnerabilities, setVulnerabilities]);

    // ── Derived: filtered + sorted list ──────────────────────
    const filteredVulns = useMemo(() => {
        const q = searchTerm.toLowerCase();

        return vulnerabilities
            .filter((v) => {
                // Search filter
                if (q) {
                    const match =
                        v.name.toLowerCase().includes(q) ||
                        v.description.toLowerCase().includes(q) ||
                        (v.cwe?.toLowerCase().includes(q) ?? false) ||
                        (v.vuln_id?.toLowerCase().includes(q) ?? false) ||
                        (v.url?.toLowerCase().includes(q) ?? false);
                    if (!match) return false;
                }

                // Severity filter
                if (severityFilter && v.severity !== severityFilter) {
                    return false;
                }

                // Muted filter
                if (!showMuted) {
                    const state = triageStates.get(v.vuln_id);
                    if (state?.is_muted) return false;
                }

                return true;
            })
            .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    }, [vulnerabilities, searchTerm, severityFilter, showMuted, triageStates]);

    // ── Derived: muted + FP counts ───────────────────────────
    const { mutedCount, fpCount } = useMemo(() => {
        let muted = 0;
        let fp = 0;
        triageStates.forEach((state) => {
            if (state.is_muted) muted++;
            if (state.is_false_positive) fp++;
        });
        return { mutedCount: muted, fpCount: fp };
    }, [triageStates]);

    // ── Selected vulnerability ───────────────────────────────
    const selectedVuln = selectedIndex !== null ? filteredVulns[selectedIndex] ?? null : null;

    // ── Scroll selected row into view ────────────────────────
    useEffect(() => {
        if (selectedIndex === null || !listRef.current) return;
        const row = listRef.current.querySelector(`#triage-row-${selectedIndex}`);
        row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [selectedIndex]);

    // ── Keyboard handler ─────────────────────────────────────
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    moveSelection("down", filteredVulns.length);
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    moveSelection("up", filteredVulns.length);
                    break;
                case "Escape":
                    e.preventDefault();
                    clearSelection();
                    break;
            }
        },
        [moveSelection, clearSelection, filteredVulns.length]
    );

    // ── Select handler ───────────────────────────────────────
    const handleSelect = useCallback(
        (idx: number) => {
            setSelectedIndex(selectedIndex === idx ? null : idx);
        },
        [setSelectedIndex, selectedIndex]
    );

    return (
        <div className="animate-fade-scale-in">
            {/* ── Toolbar ─────────────────────────────────────── */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px] max-w-[360px]">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search by name, CWE, URL, ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={cn(
                            "h-9 w-full rounded-lg border border-border bg-card pl-9 pr-4",
                            "text-sm text-foreground placeholder:text-muted-foreground",
                            "focus:outline-none focus:ring-2 focus:ring-primary/50",
                            "transition-all"
                        )}
                    />
                </div>

                {/* Severity filter */}
                <div className="relative">
                    <Filter className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <select
                        value={severityFilter ?? ""}
                        onChange={(e) => setSeverityFilter(e.target.value || null)}
                        className={cn(
                            "h-9 rounded-lg border border-border bg-card pl-8 pr-8 appearance-none",
                            "text-sm text-foreground",
                            "focus:outline-none focus:ring-2 focus:ring-primary/50",
                            "transition-all cursor-pointer"
                        )}
                    >
                        <option value="">All Severities</option>
                        {SEVERITY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Show muted toggle */}
                <button
                    onClick={toggleShowMuted}
                    className={cn(
                        "inline-flex items-center gap-1.5 h-9 rounded-lg border px-3 text-xs font-medium transition-all",
                        showMuted
                            ? "bg-primary/10 text-primary border-primary/30"
                            : "bg-card text-muted-foreground border-border hover:text-foreground"
                    )}
                >
                    {showMuted ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {showMuted ? "Showing Muted" : "Muted Hidden"}
                    {mutedCount > 0 && (
                        <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
                            {mutedCount}
                        </span>
                    )}
                </button>

                {/* Stats */}
                <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <ListChecks className="h-3.5 w-3.5" />
                        {filteredVulns.length} / {vulnerabilities.length}
                    </span>
                    {fpCount > 0 && (
                        <span className="flex items-center gap-1 text-amber-400">
                            <Flag className="h-3 w-3" />
                            {fpCount} FP
                        </span>
                    )}
                </div>
            </div>

            {/* ── Split Pane ──────────────────────────────────── */}
            <div
                className="triage-split rounded-xl border border-border overflow-hidden bg-card"
                onKeyDown={handleKeyDown}
                tabIndex={0}
                role="listbox"
                aria-label="Vulnerability triage list"
            >
                {/* Left: List */}
                <div className="triage-list" ref={listRef}>
                    {filteredVulns.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                            <Search className="h-8 w-8 mb-3 opacity-40" />
                            <p className="text-sm font-medium">No vulnerabilities found</p>
                            <p className="text-xs mt-1">
                                {searchTerm || severityFilter
                                    ? "Try adjusting your filters."
                                    : "This scan produced no findings."}
                            </p>
                        </div>
                    ) : (
                        filteredVulns.map((vuln, idx) => {
                            const state = triageStates.get(vuln.vuln_id);
                            return (
                                <TriageListItem
                                    key={vuln.vuln_id}
                                    vuln={vuln}
                                    index={idx}
                                    isSelected={selectedIndex === idx}
                                    isFalsePositive={state?.is_false_positive ?? false}
                                    isMuted={state?.is_muted ?? false}
                                    onSelect={handleSelect}
                                />
                            );
                        })
                    )}
                </div>

                {/* Right: Detail Panel */}
                {selectedVuln ? (
                    <div className="triage-detail">
                        <TriageDetailPanel vuln={selectedVuln} />
                    </div>
                ) : (
                    <div className="triage-detail flex flex-col items-center justify-center text-muted-foreground">
                        <div className="text-center space-y-2 px-8">
                            <div className="mx-auto h-12 w-12 rounded-full bg-muted/30 flex items-center justify-center">
                                <ListChecks className="h-6 w-6 opacity-40" />
                            </div>
                            <p className="text-sm font-medium">Select a vulnerability</p>
                            <p className="text-xs">
                                Click on any finding in the list to view details, mark as false positive, or export.
                            </p>
                            <p className="text-[10px] text-muted-foreground/50 mt-4">
                                ↑↓ Navigate • Enter Select • Esc Close
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
