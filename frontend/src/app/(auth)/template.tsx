"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Direction = "left" | "right" | "none";

export default function AuthTemplate({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const prevPathname = useRef(pathname);
    const [displayPath, setDisplayPath] = useState(pathname);
    const [phase, setPhase] = useState<"idle" | "exit" | "enter">("idle");
    const [direction, setDirection] = useState<Direction>("none");

    useEffect(() => {
        if (pathname === prevPathname.current) return;

        // Determine slide direction: login→register = slide left, register→login = slide right
        const dir: Direction =
            pathname === "/register" || pathname === "/verify-email" ? "left" : "right";

        setDirection(dir);
        setPhase("exit");

        const t1 = setTimeout(() => {
            setDisplayPath(pathname);
            prevPathname.current = pathname;
            setPhase("enter");
        }, 260);

        const t2 = setTimeout(() => {
            setPhase("idle");
        }, 520);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
        };
    }, [pathname]);

    const exitX = direction === "left" ? "-6%" : "6%";
    const enterX = direction === "left" ? "6%" : "-6%";

    const style: React.CSSProperties =
        phase === "exit"
            ? { opacity: 0, transform: `translateX(${exitX})`, filter: "blur(4px)", pointerEvents: "none" }
            : phase === "enter"
            ? { opacity: 0, transform: `translateX(${enterX})`, filter: "blur(4px)", pointerEvents: "none" }
            : { opacity: 1, transform: "translateX(0)", filter: "blur(0px)" };

    return (
        <div
            key={displayPath}
            style={{
                ...style,
                transition: "opacity 0.26s cubic-bezier(0.4,0,0.2,1), transform 0.26s cubic-bezier(0.4,0,0.2,1), filter 0.26s ease",
                willChange: "opacity, transform, filter",
            }}
            className="w-full"
        >
            {children}
        </div>
    );
}
