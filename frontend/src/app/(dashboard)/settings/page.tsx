"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { fetchApi, clearAuthToken } from "@/lib/api";

interface UserProfile {
    id: string;
    username: string;
    email: string;
    role: string;
}

export default function SettingsPage() {
    const router = useRouter();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    // Change password
    const [pwOpen, setPwOpen] = useState(false);
    const [currentPw, setCurrentPw] = useState("");
    const [newPw, setNewPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [pwLoading, setPwLoading] = useState(false);
    const [pwError, setPwError] = useState<string | null>(null);
    const [pwSuccess, setPwSuccess] = useState(false);

    // Sign out
    const [signingOut, setSigningOut] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const res = (await fetchApi("/auth/me")) as { data: UserProfile };
                setProfile(res.data);
            } catch {
                /* redirect handled by fetchApi */
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPwError(null);
        setPwSuccess(false);

        if (newPw !== confirmPw) {
            setPwError("New passwords do not match.");
            return;
        }
        if (newPw.length < 8) {
            setPwError("Password must be at least 8 characters.");
            return;
        }

        setPwLoading(true);
        try {
            await fetchApi("/auth/password", {
                method: "PUT",
                body: JSON.stringify({
                    current_password: currentPw,
                    new_password: newPw,
                }),
            });
            setPwSuccess(true);
            setCurrentPw("");
            setNewPw("");
            setConfirmPw("");
            setTimeout(() => setPwOpen(false), 2000);
        } catch (err: any) {
            setPwError(err.message || "Failed to change password.");
        } finally {
            setPwLoading(false);
        }
    };

    const handleSignOut = () => {
        setSigningOut(true);
        setTimeout(() => {
            clearAuthToken();
            router.push("/login");
        }, 300);
    };

    return (
        <div className="max-w-2xl space-y-10">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Account
                </h1>
                <p className="text-sm text-zinc-500 mt-0.5">
                    Manage your profile and security preferences.
                </p>
            </div>

            {/* ── Profile ────────────────────────────────────── */}
            <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, duration: 0.35 }}
            >
                <h2 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-3">
                    Profile
                </h2>
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 overflow-hidden divide-y divide-zinc-800/40">
                    {loading ? (
                        <div className="px-5 py-8 text-center text-xs text-zinc-600">
                            Loading…
                        </div>
                    ) : (
                        <>
                            <ProfileRow label="Username" value={profile?.username} />
                            <ProfileRow label="Email" value={profile?.email} />
                            <ProfileRow
                                label="Role"
                                value={
                                    <span className="text-xs capitalize font-mono text-zinc-300">
                                        {profile?.role || "user"}
                                    </span>
                                }
                            />
                            <ProfileRow
                                label="User ID"
                                value={
                                    <span className="text-[10px] font-mono text-zinc-600 select-all">
                                        {profile?.id}
                                    </span>
                                }
                            />
                        </>
                    )}
                </div>
            </motion.section>

            {/* ── Security ───────────────────────────────────── */}
            <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.35 }}
            >
                <h2 className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-3">
                    Security
                </h2>
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 overflow-hidden divide-y divide-zinc-800/40">
                    {/* Change Password */}
                    <div className="px-5 py-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm text-zinc-300">Password</div>
                                <div className="text-xs text-zinc-600 mt-0.5">
                                    Update your account password.
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setPwOpen(!pwOpen);
                                    setPwError(null);
                                    setPwSuccess(false);
                                }}
                                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                                {pwOpen ? "Cancel" : "Change →"}
                            </button>
                        </div>

                        <AnimatePresence>
                            {pwOpen && (
                                <motion.form
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.25 }}
                                    className="overflow-hidden"
                                    onSubmit={handleChangePassword}
                                >
                                    <div className="pt-4 space-y-3">
                                        <input
                                            type="password"
                                            placeholder="Current password"
                                            value={currentPw}
                                            onChange={(e) => setCurrentPw(e.target.value)}
                                            required
                                            className="w-full h-9 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-sm text-foreground placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                                        />
                                        <input
                                            type="password"
                                            placeholder="New password"
                                            value={newPw}
                                            onChange={(e) => setNewPw(e.target.value)}
                                            required
                                            minLength={8}
                                            className="w-full h-9 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-sm text-foreground placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                                        />
                                        <input
                                            type="password"
                                            placeholder="Confirm new password"
                                            value={confirmPw}
                                            onChange={(e) => setConfirmPw(e.target.value)}
                                            required
                                            minLength={8}
                                            className="w-full h-9 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 text-sm text-foreground placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                                        />

                                        {pwError && (
                                            <div className="text-xs text-rose-400">{pwError}</div>
                                        )}
                                        {pwSuccess && (
                                            <div className="text-xs text-emerald-400">
                                                Password updated successfully.
                                            </div>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={pwLoading}
                                            className="h-9 px-4 rounded-lg text-xs font-medium bg-white/[0.06] text-zinc-200 border border-zinc-700 hover:bg-white/[0.1] hover:border-zinc-500 disabled:opacity-40 transition-all"
                                        >
                                            {pwLoading ? "Updating…" : "Update Password"}
                                        </button>
                                    </div>
                                </motion.form>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Authentication method */}
                    <div className="px-5 py-4 flex items-center justify-between">
                        <div className="text-sm text-zinc-300">Authentication</div>
                        <div className="text-xs font-mono text-zinc-600">
                            RS256 · HttpOnly JWT
                        </div>
                    </div>
                </div>
            </motion.section>

            {/* ── Sign Out ───────────────────────────────────── */}
            <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.35 }}
            >
                <div className="rounded-xl border border-zinc-800/50 bg-zinc-950/30 px-5 py-4 flex items-center justify-between">
                    <div>
                        <div className="text-sm text-zinc-400">Sign out</div>
                        <div className="text-xs text-zinc-600 mt-0.5">
                            End your current session.
                        </div>
                    </div>
                    <button
                        onClick={handleSignOut}
                        disabled={signingOut}
                        className="h-8 px-4 rounded-lg text-xs font-medium text-rose-400 border border-rose-500/20 bg-rose-500/[0.04] hover:bg-rose-500/[0.08] hover:border-rose-500/30 disabled:opacity-40 transition-all"
                    >
                        {signingOut ? "Signing out…" : "Sign out"}
                    </button>
                </div>
            </motion.section>
        </div>
    );
}

/* ── Helper ────────────────────────────────────────────────── */

function ProfileRow({
    label,
    value,
}: {
    label: string;
    value?: React.ReactNode;
}) {
    return (
        <div className="px-5 py-3.5 flex items-center justify-between">
            <div className="text-xs text-zinc-500">{label}</div>
            <div className="text-sm text-zinc-300">{value || "—"}</div>
        </div>
    );
}
