import Link from "next/link";
import {
    Shield,
    LayoutDashboard,
    ScanSearch,
    FileText,
    GitCompareArrows,
    Settings,
    Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Scans", href: "/scans", icon: ScanSearch },
    { label: "Reports", href: "/reports", icon: FileText },
    { label: "Diff", href: "/diff", icon: GitCompareArrows },
    { label: "Settings", href: "/settings", icon: Settings },
];

/**
 * Dashboard shell — sidebar + header + main content area.
 *
 * UX Decisions:
 * - Fixed sidebar: persistent navigation, doesn't push content
 * - Minimal sidebar: icon + label, no heavy decorations
 * - Connection indicator in sidebar footer: always visible WS status
 * - Content area has max-width for readability on ultrawide monitors
 */
export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen overflow-hidden bg-background">
            {/* ── Sidebar ──────────────────────────────────────── */}
            <aside className="hidden md:flex flex-col w-64 border-r border-border bg-sidebar shrink-0">
                {/* Logo */}
                <div className="flex items-center gap-2.5 px-6 py-5 border-b border-border">
                    <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
                        <Shield className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-foreground tracking-tight">NexusSec</h1>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            Security Scanner
                        </p>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 py-4 space-y-1">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                                    "text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent",
                                    "transition-colors"
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                {/* Footer: Status */}
                <div className="px-4 py-3 border-t border-border">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Activity className="h-3 w-3 text-emerald-500" />
                        <span>System Operational</span>
                    </div>
                </div>
            </aside>

            {/* ── Main Content ─────────────────────────────────── */}
            <main className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-7xl px-6 py-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
