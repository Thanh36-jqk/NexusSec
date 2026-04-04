"use client";

import { useMemo } from "react";
import type { Vulnerability } from "@/types";

// ── Types ────────────────────────────────────────────────────

export interface DiffResult {
    /** Vulnerabilities present in Scan B but NOT in Scan A (newly appeared) */
    newVulns: Vulnerability[];
    /** Vulnerabilities present in Scan A but NOT in Scan B (patched/fixed) */
    resolvedVulns: Vulnerability[];
    /** Vulnerabilities present in BOTH scans (still unpatched) */
    unchangedVulns: Vulnerability[];
}

// ── Composite Key Generator ──────────────────────────────────
//
// Creates a deterministic fingerprint for each vulnerability.
// Two vulns are considered "the same" if they share:
//   vuln_id + name + url + port + protocol
//
// Why these fields?
// - vuln_id: primary identifier (CVE-xxxx, CWE-xxxx, NMAP-SVC-xxxx)
// - name: catch unnamed or tool-generated IDs that may differ across runs
// - url: same vuln on different endpoints = different finding
// - port + protocol: Nmap findings differentiated by port
//
// Performance: string concatenation + Map.set = O(1) amortized.

function getVulnKey(v: Vulnerability): string {
    return `${v.vuln_id}|${v.name}|${v.url ?? ""}|${v.port ?? 0}|${v.protocol ?? ""}`;
}

// ── Diff Algorithm ───────────────────────────────────────────
//
// Time Complexity: O(N + M) where N = |scanA|, M = |scanB|
// Space Complexity: O(M) for the Hash Map of Scan B
//
// Algorithm (3 single-pass loops, zero nesting):
//
//   Step 1: Index Scan B into a Map<key, Vulnerability>          → O(M)
//   Step 2: Walk Scan A, probe Map B:
//           - Found → unchanged, DELETE from Map B               → O(N)
//           - Not found → resolved (was in A, gone from B)
//   Step 3: Remaining entries in Map B → new (only in B)         → O(M')
//
// The delete-on-match trick in Step 2 is the key insight:
// it partitions Map B into "matched" (deleted) and "unmatched"
// (remaining = new vulns) without a third traversal of the
// full set.

function computeDiff(scanA: Vulnerability[], scanB: Vulnerability[]): DiffResult {
    // Step 1: Build index of Scan B
    const mapB = new Map<string, Vulnerability>();
    for (const vuln of scanB) {
        mapB.set(getVulnKey(vuln), vuln);
    }

    // Step 2: Walk Scan A, partition into resolved vs unchanged
    const resolvedVulns: Vulnerability[] = [];
    const unchangedVulns: Vulnerability[] = [];

    for (const vuln of scanA) {
        const key = getVulnKey(vuln);
        if (mapB.has(key)) {
            unchangedVulns.push(vuln);
            mapB.delete(key); // Remove matched — remainder = new
        } else {
            resolvedVulns.push(vuln);
        }
    }

    // Step 3: Remaining in mapB = new vulnerabilities
    const newVulns = Array.from(mapB.values());

    return { newVulns, resolvedVulns, unchangedVulns };
}

// ── React Hook ───────────────────────────────────────────────
//
// Wraps computeDiff in useMemo so it only recomputes when
// either scan report reference changes (i.e., user selects
// a different scan from the dropdown).
//
// With 15K + 16K vulns:
//   - computeDiff runs ~31K iterations (not 240M)
//   - Execution time: ~1-5ms on V8
//   - UI stays fully responsive

export function useScanDiff(
    scanA: Vulnerability[] | null,
    scanB: Vulnerability[] | null
): DiffResult | null {
    return useMemo(() => {
        if (!scanA || !scanB) return null;
        return computeDiff(scanA, scanB);
    }, [scanA, scanB]);
}
