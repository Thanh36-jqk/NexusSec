"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchApi, setAuthToken } from "@/lib/api";
import { Loader2, AlertCircle, Mail, Lock, ShieldCheck } from "lucide-react";
import type { APIResponse } from "@/types";

export default function LoginPage() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const formData = new FormData(e.currentTarget);
        const email = formData.get("email") as string;
        const password = formData.get("password") as string;

        try {
            const res = await fetchApi<APIResponse<{ access_token: string }>>("/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password }),
            });
            setAuthToken(res.data.access_token);
            window.location.href = "/dashboard";
        } catch (err: any) {
            setError(err.message || "Invalid credentials. Please try again.");
            setLoading(false);
        }
    };

    return (
        <div className="space-y-7">
            {/* Header */}
            <div className="space-y-1">
                <div className="flex items-center gap-2 mb-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/25">
                        <ShieldCheck className="h-4 w-4 text-indigo-400" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-400">
                        Secure Login
                    </span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white">Welcome back</h2>
                <p className="text-sm text-slate-400">
                    Sign in to access your security dashboard.
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
                            id="login-email"
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
                            id="login-password"
                            placeholder="Min. 8 characters"
                            className="w-full h-11 pl-10 pr-4 rounded-xl border border-white/8 bg-white/4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/60 focus:bg-white/6 focus:ring-1 focus:ring-indigo-500/30 transition-all duration-200"
                        />
                    </div>
                </div>

                {/* Submit */}
                <button
                    disabled={loading}
                    type="submit"
                    id="login-submit"
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
                        {loading ? "Authenticating…" : "Sign in"}
                    </span>
                </button>
            </form>

            {/* Footer */}
            <div className="pt-1 text-center text-sm text-slate-500">
                New to NexusSec?{" "}
                <Link
                    href="/register"
                    className="font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                    Create an account
                </Link>
            </div>
        </div>
    );
}
