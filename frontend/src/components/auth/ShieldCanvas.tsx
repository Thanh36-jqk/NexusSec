"use client";

import { useEffect, useRef } from "react";

// ── 3D Particle Shield Canvas ────────────────────────────────

interface Particle {
    x: number;
    y: number;
    z: number;
    baseX: number;
    baseY: number;
    baseZ: number;
    vx: number;
    vy: number;
    vz: number;
    size: number;
    opacity: number;
    color: string;
    isShield: boolean;
}

function generateShieldPoints(count: number, cx: number, cy: number, scale: number): Array<[number, number, number]> {
    const pts: Array<[number, number, number]> = [];

    // Shield outline path (normalized -1 to 1)
    const shieldPath = [
        [0, -1.0], [0.55, -0.85], [0.85, -0.5], [0.85, 0.1],
        [0.5, 0.6], [0, 1.0], [-0.5, 0.6], [-0.85, 0.1],
        [-0.85, -0.5], [-0.55, -0.85],
    ];

    // Fill interior points
    const gridSize = Math.sqrt(count);
    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const nx = (i / gridSize) * 2 - 1;
            const ny = (j / gridSize) * 2 - 1;
            // Rough inside-shield check
            const r = Math.sqrt(nx * nx + ny * ny);
            const angle = Math.atan2(nx, -ny) / Math.PI; // 0..1
            const maxR = ny > 0.6 ? (1 - ny) * 1.1 : (0.85 - Math.abs(nx) * 0.05);
            if (r < maxR && ny < 0.95) {
                const depth = (1 - r) * 0.6;
                const jitter = (Math.random() - 0.5) * 0.04;
                pts.push([
                    cx + nx * scale + jitter * scale,
                    cy + ny * scale + jitter * scale,
                    depth * 80 + Math.random() * 20,
                ]);
            }
        }
    }

    // Outline ring
    for (let t = 0; t < Math.PI * 2; t += 0.07) {
        // Compute a shield-like radius for this angle
        const cosT = Math.cos(t), sinT = Math.sin(t);
        const a = Math.atan2(sinT, cosT);
        const ang = a / Math.PI;
        const rout = Math.abs(cosT) < 0.3 ? 0.88 : 0.85 - Math.abs(cosT) * 0.06;
        const nx = cosT * rout, ny = sinT * rout;
        if (ny > 0.92) continue; // trim shield bottom point
        pts.push([
            cx + nx * scale,
            cy + ny * scale,
            (Math.random() - 0.5) * 20,
        ]);
    }

    return pts;
}

const COLORS = ["#6ee7f7", "#7dd3fc", "#a5b4fc", "#c4b5fd", "#f0f9ff", "#ffffff"];

