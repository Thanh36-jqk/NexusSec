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

                {/* Social Login Separator */}
                <div className="relative mt-2">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-white/10"></div>
                    </div>
                    <div className="relative flex justify-center text-xs">
                        <span className="bg-[#0f172a] px-2 text-slate-500 uppercase tracking-widest">Or continue with</span>
                    </div>
                </div>

                {/* Social Buttons */}
                <div className="grid grid-cols-2 gap-3 mt-2">
                    <button
                        type="button"
                        onClick={() => window.location.href = process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") + "/api/v1/auth/github/login"}
                        className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium text-white"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" /></svg>
                        GitHub
                    </button>
                    <button
                        type="button"
                        onClick={() => window.location.href = process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") + "/api/v1/auth/google/login"}
                        className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium text-white"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        Google
                    </button>
                </div>
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
