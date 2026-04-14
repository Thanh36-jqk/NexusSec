"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchApi } from "@/lib/api";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const formData = new FormData(e.currentTarget);
        const email = formData.get("email") as string;
        const password = formData.get("password") as string;

        try {
            await fetchApi("/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password }),
            });
            router.push("/verify-email?email=" + encodeURIComponent(email));
        } catch (err: any) {
            setError(err.message || "Sai email hoặc mật khẩu, vui lòng thử lại.");
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            {/* Heading */}
            <div>
                <h2
                    className="text-3xl font-bold text-white"
                    style={{ letterSpacing: "-0.03em", lineHeight: 1.15 }}
                >
                    Welcome back
                </h2>
                <p className="mt-2 text-[15px] text-slate-400" style={{ fontWeight: 400 }}>
                    Sign in to access your security dashboard.
                </p>
            </div>

            {/* Error */}
            {error && (
                <div className="px-4 py-3 rounded-xl text-sm text-red-400" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    {error}
                </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email */}
                <div>
                    <label className="block text-[13px] font-medium text-slate-400 mb-2">
                        Email address
                    </label>
                    <input
                        required
                        type="email"
                        name="email"
                        id="login-email"
                        placeholder="you@company.com"
                        className="w-full h-11 px-4 rounded-xl text-[15px] text-white placeholder:text-slate-600 transition-all duration-200 outline-none"
                        style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.09)",
                        }}
                        onFocus={e => {
                            e.currentTarget.style.border = "1px solid rgba(99,102,241,0.5)";
                            e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.12)";
                        }}
                        onBlur={e => {
                            e.currentTarget.style.border = "1px solid rgba(255,255,255,0.09)";
                            e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                            e.currentTarget.style.boxShadow = "none";
                        }}
                    />
                </div>

                {/* Password */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-[13px] font-medium text-slate-400">
                            Password
                        </label>
                    </div>
                    <input
                        required
                        type="password"
                        name="password"
                        id="login-password"
                        placeholder="••••••••"
                        className="w-full h-11 px-4 rounded-xl text-[15px] text-white placeholder:text-slate-600 transition-all duration-200 outline-none"
                        style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.09)",
                        }}
                        onFocus={e => {
                            e.currentTarget.style.border = "1px solid rgba(99,102,241,0.5)";
                            e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.12)";
                        }}
                        onBlur={e => {
                            e.currentTarget.style.border = "1px solid rgba(255,255,255,0.09)";
                            e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                            e.currentTarget.style.boxShadow = "none";
                        }}
                    />
                </div>

                {/* Submit */}
                <button
                    id="login-submit"
                    type="submit"
                    disabled={loading}
                    className="relative w-full h-11 rounded-xl text-[15px] font-semibold text-white overflow-hidden transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-1 group"
                    style={{
                        background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                        boxShadow: "0 1px 0 0 rgba(255,255,255,0.12) inset, 0 4px 20px rgba(99,102,241,0.3)",
                    }}
                    onMouseEnter={e => {
                        if (!loading) (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 0 0 rgba(255,255,255,0.12) inset, 0 6px 28px rgba(99,102,241,0.45)";
                    }}
                    onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 0 0 rgba(255,255,255,0.12) inset, 0 4px 20px rgba(99,102,241,0.3)";
                    }}
                >
                    <span className="flex items-center justify-center gap-2">
                        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                        {loading ? "Signing in…" : "Sign in"}
                    </span>
                </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-4">
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
                <span className="text-[12px] text-slate-600 tracking-wider">or continue with</span>
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
            </div>

            {/* Social buttons */}
            <div className="grid grid-cols-2 gap-3">
                <button
                    type="button"
                    onClick={() => window.location.href = process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") + "/api/v1/auth/github/login"}
                    className="h-10 flex items-center justify-center gap-2.5 rounded-xl text-[14px] font-medium text-slate-300 transition-all duration-200"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                    GitHub
                </button>
                <button
                    type="button"
                    onClick={() => window.location.href = process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") + "/api/v1/auth/google/login"}
                    className="h-10 flex items-center justify-center gap-2.5 rounded-xl text-[14px] font-medium text-slate-300 transition-all duration-200"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Google
                </button>
            </div>

            {/* Footer link */}
            <p className="text-center text-[14px] text-slate-500">
                Don't have an account?{" "}
                <Link href="/register" className="text-indigo-400 font-medium hover:text-indigo-300 transition-colors">
                    Create one
                </Link>
            </p>
        </div>
    );
}
