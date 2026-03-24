import { cn } from "@/lib/utils";

interface SkeletonProps {
    className?: string;
}

/** Base skeleton with shimmer animation. */
export function Skeleton({ className }: SkeletonProps) {
    return <div className={cn("skeleton", className)} />;
}

/**
 * Skeleton loader for the scan detail page.
 * Matches the exact layout of the real page to prevent CLS.
 *
 * UX: Skeletons are shaped to match the final content — not generic boxes.
 * This gives users a mental model of what's loading.
 */
export function ScanDetailSkeleton() {
    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* Header */}
            <div className="space-y-3">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-96" />
            </div>

            {/* Info Cards Row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                    <div
                        key={i}
                        className="rounded-xl border border-border bg-card p-4 space-y-3"
                    >
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-6 w-32" />
                    </div>
                ))}
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-12" />
                </div>
                <Skeleton className="h-2 w-full" />
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {[...Array(5)].map((_, i) => (
                    <div
                        key={i}
                        className="rounded-xl border border-border bg-card p-4 space-y-3"
                    >
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-8 w-12" />
                    </div>
                ))}
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="border-b border-border px-4 py-3">
                    <Skeleton className="h-3 w-full max-w-md" />
                </div>
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="border-b border-border/50 px-4 py-3">
                        <div className="flex items-center gap-4">
                            <Skeleton className="h-5 w-16 rounded-md" />
                            <Skeleton className="h-4 flex-1 max-w-xs" />
                            <Skeleton className="h-4 w-16" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Skeleton for a single stats card. */
export function StatsCardSkeleton() {
    return (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-32" />
        </div>
    );
}
