"use client";

import { create } from "zustand";
import type { Vulnerability, VulnTriageState } from "@/types";

// ── Store Shape ──────────────────────────────────────────────

interface TriageStore {
    /** All vulnerabilities loaded from the report */
    vulnerabilities: Vulnerability[];

    /** Currently selected vulnerability index (in the filtered list) */
    selectedIndex: number | null;

    /** Per-vuln triage state keyed by vuln_id */
    triageStates: Map<string, VulnTriageState>;

    /** Whether to show muted vulnerabilities in the list */
    showMuted: boolean;

    /** Search filter text */
    searchTerm: string;

    /** Severity filter (null = all) */
    severityFilter: string | null;

    // ── Actions ──────────────────────────────────────────────

    /** Load vulnerabilities from a fetched report */
    setVulnerabilities: (vulns: Vulnerability[]) => void;

    /** Select a vulnerability by index in filtered list */
    setSelectedIndex: (idx: number | null) => void;

    /** Toggle false positive flag for a vulnerability */
    toggleFalsePositive: (vulnId: string) => void;

    /** Toggle muted flag for a vulnerability */
    toggleMuted: (vulnId: string) => void;

    /** Toggle show/hide muted */
    toggleShowMuted: () => void;

    /** Set search term */
    setSearchTerm: (term: string) => void;

    /** Set severity filter */
    setSeverityFilter: (severity: string | null) => void;

    /** Move selection up/down */
    moveSelection: (direction: "up" | "down", listLength: number) => void;

    /** Clear selection */
    clearSelection: () => void;

    /** Get triage state for a specific vuln */
    getTriageState: (vulnId: string) => VulnTriageState;

    /** Hydrate triage states from backend API */
    hydrateTriageStates: (states: Record<string, VulnTriageState>) => void;

    /** Reset store (when navigating away) */
    reset: () => void;
}

// ── Default triage state ─────────────────────────────────────

const DEFAULT_TRIAGE: VulnTriageState = {
    is_false_positive: false,
    is_muted: false,
};

// ── Store Implementation ─────────────────────────────────────
//
// Performance notes:
// - Zustand uses shallow equality by default for selectors.
// - Components subscribe to ONLY the slice of state they need.
// - Map<string, VulnTriageState> ensures O(1) lookup per vuln_id.
// - toggleFalsePositive/toggleMuted create NEW Map references
//   so React detects the change without deep-compare.

export const useTriageStore = create<TriageStore>((set, get) => ({
    vulnerabilities: [],
    selectedIndex: null,
    triageStates: new Map(),
    showMuted: false,
    searchTerm: "",
    severityFilter: null,

    setVulnerabilities: (vulns) => {
        set({
            vulnerabilities: vulns,
            selectedIndex: null,
            triageStates: new Map(),
        });
    },

    setSelectedIndex: (idx) => {
        set({ selectedIndex: idx });
    },

    toggleFalsePositive: (vulnId) => {
        const prev = get().triageStates;
        const next = new Map(prev);
        const current = next.get(vulnId) ?? { ...DEFAULT_TRIAGE };
        next.set(vulnId, {
            ...current,
            is_false_positive: !current.is_false_positive,
        });
        set({ triageStates: next });
    },

    toggleMuted: (vulnId) => {
        const prev = get().triageStates;
        const next = new Map(prev);
        const current = next.get(vulnId) ?? { ...DEFAULT_TRIAGE };
        next.set(vulnId, {
            ...current,
            is_muted: !current.is_muted,
        });
        set({ triageStates: next });
    },

    toggleShowMuted: () => {
        set((s) => ({ showMuted: !s.showMuted }));
    },

    setSearchTerm: (term) => {
        set({ searchTerm: term, selectedIndex: null });
    },

    setSeverityFilter: (severity) => {
        set({ severityFilter: severity, selectedIndex: null });
    },

    moveSelection: (direction, listLength) => {
        if (listLength === 0) return;
        set((s) => {
            const current = s.selectedIndex;
            if (current === null) {
                return { selectedIndex: 0 };
            }
            if (direction === "up") {
                return { selectedIndex: Math.max(0, current - 1) };
            }
            return { selectedIndex: Math.min(listLength - 1, current + 1) };
        });
    },

    clearSelection: () => {
        set({ selectedIndex: null });
    },

    getTriageState: (vulnId) => {
        return get().triageStates.get(vulnId) ?? { ...DEFAULT_TRIAGE };
    },

    hydrateTriageStates: (states) => {
        const next = new Map(get().triageStates);
        for (const [vulnId, state] of Object.entries(states)) {
            next.set(vulnId, state);
        }
        set({ triageStates: next });
    },

    reset: () => {
        set({
            vulnerabilities: [],
            selectedIndex: null,
            triageStates: new Map(),
            showMuted: false,
            searchTerm: "",
            severityFilter: null,
        });
    },
}));
