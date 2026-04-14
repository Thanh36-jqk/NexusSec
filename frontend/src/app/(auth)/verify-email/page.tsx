"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchApi } from "@/lib/api";
import { Loader2 } from "lucide-react";

function VerifyEmailForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const email = searchParams.get("email") || "";

    const [otp, setOtp] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (otp.length !== 6) {
            setError("OTP phải đủ 6 chữ số.");
            return;
        }
        setError(null);
        setLoading(true);
        try {
            await fetchApi("/auth/verify-email", {
                method: "POST",
                body: JSON.stringify({ email, otp }),
            });
            window.location.href = "/dashboard";
        } catch (err: any) {
            setError(err.message || "OTP không hợp lệ. Vui lòng thử lại.");
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
                    Check your email
                </h2>
                <p className="mt-2 text-[15px] text-slate-400" style={{ fontWeight: 400 }}>
                    We sent a 6-digit code to{" "}
                    <span className="text-slate-300 font-medium">{email || "your inbox"}</span>.
                </p>
            </div>

            {/* Error */}
            {error && (
                <div
                    className="px-4 py-3 rounded-xl text-sm text-red-400"
                    style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
                >
                    {error}
                </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* OTP input — large, monospaced */}
                <div>
                    <label className="block text-[13px] font-medium text-slate-400 mb-3">
                        Verification code
                    </label>
                    <input
                        required
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={otp}
                        onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                        placeholder="000000"
                        className="w-full h-14 rounded-xl text-white text-center text-2xl transition-all duration-200 outline-none"
                        style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.09)",
                            letterSpacing: "0.5em",
                            fontFamily: "var(--font-mono)",
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

                    {/* Progress dots */}
                    <div className="flex gap-2 justify-center mt-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div
                                key={i}
                                className="rounded-full transition-all duration-150"
                                style={{
                                    width: 6,
                                    height: 6,
                                    background: i < otp.length
                                        ? "rgba(99,102,241,0.9)"
                                        : "rgba(255,255,255,0.1)",
                                    transform: i < otp.length ? "scale(1.2)" : "scale(1)",
                                }}
                            />
                        ))}
                    </div>
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    disabled={loading || otp.length !== 6 || !email}
                    className="w-full h-11 rounded-xl text-[15px] font-semibold text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
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
                        {loading ? "Verifying…" : "Verify & continue"}
                    </span>
                </button>
            </form>

            {/* Info */}
            <p className="text-center text-[13px] text-slate-600">
                Didn't receive a code?{" "}
                <button className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
                    Resend email
                </button>
            </p>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense fallback={
            <div className="flex justify-center py-12">
                <Loader2 className="w-7 h-7 animate-spin text-indigo-500" />
            </div>
        }>
            <VerifyEmailForm />
        </Suspense>
    );
}
