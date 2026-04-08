"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { fetchApi } from "@/lib/api";

/* ── Types ────────────────────────────────────────────────── */

interface TargetResponse {
    id: string;
    name: string;
    base_url: string;
    description?: string;
    created_at: string;
}

const SCAN_TYPES = [
    {
        value: "zap" as const,
        label: "ZAP",
        desc: "Dynamic application security testing for web apps.",
    },
    {
        value: "nmap" as const,
        label: "Nmap",
        desc: "Port scanning and service enumeration.",
    },
    {
        value: "full" as const,
        label: "Full",
        desc: "Combined ZAP + Nmap orchestration.",
    },
];

/* ── Page ──────────────────────────────────────────────────── */

export default function NewScanPage() {
    const router = useRouter();
    const [targets, setTargets] = useState<TargetResponse[]>([]);
    const [loadingTargets, setLoadingTargets] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedTargetId, setSelectedTargetId] = useState<string>("");
    const [scanType, setScanType] = useState<"zap" | "nmap" | "full">("zap");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Create target
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState("");
    const [newUrl, setNewUrl] = useState("");

    useEffect(() => {
        async function load() {
            try {
                const res = await fetchApi<{ data: TargetResponse[] }>("/targets");
                setTargets(res.data || []);
            } catch (err: any) {
                setError(err.message || "Failed to load targets");
            } finally {
                setLoadingTargets(false);
            }
        }
        load();
    }, []);

    const handleCreateTarget = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        try {
            const res = await fetchApi<{ data: TargetResponse }>("/targets", {
                method: "POST",
                body: JSON.stringify({
                    name: newName,
                    base_url: newUrl,
                    description: "Created via New Scan flow",
                }),
            });
            setTargets([res.data, ...targets]);
            setSelectedTargetId(res.data.id);
            setShowCreate(false);
            setNewName("");
            setNewUrl("");
        } catch (err: any) {
            setError(err.message || "Failed to create target");
        }
    };

    const handleStartScan = async () => {
        if (!selectedTargetId) return;
        setIsSubmitting(true);
        setError(null);
        try {
            const res = await fetchApi<{ data: { id: string } }>("/scans", {
                method: "POST",
                body: JSON.stringify({
                    target_id: selectedTargetId,
                    scan_type: scanType,
                }),
            });
            router.push(`/scans/${res.data.id}`);
        } catch (err: any) {
            setError(err.message || "Failed to start scan");
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            {/* ── Header ─────────────────────────────────────── */}
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    New Scan
                </h1>
                <p className="text-sm text-zinc-500 mt-0.5">
                    Configure and launch a security scan.
                </p>
            </div>

            {/* ── Error ──────────────────────────────────────── */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] px-5 py-3 overflow-hidden"
                    >
                        <p className="text-xs text-rose-400">{error}</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Step 1: Target ──────────────────────────────── */}
            <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, duration: 0.3 }}
            >
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h2 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                            Step 1
                        </h2>
                        <h3 className="text-sm font-medium text-zinc-300 mt-0.5">
                            Select Target
                        </h3>
                    </div>
                    {!showCreate && (
                        <button
                            onClick={() => setShowCreate(true)}
                            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                            + Create target
                        </button>
                    )}
                </div>

                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 overflow-hidden">
                    {/* Create form */}
                    <AnimatePresence>
                        {showCreate && (
                            <motion.form
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                onSubmit={handleCreateTarget}
                                className="overflow-hidden border-b border-zinc-800/40"
                            >
                                <div className="p-4 space-y-3">
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <input
                                            required
                                            type="text"
                                            placeholder="Target name"
                                            value={newName}
                                            onChange={(e) => setNewName(e.target.value)}
                                            className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-sm text-foreground placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                                        />
                                        <input
                                            required
                                            type="url"
                                            placeholder="https://target.com"
                                            value={newUrl}
                                            onChange={(e) => setNewUrl(e.target.value)}
                                            className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-sm text-foreground placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                                        />
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                        <button
                                            type="button"
                                            onClick={() => setShowCreate(false)}
                                            className="text-xs text-zinc-600 hover:text-zinc-400 px-3 py-1.5 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="h-8 px-4 rounded-lg text-xs font-medium bg-white/[0.06] text-zinc-200 border border-zinc-700 hover:bg-white/[0.1] hover:border-zinc-500 transition-all"
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>
                            </motion.form>
                        )}
                    </AnimatePresence>

                    {/* Target list */}
                    {loadingTargets ? (
                        <div className="p-8 text-center text-xs text-zinc-600">
                            Loading targets…
                        </div>
                    ) : targets.length === 0 ? (
                        <div className="p-8 text-center">
                            <p className="text-xs text-zinc-500 mb-3">
                                No targets yet — create one to get started.
                            </p>
                            {!showCreate && (
                                <button
                                    onClick={() => setShowCreate(true)}
                                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                    Create target →
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="divide-y divide-zinc-800/30 max-h-[280px] overflow-y-auto">
                            {targets.map((t) => {
                                const isSelected = selectedTargetId === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => setSelectedTargetId(t.id)}
                                        className={`w-full text-left px-5 py-3.5 flex items-center justify-between transition-all border-l-2 ${
                                            isSelected
                                                ? "border-l-blue-500 bg-blue-500/[0.03]"
                                                : "border-l-transparent hover:border-l-zinc-700"
                                        }`}
                                    >
                                        <div className="min-w-0">
                                            <div className="text-sm text-zinc-300 truncate">
                                                {t.name}
                                            </div>
                                            <div className="text-[11px] text-zinc-600 truncate mt-0.5">
                                                {t.base_url}
                                            </div>
                                        </div>
                                        {isSelected && (
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 ml-3" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </motion.section>

            {/* ── Step 2: Engine ──────────────────────────────── */}
            <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.3 }}
            >
                <div className="mb-3">
                    <h2 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                        Step 2
                    </h2>
                    <h3 className="text-sm font-medium text-zinc-300 mt-0.5">
                        Scan Engine
                    </h3>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                    {SCAN_TYPES.map((t) => {
                        const isActive = scanType === t.value;
                        return (
                            <button
                                key={t.value}
                                onClick={() => setScanType(t.value)}
                                className={`text-left rounded-xl border p-4 transition-all ${
                                    isActive
                                        ? "border-blue-500/40 bg-blue-500/[0.04] shadow-[0_0_20px_rgba(59,130,246,0.06)]"
                                        : "border-zinc-800/80 bg-zinc-950/50 hover:border-zinc-700"
                                }`}
                            >
                                <div
                                    className={`text-sm font-mono font-medium mb-1 ${
                                        isActive ? "text-blue-400" : "text-zinc-400"
                                    }`}
                                >
                                    {t.label}
                                </div>
                                <div className="text-[11px] text-zinc-600 leading-relaxed">
                                    {t.desc}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </motion.section>

            {/* ── Launch ──────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.3 }}
                className="pt-4 border-t border-zinc-800/40 flex items-center justify-between"
            >
                <div className="text-xs text-zinc-600">
                    {selectedTargetId ? (
                        <span>
                            Target selected · Engine:{" "}
                            <span className="font-mono text-zinc-400">
                                {scanType.toUpperCase()}
                            </span>
                        </span>
                    ) : (
                        "Select a target to continue."
                    )}
                </div>
                <button
                    onClick={handleStartScan}
                    disabled={!selectedTargetId || isSubmitting}
                    className="h-10 px-6 rounded-xl text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    style={
                        selectedTargetId && !isSubmitting
                            ? {
                                  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                                  color: "#fff",
                                  boxShadow:
                                      "0 0 0 1px rgba(59,130,246,0.3), 0 4px 20px rgba(59,130,246,0.25)",
                              }
                            : {
                                  background: "#18181b",
                                  color: "#52525b",
                                  border: "1px solid #27272a",
                              }
                    }
                >
                    {isSubmitting ? "Starting…" : "Start Scan"}
                </button>
            </motion.div>
        </div>
    );
}
