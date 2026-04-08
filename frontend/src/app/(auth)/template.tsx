"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function AuthTemplate({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [renderKey, setRenderKey] = useState(pathname);
    const [isAnimating, setIsAnimating] = useState(false);

    // This creates a smooth crossfade + blur effect when switching between /login and /register
    useEffect(() => {
        if (pathname !== renderKey) {
            setIsAnimating(true);
            const timeout = setTimeout(() => {
                setRenderKey(pathname);
                setIsAnimating(false);
            }, 300); // 300ms fade-out duration
            return () => clearTimeout(timeout);
        }
    }, [pathname, renderKey]);

    return (
        <div
            key={renderKey}
            className={`w-full transition-all duration-300 ease-in-out ${
                isAnimating
                    ? "opacity-0 blur-md scale-95 translate-x-4" // Exit state
                    : "opacity-100 blur-0 scale-100 translate-x-0"  // Enter state
            } animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-500`}
        >
            {children}
        </div>
    );
}
