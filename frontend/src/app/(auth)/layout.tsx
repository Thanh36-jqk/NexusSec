"use client";

import dynamic from "next/dynamic";

// Load canvas client-side only (needs window/document)
const ShieldCanvas = dynamic(() => import("@/components/auth/ShieldCanvas"), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-[#020817]" />,
});

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex bg-[#020817]">
            {/* ── Left Panel: 3D Particle Shield ───────────── */}
            <div className="hidden lg:flex flex-col relative w-1/2 overflow-hidden select-none">
                {/* Canvas background */}
                <div className="absolute inset-0">
                    <ShieldCanvas />
                </div>

                {/* Radial fade at edges */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background:
                            "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, #020817 100%)",
                    }}
                />

                {/* Bottom gradient blend into right panel */}
                <div
                    className="absolute right-0 top-0 h-full w-32 pointer-events-none"
                    style={{
                        background: "linear-gradient(to right, transparent, #020817)",
                    }}
                />

                {/* Branding overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-10 z-10">
                    <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-400/60 mb-3">
                        Enterprise Security Platform
                    </p>
                    <h1
                        className="text-[3.5rem] font-black tracking-tight leading-none"
                        style={{
                            background: "linear-gradient(135deg, #e2e8f0 0%, #7dd3fc 45%, #a5b4fc 100%)",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            backgroundClip: "text",
                        }}
                    >
                        NexusSec
                    </h1>
                    <p className="mt-3 text-sm text-slate-400 max-w-xs leading-relaxed">
                        Automated API penetration testing powered by real-time orchestration. Discover, analyze, and mitigate vulnerabilities at scale.
                    </p>

                    {/* Security badges */}
                    <div className="flex gap-3 mt-6">
                        {["RS256 JWT", "Zero SSRF", "TLS 1.3"].map(badge => (
                            <span
                                key={badge}
                                className="text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full border border-cyan-500/30 text-cyan-400/80"
                                style={{ background: "rgba(6,182,212,0.06)" }}
                            >
                                {badge}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Right Panel: Auth Form ────────────────────── */}
            <div className="flex flex-col justify-center items-center flex-1 px-6 sm:px-10 lg:px-16 relative">
                {/* Subtle top-right glow */}
                <div
                    className="absolute top-0 right-0 w-80 h-80 pointer-events-none"
                    style={{
                        background: "radial-gradient(circle at top right, rgba(99,102,241,0.12), transparent 70%)",
                    }}
                />

                {/* Mobile logo */}
                <div className="lg:hidden mb-8 text-center">
                    <h1 className="text-3xl font-black tracking-tight text-white">NexusSec</h1>
                    <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">Security Platform</p>
                </div>

                <div className="w-full max-w-sm relative z-10">
                    {children}
                </div>

                <p className="mt-10 text-[10px] text-slate-600 uppercase tracking-widest">
                    Protected by end-to-end RSA-256 encryption
                </p>
            </div>
        </div>
    );
}
