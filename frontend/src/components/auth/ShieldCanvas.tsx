"use client";

import { useEffect, useRef } from "react";

// ── 3D Particle Globe Canvas ────────────────────────────────

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
    isGlobe: boolean;
}

function generateGlobePoints(count: number, cx: number, cy: number, radius: number): Array<[number, number, number]> {
    const pts: Array<[number, number, number]> = [];
    const goldenRatio = (1 + Math.sqrt(5)) / 2;

    for (let i = 0; i < count; i++) {
        // Fibonacci sphere
        const t = i / count;
        const phi = Math.acos(1 - 2 * t);
        const theta = 2 * Math.PI * i / goldenRatio;

        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.cos(phi);
        const z = Math.sin(phi) * Math.sin(theta);

        pts.push([
            cx + x * radius,
            cy + y * radius,
            z * radius,
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
        
        let rotX = 0, rotY = 0;
        let targetRotX = 0, targetRotY = 0;
        let isDragging = false;
        let lastMouseX = 0;
        let lastMouseY = 0;
        
        let zoom = 1;
        let targetZoom = 1;

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
            const radius = Math.min(W, H) * 0.35;
            const globePts = generateGlobePoints(800, cx, cy, radius);

            // Globe particles
            for (const [x, y, z] of globePts) {
                const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                particles.push({
                    x, y, z,
                    baseX: x, baseY: y, baseZ: z,
                    vx: 0, vy: 0, vz: 0,
                    size: Math.random() * 1.5 + 0.8,
                    opacity: Math.random() * 0.6 + 0.4,
                    color,
                    isGlobe: true,
                });
            }

            // Ambient floating particles (background depth)
            for (let i = 0; i < 150; i++) {
                const x = Math.random() * W;
                const y = Math.random() * H;
                const z = Math.random() * 400 - 200;
                particles.push({
                    x, y, z,
                    baseX: x, baseY: y, baseZ: z,
                    vx: (Math.random() - 0.5) * 0.2,
                    vy: (Math.random() - 0.5) * 0.2,
                    vz: 0,
                    size: Math.random() * 1.2 + 0.2,
                    opacity: Math.random() * 0.3 + 0.05,
                    color: "#ffffff",
                    isGlobe: false,
                });
            }
        }

        function project(x: number, y: number, z: number, cx: number, cy: number, currentZoom: number) {
            const focalLength = 400;
            const scale = focalLength / (focalLength + z) * currentZoom;
            return {
                sx: cx + (x - cx) * scale,
                sy: cy + (y - cy) * scale,
                scale,
            };
        }

        function rotatePoint(x: number, y: number, z: number, cx: number, cy: number, rx: number, ry: number) {
            // Translate to origin
            const dx = x - cx;
            const dy = y - cy;
            const dz = z;

            // Rotate around X axis
            const cosX = Math.cos(rx), sinX = Math.sin(rx);
            const ny = dy * cosX - dz * sinX;
            const nz = dy * sinX + dz * cosX;

            // Rotate around Y axis
            const cosY = Math.cos(ry), sinY = Math.sin(ry);
            const nx = dx * cosY + nz * sinY;
            const nz2 = -dx * sinY + nz * cosY;

            return { x: cx + nx, y: cy + ny, z: nz2 };
        }

        let t = 0;
        function animate() {
            animId = requestAnimationFrame(animate);
            ctx!.clearRect(0, 0, W, H);

            t += 0.005;
            
            // Smooth zoom interpolation
            zoom += (targetZoom - zoom) * 0.1;

            if (!isDragging) {
                // Auto rotate when not dragging
                targetRotY -= 0.002;
                targetRotX += (Math.sin(t) * 0.1 - targetRotX) * 0.02; 
            }

            // Smooth rotation interpolation
            rotX += (targetRotX - rotX) * 0.1;
            rotY += (targetRotY - rotY) * 0.1;

            const cx = W / 2, cy = H / 2;

            // Sort by z for depth ordering
            const sorted = particles
                .map(p => {
                    let bx = p.baseX, by = p.baseY, bz = p.baseZ;
                    if (!p.isGlobe) {
                        // Ambient particles drift
                        bx = p.baseX + Math.sin(t * 0.5 + p.baseY) * 8;
                        by = p.baseY + Math.cos(t * 0.4 + p.baseX) * 5;
                        bz = p.baseZ;
                        
                        // Only rotate ambient particles slightly for parallax effect
                        const r = rotatePoint(bx, by, bz, cx, cy, rotX * 0.2, rotY * 0.2);
                        const proj = project(r.x, r.y, r.z, cx, cy, 1); // Background doesn't zoom as much
                        return { p, ...proj, rz: r.z };
                    }
                    
                    // Globe particles rotate fully
                    const r = rotatePoint(bx, by, bz, cx, cy, rotX, rotY);
                    const proj = project(r.x, r.y, r.z, cx, cy, zoom);
                    return { p, ...proj, rz: r.z };
                })
                .sort((a, b) => a.rz - b.rz);

            for (const { p, sx, sy, scale, rz } of sorted) {
                const depth = Math.min(1, Math.max(0, (rz + 200) / 400));
                
                // Hide particles that are too close into the screen to prevent massive clipping
                if (scale < 0) continue; 
                
                const sz = p.size * scale;
                let alpha = p.opacity;
                
                if (p.isGlobe) {
                    // Back side of the globe fades out
                    if (rz > 0) {
                        alpha *= Math.max(0.1, 1 - (rz / 150));
                    }
                } else {
                    alpha *= (0.4 + depth * 0.6);
                }

                if (alpha <= 0.01) continue;

                // Pulsing glow for globe points on the front side
                if (p.isGlobe && rz < 0) {
                    const pulse = 0.6 + Math.sin(t * 3 + p.baseX * 0.05 + p.baseY * 0.05) * 0.4;
                    const glowR = sz * 2.5 * pulse;
                    const g = ctx!.createRadialGradient(sx, sy, 0, sx, sy, glowR);
                    g.addColorStop(0, `${p.color}${Math.floor(alpha * 120).toString(16).padStart(2, "0")}`);
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

        function onMouseDown(e: MouseEvent) {
            isDragging = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            if (canvas) canvas.style.cursor = "grabbing";
        }
        
        function onMouseMove(e: MouseEvent) {
            if (!isDragging) return;
            
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            
            targetRotY -= dx * 0.01;
            targetRotX -= dy * 0.01; 
            
            targetRotX = Math.max(-Math.PI/2, Math.min(Math.PI/2, targetRotX));
            
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        }
        
        function onMouseUp() {
            isDragging = false;
            if (canvas) canvas.style.cursor = "grab";
        }

        function onWheel(e: WheelEvent) {
            e.preventDefault();
            // Zoom bounds: 0.5 (zoom out) to 2.5 (zoom in)
            targetZoom -= e.deltaY * 0.001;
            targetZoom = Math.max(0.6, Math.min(2.5, targetZoom));
        }

        function onTouchStart(e: TouchEvent) {
            isDragging = true;
            lastMouseX = e.touches[0].clientX;
            lastMouseY = e.touches[0].clientY;
        }

        function onTouchMove(e: TouchEvent) {
            if (!isDragging) return;
            const dx = e.touches[0].clientX - lastMouseX;
            const dy = e.touches[0].clientY - lastMouseY;
            
            targetRotY -= dx * 0.01;
            targetRotX -= dy * 0.01;
            targetRotX = Math.max(-Math.PI/2, Math.min(Math.PI/2, targetRotX));
            
            lastMouseX = e.touches[0].clientX;
            lastMouseY = e.touches[0].clientY;
        }

        resize();
        window.addEventListener("resize", resize);
        
        canvas.addEventListener("mousedown", onMouseDown);
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        // Passive false is needed to prevent default scrolling while zooming
        canvas.addEventListener("wheel", onWheel, { passive: false });
        
        canvas.addEventListener("touchstart", onTouchStart, { passive: true });
        window.addEventListener("touchmove", onTouchMove, { passive: true });
        window.addEventListener("touchend", onMouseUp);
        
        if (canvas) canvas.style.cursor = "grab";
        
        animate();

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener("resize", resize);
            
            canvas.removeEventListener("mousedown", onMouseDown);
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            canvas.removeEventListener("wheel", onWheel);
            
            canvas.removeEventListener("touchstart", onTouchStart);
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("touchend", onMouseUp);
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
