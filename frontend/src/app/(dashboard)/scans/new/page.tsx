"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchApi } from "@/lib/api";
import { Shield, Plus, Target, Check, AlertCircle, Loader2 } from "lucide-react";

// DTOs based on backend models
interface TargetResponse {
    id: string;
    name: string;
    base_url: string;
    description?: string;
    created_at: string;
}

export default function NewScanPage() {
    const router = useRouter();
    const [targets, setTargets] = useState<TargetResponse[]>([]);
    const [loadingTargets, setLoadingTargets] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedTargetId, setSelectedTargetId] = useState<string>("");
    const [scanType, setScanType] = useState<"zap" | "nmap" | "full">("zap");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // New target creation form
    const [isCreatingTarget, setIsCreatingTarget] = useState(false);
    const [newTargetName, setNewTargetName] = useState("");
    const [newTargetUrl, setNewTargetUrl] = useState("");

    useEffect(() => {
        const loadTargets = async () => {
            try {
                const res = await fetchApi<{ data: TargetResponse[] }>('/targets');
                setTargets(res.data || []);
            } catch (err: any) {
                setError(err.message || "Failed to load targets");
            } finally {
                setLoadingTargets(false);
            }
        };
        loadTargets();
    }, []);

    const handleCreateTarget = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        try {
            const res = await fetchApi<{ data: TargetResponse }>('/targets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newTargetName,
                    base_url: newTargetUrl,
                    description: "Created via New Scan flow"
                })
            });
            setTargets([res.data, ...targets]);
            setSelectedTargetId(res.data.id);
            setIsCreatingTarget(false);
            setNewTargetName("");
            setNewTargetUrl("");
        } catch (err: any) {
            setError(err.message || "Failed to create target");
        }
    };

    const handleStartScan = async () => {
        if (!selectedTargetId) return;
        setIsSubmitting(true);
        setError(null);
        try {
            const res = await fetchApi<{ data: { id: string } }>('/scans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_id: selectedTargetId,
                    scan_type: scanType
                })
            });
            router.push(`/scans/${res.data.id}`);
        } catch (err: any) {
            setError(err.message || "Failed to start scan");
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 border border-primary/20">
                        <Plus className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">
                            Configure New Scan
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Select a target and configure scan options to begin.
                        </p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-red-400">Error</p>
                        <p className="text-sm text-red-400/80 mt-1">{error}</p>
                    </div>
                </div>
            )}

            <div className="bg-card border border-border rounded-xl p-6 space-y-8">
                {/* ── Step 1: Select Target ───────────────────── */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-base font-semibold text-foreground">1. Select Target</h2>
                            <p className="text-sm text-muted-foreground mt-1">Choose an existing target or create a new one.</p>
                        </div>
                        {!isCreatingTarget && (
                            <button
                                onClick={() => setIsCreatingTarget(true)}
                                className="text-sm font-medium text-primary hover:underline"
                            >
                                + New Target
                            </button>
                        )}
                    </div>

                    {isCreatingTarget ? (
                        <form onSubmit={handleCreateTarget} className="p-4 bg-muted/20 border border-border rounded-lg space-y-4">
                            <h3 className="text-sm font-medium text-foreground">Create Target</h3>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1">Target Name</label>
                                    <input
                                        required
                                        type="text"
                                        placeholder="e.g. Production API"
                                        value={newTargetName}
                                        onChange={(e) => setNewTargetName(e.target.value)}
                                        className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1">Base URL</label>
                                    <input
                                        required
                                        type="url"
                                        placeholder="https://api.example.com"
                                        value={newTargetUrl}
                                        onChange={(e) => setNewTargetUrl(e.target.value)}
                                        className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                                <button
                                    type="button"
                                    onClick={() => { setIsCreatingTarget(false); setError(null); }}
                                    className="text-sm text-muted-foreground hover:text-foreground px-3 py-2"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                                >
                                    Save Target
                                </button>
                            </div>
                        </form>
                    ) : loadingTargets ? (
                        <div className="flex items-center justify-center p-8 border border-border rounded-lg border-dashed">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : targets.length === 0 ? (
                        <div className="text-center p-8 border border-border rounded-lg border-dashed">
                            <Target className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
                            <p className="text-sm text-foreground font-medium">No targets found</p>
                            <p className="text-xs text-muted-foreground mt-1 mb-4">You need to create a target before running a scan.</p>
                            <button
                                onClick={() => setIsCreatingTarget(true)}
                                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium"
                            >
                                Create Target
                            </button>
                        </div>
                    ) : (
                        <div className="grid gap-3 md:grid-cols-2">
                            {targets.map(t => (
                                <div
                                    key={t.id}
                                    onClick={() => setSelectedTargetId(t.id)}
                                    className={`relative p-4 cursor-pointer rounded-lg border transition-all ${
                                        selectedTargetId === t.id 
                                        ? "border-primary bg-primary/5 ring-1 ring-primary/20" 
                                        : "border-border bg-background hover:border-primary/50"
                                    }`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-sm font-medium text-foreground">{t.name}</p>
                                            <p className="text-xs text-muted-foreground mt-1 truncate">{t.base_url}</p>
                                        </div>
                                        {selectedTargetId === t.id && (
                                            <Check className="h-4 w-4 text-primary shrink-0" />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Step 2: Configure ───────────────────────── */}
                <div className="space-y-4">
                    <div>
                        <h2 className="text-base font-semibold text-foreground">2. Scan Configuration</h2>
                        <p className="text-sm text-muted-foreground mt-1">Select the type of security scan.</p>
                    </div>
                    
                    <div className="grid gap-3 md:grid-cols-3">
                        {/* ZAP */}
                        <div
                            onClick={() => setScanType("zap")}
                            className={`p-4 cursor-pointer rounded-lg border transition-all ${
                                scanType === "zap" 
                                ? "border-primary bg-primary/5 ring-1 ring-primary/20" 
                                : "border-border bg-background hover:border-primary/50"
                            }`}
                        >
                            <Shield className={`h-6 w-6 mb-3 ${scanType === "zap" ? "text-primary" : "text-muted-foreground"}`} />
                            <p className="text-sm font-medium text-foreground">DAST Scanner (ZAP)</p>
                            <p className="text-xs text-muted-foreground mt-1">Deep dynamic application security testing for modern web apps.</p>
                        </div>

                        {/* Nmap */}
                        <div
                            onClick={() => setScanType("nmap")}
                            className={`p-4 cursor-pointer rounded-lg border transition-all ${
                                scanType === "nmap" 
                                ? "border-primary bg-primary/5 ring-1 ring-primary/20" 
                                : "border-border bg-background hover:border-primary/50"
                            }`}
                        >
                            <Target className={`h-6 w-6 mb-3 ${scanType === "nmap" ? "text-primary" : "text-muted-foreground"}`} />
                            <p className="text-sm font-medium text-foreground">Network Scan (Nmap)</p>
                            <p className="text-xs text-muted-foreground mt-1">Port scanning and service enumeration for infrastructure.</p>
                        </div>

                        {/* Full */}
                        <div
                            onClick={() => setScanType("full")}
                            className={`p-4 cursor-pointer rounded-lg border transition-all ${
                                scanType === "full" 
                                ? "border-primary bg-primary/5 ring-1 ring-primary/20" 
                                : "border-border bg-background hover:border-primary/50"
                            }`}
                        >
                            <AlertCircle className={`h-6 w-6 mb-3 ${scanType === "full" ? "text-primary" : "text-muted-foreground"}`} />
                            <p className="text-sm font-medium text-foreground">Full Orhcestration</p>
                            <p className="text-xs text-muted-foreground mt-1">Comprehensive scan combining both ZAP and Nmap engines.</p>
                        </div>
                    </div>
                </div>

                {/* ── Submit ───────────────────────────────────── */}
                <div className="pt-4 border-t border-border flex justify-end">
                    <button
                        onClick={handleStartScan}
                        disabled={!selectedTargetId || isSubmitting}
                        className={`h-10 px-6 rounded-lg text-sm font-medium inline-flex items-center gap-2 transition-all ${
                            selectedTargetId && !isSubmitting
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "bg-muted text-muted-foreground cursor-not-allowed"
                        }`}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Starting Scan...
                            </>
                        ) : (
                            <>Start Scan</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