export default function ShieldParticleCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animId: number;
        let W = 0, H = 0;
        let particles: Particle[] = [];
        let mouseX = 0, mouseY = 0;
        let rotX = 0, rotY = 0;
        let targetRotX = 0, targetRotY = 0;

        function resize() {
            W = canvas!.offsetWidth;
            H = canvas!.offsetHeight;
            canvas!.width = W * window.devicePixelRatio;
            canvas!.height = H * window.devicePixelRatio;
            ctx!.scale(window.devicePixelRatio, window.devicePixelRatio);
            buildParticles();
        }

        function buildParticles() {
            particles = [];
            const cx = W / 2, cy = H / 2;
            const scale = Math.min(W, H) * 0.35;
            const shieldPts = generateShieldPoints(480, cx, cy, scale);

            // Shield particles
            for (const [x, y, z] of shieldPts) {
                const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                particles.push({
                    x, y, z,
                    baseX: x, baseY: y, baseZ: z,
                    vx: 0, vy: 0, vz: 0,
                    size: Math.random() * 1.6 + 0.5,
                    opacity: Math.random() * 0.5 + 0.5,
                    color,
                    isShield: true,
                });
            }

            // Ambient floating particles (background depth)
            for (let i = 0; i < 120; i++) {
                const x = Math.random() * W;
                const y = Math.random() * H;
                const z = Math.random() * 200 - 100;
                particles.push({
                    x, y, z,
                    baseX: x, baseY: y, baseZ: z,
                    vx: (Math.random() - 0.5) * 0.15,
                    vy: (Math.random() - 0.5) * 0.15,
                    vz: 0,
                    size: Math.random() * 1.2 + 0.2,
                    opacity: Math.random() * 0.3 + 0.05,
                    color: "#ffffff",
                    isShield: false,
                });
            }
        }

        function project(x: number, y: number, z: number, cx: number, cy: number) {
            const focalLength = 400;
            const scale = focalLength / (focalLength + z);
            return {
                sx: cx + (x - cx) * scale,
                sy: cy + (y - cy) * scale,
                scale,
            };
        }

        function rotatePoint(x: number, y: number, z: number, cx: number, cy: number, rx: number, ry: number) {
            // Rotate around Y axis
            const dx = x - cx, dz = z;
            const cosY = Math.cos(ry), sinY = Math.sin(ry);
            const nx = dx * cosY + dz * sinY;
            const nz = -dx * sinY + dz * cosY;

            // Rotate around X axis
            const dy = y - cy;
            const cosX = Math.cos(rx), sinX = Math.sin(rx);
            const ny = dy * cosX - nz * sinX;
            const nz2 = dy * sinX + nz * cosX;

            return { x: cx + nx, y: cy + ny, z: nz2 };
        }

        let t = 0;
        function animate() {
            animId = requestAnimationFrame(animate);
            ctx!.clearRect(0, 0, W, H);

            t += 0.005;
            // Smooth rotation toward mouse
            targetRotY = (mouseX / W - 0.5) * 0.5;
            targetRotX = (mouseY / H - 0.5) * 0.35;
            rotX += (targetRotX - rotX) * 0.04;
            rotY += (targetRotY - rotY) * 0.04;

            // Add slow auto-rotate
            const autoRY = rotY + Math.sin(t * 0.3) * 0.08;

            const cx = W / 2, cy = H / 2;

            // Sort by z for depth ordering
            const sorted = particles
                .map(p => {
                    let bx = p.baseX, by = p.baseY, bz = p.baseZ;
                    if (!p.isShield) {
                        // Ambient particles drift
                        bx = p.baseX + Math.sin(t * 0.5 + p.baseY) * 8;
                        by = p.baseY + Math.cos(t * 0.4 + p.baseX) * 5;
                    }
                    const r = rotatePoint(bx, by, bz, cx, cy, rotX, autoRY);
                    const proj = project(r.x, r.y, r.z, cx, cy);
                    return { p, ...proj, rz: r.z };
                })
                .sort((a, b) => a.rz - b.rz);

            for (const { p, sx, sy, scale, rz } of sorted) {
                const depth = Math.min(1, Math.max(0, (rz + 200) / 400));
                const sz = p.size * scale;
                const alpha = p.opacity * (0.4 + depth * 0.6);

                // Pulsing glow for shield points
                if (p.isShield) {
                    const pulse = 0.6 + Math.sin(t * 2 + p.baseX * 0.05 + p.baseY * 0.05) * 0.4;
                    const glowR = sz * 3 * pulse;
                    const g = ctx!.createRadialGradient(sx, sy, 0, sx, sy, glowR);
                    g.addColorStop(0, `${p.color}${Math.floor(alpha * 140).toString(16).padStart(2, "0")}`);
                    g.addColorStop(1, "transparent");
                    ctx!.fillStyle = g;
                    ctx!.beginPath();
                    ctx!.arc(sx, sy, glowR, 0, Math.PI * 2);
                    ctx!.fill();
                }

                // Core dot
                ctx!.beginPath();
                ctx!.arc(sx, sy, Math.max(0.3, sz), 0, Math.PI * 2);
                const hex = Math.floor(alpha * 255).toString(16).padStart(2, "0");
                ctx!.fillStyle = `${p.color}${hex}`;
                ctx!.fill();
            }
        }

        function onMouseMove(e: MouseEvent) {
            const rect = canvas!.getBoundingClientRect();
            mouseX = e.clientX - rect.left;
            mouseY = e.clientY - rect.top;
        }
        function onTouchMove(e: TouchEvent) {
            const rect = canvas!.getBoundingClientRect();
            mouseX = e.touches[0].clientX - rect.left;
            mouseY = e.touches[0].clientY - rect.top;
        }

        resize();
        window.addEventListener("resize", resize);
        canvas.addEventListener("mousemove", onMouseMove);
        canvas.addEventListener("touchmove", onTouchMove, { passive: true });
        animate();

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener("resize", resize);
            canvas.removeEventListener("mousemove", onMouseMove);
            canvas.removeEventListener("touchmove", onTouchMove);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ display: "block" }}
        />
    );
}
