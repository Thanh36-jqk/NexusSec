"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ShieldCanvas = dynamic(() => import("@/components/auth/ShieldCanvas"), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-[#020817]" />,
});

const NAV_LINKS = [
    { label: "Sign in", href: "/login" },
    { label: "Create account", href: "/register" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="min-h-screen flex bg-[#020817]" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>

            {/* ── Left Panel: Branding + Canvas ─────────────────── */}
            <div className="hidden lg:flex flex-col relative w-[54%] overflow-hidden select-none">
                {/* Canvas */}
                <div className="absolute inset-0">
                    <ShieldCanvas />
                </div>

                {/* Radial vignette */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, #020817 100%)" }}
                />
                {/* Right edge blend */}
                <div
                    className="absolute right-0 top-0 h-full w-40 pointer-events-none"
                    style={{ background: "linear-gradient(to right, transparent, #020817)" }}
                />

                {/* Branding */}
                <div className="absolute bottom-0 left-0 right-0 p-12 z-10">
                    <div className="flex items-end gap-4 mb-3">
                        <Image
                            src="/logo.png"
                            alt="NexusSec"
                            width={56}
                            height={56}
                            className="h-14 w-auto"
                        />
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.35em] text-cyan-400/50 mb-1.5"
                               style={{ fontFamily: "var(--font-mono)" }}>
                                Enterprise Security Platform
                            </p>
                            <h1
                                className="text-5xl font-extrabold tracking-tight leading-none"
                                style={{
                                    background: "linear-gradient(135deg, #e2e8f0 0%, #7dd3fc 45%, #a5b4fc 100%)",
                                    WebkitBackgroundClip: "text",
                                    WebkitTextFillColor: "transparent",
                                    backgroundClip: "text",
                                    letterSpacing: "-0.03em",
                                }}
                            >
                                NexusSec
                            </h1>
                        </div>
                    </div>

                    <p className="text-sm text-slate-400/80 max-w-[320px] leading-relaxed mt-4" style={{ fontWeight: 400 }}>
                        Automated API penetration testing powered by real-time orchestration. Discover, analyze, and mitigate vulnerabilities at scale.
                    </p>

                    <div className="flex gap-2 mt-7">
                        {["RS256 JWT", "Zero SSRF", "TLS 1.3"].map(badge => (
                            <span
                                key={badge}
                                className="text-[10px] font-medium uppercase tracking-widest px-3 py-1 rounded-full border border-cyan-500/20 text-cyan-400/70"
                                style={{ background: "rgba(6,182,212,0.05)", fontFamily: "var(--font-mono)" }}
                            >
                                {badge}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Right Panel: Form Area ─────────────────────────── */}
            <div className="flex flex-col flex-1 relative">
                {/* Ambient glow */}
                <div
                    className="absolute top-0 right-0 w-[500px] h-[500px] pointer-events-none"
                    style={{ background: "radial-gradient(circle at top right, rgba(99,102,241,0.08), transparent 65%)" }}
                />

                {/* Top nav — tab switcher */}
                <div className="relative z-10 flex justify-end items-center px-10 pt-8">
                    <nav className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        {NAV_LINKS.map(({ label, href }) => {
                            const active = pathname === href;
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
                                    style={active
                                        ? { background: "rgba(99,102,241,0.18)", color: "#a5b4fc", boxShadow: "0 0 0 1px rgba(99,102,241,0.3)" }
                                        : { color: "rgba(148,163,184,0.7)" }
                                    }
                                >
                                    {label}
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                {/* Mobile logo */}
                <div className="lg:hidden px-6 pt-6">
                    <span className="text-2xl font-extrabold tracking-tight text-white" style={{ letterSpacing: "-0.03em" }}>
                        NexusSec
                    </span>
                </div>

                {/* Form centered */}
                <div className="flex flex-col justify-center items-center flex-1 px-6 sm:px-10 lg:px-16 pb-16">
                    <div className="w-full max-w-[400px] relative z-10">
                        {children}
                    </div>
                </div>

                {/* Footer */}
                <p className="pb-6 text-center text-[11px] text-slate-600 tracking-wider" style={{ fontFamily: "var(--font-mono)" }}>
                    Protected by end-to-end RSA-256 encryption
                </p>
            </div>
        </div>
    );
}
