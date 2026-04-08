"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";

/* ── Nav items ─────────────────────────────────────────────── */

const NAV = [
    { label: "Overview", href: "/dashboard" },
    { label: "Scans", href: "/scans" },
    { label: "Reports", href: "/reports" },
    { label: "Diff", href: "/diff" },
    { label: "Settings", href: "/settings" },
];

/* ── Layout ────────────────────────────────────────────────── */

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const [user, setUser] = useState<{ username: string; email: string } | null>(null);

    useEffect(() => {
        fetchApi("/auth/me")
            .then((res: any) => setUser(res.data))
            .catch(() => {});
    }, []);

    const initials = user?.username
        ? user.username.slice(0, 2).toUpperCase()
        : "—";

    return (
        <div className="flex h-screen overflow-hidden bg-[#09090b]">
            {/* ── Sidebar ─────────────────────────────────────── */}
            <aside className="hidden md:flex flex-col w-56 border-r border-zinc-800/60 bg-[#0a0a0f] shrink-0">
                {/* Brand */}
                <div className="px-5 py-5 border-b border-zinc-800/40">
                    <Link href="/dashboard" className="block">
                        <span className="text-sm font-semibold tracking-tight text-foreground">
                            NexusSec
                        </span>
                    </Link>
                </div>

                {/* Nav */}
                <nav className="flex-1 px-3 py-4 space-y-0.5">
                    {NAV.map((item) => {
                        const isActive =
                            pathname === item.href ||
                            (item.href !== "/dashboard" &&
                                pathname.startsWith(item.href));

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors relative ${
                                    isActive
                                        ? "text-foreground bg-white/[0.04]"
                                        : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
                                }`}
                            >
                                {isActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-blue-500 rounded-r" />
                                )}
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                {/* User footer */}
                <Link
                    href="/settings"
                    className="px-4 py-3 border-t border-zinc-800/40 flex items-center gap-3 hover:bg-white/[0.02] transition-colors group"
                >
                    <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700/50 flex items-center justify-center text-[10px] font-semibold text-zinc-400 group-hover:border-zinc-600 transition-colors">
                        {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-xs text-zinc-400 truncate">
                            {user?.username || "Loading…"}
                        </div>
                        <div className="text-[10px] text-zinc-600 truncate">
                            {user?.email || ""}
                        </div>
                    </div>
                </Link>
            </aside>

            {/* ── Main Content ────────────────────────────────── */}
            <main className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-7xl px-6 py-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
