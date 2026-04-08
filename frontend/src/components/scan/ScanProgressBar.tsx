"use client";

import { cn } from "@/lib/utils";
import type { ScanStatus } from "@/types";

interface ScanProgressBarProps {
    progress: number;
    status: ScanStatus;
    className?: string;
}

const STATUS_CONFIG: Record<ScanStatus, { color: string; bgColor: string; label: string }> = {
    pending: { color: "bg-gray-500", bgColor: "bg-gray-500/20", label: "Queued" },
    running: { color: "bg-blue-500", bgColor: "bg-blue-500/20", label: "Scanning" },
    completed: { color: "bg-emerald-500", bgColor: "bg-emerald-500/20", label: "Completed" },
    failed: { color: "bg-red-500", bgColor: "bg-red-500/20", label: "Failed" },
    cancelled: { color: "bg-gray-400", bgColor: "bg-gray-400/20", label: "Cancelled" },
};

/**
 * Real-time scan progress bar with status-aware colors and animations.
 *
 * UX Decisions:
 * - Pulse glow animation on the bar edge while scanning (draws attention)
 * - Percentage text always visible to the right (prevents layout shift)
 * - Status label below the bar for immediate context
 * - Smooth width transitions to avoid jarring jumps
 */
export function ScanProgressBar({ progress, status, className }: ScanProgressBarProps) {
    const config = STATUS_CONFIG[status];
    const isActive = status === "running";

    // For completed scans the DB progress column is often 0 (not updated after the
    // WebSocket stream ends). Always show full bar for terminal statuses.
    const effectiveProgress =
        status === "completed" ? 100 :
        status === "failed"    ? 100 :  // show full red bar on failure
        progress;
    const clampedProgress = Math.min(100, Math.max(0, effectiveProgress));

    return (
        <div className={cn("space-y-2", className)}>
            {/* Header: Status + Percentage */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className={cn("h-2 w-2 rounded-full", config.color, isActive && "animate-pulse")} />
                    <span className="text-sm font-medium text-foreground">{config.label}</span>
                </div>
                <span className="text-sm tabular-nums font-mono text-muted-foreground">
                    {clampedProgress}%
                </span>
            </div>

            {/* Progress Track */}
            <div className={cn("h-2 w-full rounded-full overflow-hidden", config.bgColor)}>
                <div
                    className={cn(
                        "h-full rounded-full transition-all duration-700 ease-out",
                        config.color,
                        isActive && clampedProgress > 0 && "progress-glow"
                    )}
                    style={{ width: `${clampedProgress}%` }}
                    role="progressbar"
                    aria-valuenow={clampedProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Scan ${config.label}: ${clampedProgress}%`}
                />
            </div>

            {/* Time context */}
            {isActive && (
                <p className="text-xs text-muted-foreground animate-pulse">
                    Scan in progress — receiving real-time updates...
                </p>
            )}
        </div>
    );
}
