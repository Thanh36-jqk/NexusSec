import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind CSS classes with proper conflict resolution.
 * Combines clsx (conditional classes) with twMerge (deduplication).
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
