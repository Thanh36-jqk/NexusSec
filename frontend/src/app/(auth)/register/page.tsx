"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchApi } from "@/lib/api";
import { Loader2, AlertCircle, CheckCircle, Mail, Lock, User, ShieldPlus } from "lucide-react";

export default function RegisterPage() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const formData = new FormData(e.currentTarget);
        const username = formData.get("username") as string;
        const email = formData.get("email") as string;
        const password = formData.get("password") as string;

        try {
            await fetchApi("/auth/register", {
                method: "POST",
                body: JSON.stringify({ username, email, password }),
            });
            setSuccess(true);
        } catch (err: any) {
            setError(err.message || "Failed to create account");
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="animate-in fade-in zoom-in-95 duration-500 py-8 text-center space-y-6">
                <div
                    className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-2"
                    style={{
                        background: "radial-gradient(circle at 50% 30%, rgba(16,185,129,0.25), rgba(16,185,129,0.05))",
                        border: "1px solid rgba(16,185,129,0.35)",
                        boxShadow: "0 0 40px rgba(16,185,129,0.2)",
                    }}
                >
                    <CheckCircle className="w-9 h-9 text-emerald-400" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-white">Account Created!</h2>
                    <p className="text-sm text-slate-400 mt-2 max-w-xs mx-auto leading-relaxed">
                        Welcome to NexusSec. Your account is ready — sign in to start scanning.
                    </p>
                </div>
                <Link
                    href="/login"
                    className="inline-flex items-center justify-center h-11 px-8 rounded-xl text-sm font-semibold text-white transition-all"
                    style={{
                        background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                        boxShadow: "0 0 0 1px rgba(99,102,241,0.4), 0 4px 24px rgba(99,102,241,0.3)",
                    }}
                >
                    Go to Login
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-7">
            {/* Header */}
            <div className="space-y-1">
                <div className="flex items-center gap-2 mb-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/25">
                        <ShieldPlus className="h-4 w-4 text-indigo-400" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-400">
                        New Account
                    </span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white">Create your account</h2>
                <p className="text-sm text-slate-400">
                    Set up your enterprise security workspace in seconds.
                </p>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-start gap-3 p-3.5 bg-red-500/8 border border-red-500/20 text-red-400 rounded-xl text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>{error}</p>
                </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Username */}
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Username
                    </label>
                    <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <input
                            required
                            type="text"
                            name="username"
                            id="register-username"
                            placeholder="johndoe"
                            minLength={3}
                            maxLength={100}
                            className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/8 bg-white/4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/60 focus:bg-white/6 focus:ring-1 focus:ring-indigo-500/30 transition-all duration-200"
                        />
                    </div>
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Email address
                    </label>
                    <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <input
                            required
                            type="email"
                            name="email"
                            id="register-email"
                            placeholder="you@company.com"
                            className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/8 bg-white/4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/60 focus:bg-white/6 focus:ring-1 focus:ring-indigo-500/30 transition-all duration-200"
                        />
                    </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Password
                    </label>
                    <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <input
                            required
                            type="password"
                            name="password"
                            id="register-password"
                            placeholder="Min. 8 characters"
                            minLength={8}
                            maxLength={72}
                            className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/8 bg-white/4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/60 focus:bg-white/6 focus:ring-1 focus:ring-indigo-500/30 transition-all duration-200"
                        />
                    </div>
                </div>

                {/* Submit */}
                <button
                    disabled={loading}
                    type="submit"
                    id="register-submit"
                    className="relative w-full h-11 mt-2 rounded-xl text-sm font-semibold text-white overflow-hidden group transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{
                        background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                        boxShadow: "0 0 0 1px rgba(99,102,241,0.4), 0 4px 24px rgba(99,102,241,0.3)",
                    }}
                >
                    <span
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{ background: "linear-gradient(135deg, #818cf8 0%, #6366f1 100%)" }}
                    />
                    <span className="relative flex items-center justify-center gap-2">
                        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                        {loading ? "Creating account…" : "Create account"}
                    </span>
                </button>
            </form>

            {/* Footer */}
            <div className="pt-1 text-center text-sm text-slate-500">
                Already have an account?{" "}
                <Link
                    href="/login"
                    className="font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                    Sign in
                </Link>
            </div>
        </div>
    );
}
