"use client";

import { useCallback, useEffect, useRef } from "react";

// The composer's blues, plus a touch of indigo for the Max state.
const COLORS = ["#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#818cf8", "#a5b4fc"];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
  kind: "dot" | "streak" | "star";
  spin: number;
  angle: number;
};
type Ring = { x: number; y: number; age: number; life: number; radius: number; width: number; color: string; delay: number };
type Flash = { x: number; y: number; age: number; life: number };

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // four-point sparkle with concave sides
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.quadraticCurveTo(0, 0, 0, r);
  ctx.quadraticCurveTo(0, 0, -r, 0);
  ctx.quadraticCurveTo(0, 0, 0, -r);
  ctx.fill();
  ctx.restore();
}

/**
 * Particles, sparks and shockwave rings for choosing Max effort. The canvas is
 * sized by CSS; `burst(x, y)` takes a point relative to the canvas's top-left,
 * minus `inset` (so callers can pass coordinates of the element the canvas surrounds).
 */
export function useBurst(inset: number) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({ particles: [] as Particle[], rings: [] as Ring[], flashes: [] as Flash[], raf: 0 });

  useEffect(() => {
    const s = state.current;
    return () => cancelAnimationFrame(s.raf);
  }, []);

  const burst = useCallback(
    (ox: number, oy: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const s = state.current;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const x = ox + inset;
      const y = oy + inset;

      for (let i = 0; i < 64; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 1.6 + Math.pow(Math.random(), 0.6) * 6.4;
        const r = Math.random();
        s.particles.push({
          x,
          y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed - 1.6, // bias upward, away from the card
          age: 0,
          life: 42 + Math.random() * 48,
          size: 1.2 + Math.random() * 2.4,
          color: COLORS[(Math.random() * COLORS.length) | 0],
          kind: r < 0.55 ? "dot" : r < 0.85 ? "streak" : "star",
          spin: (Math.random() - 0.5) * 0.3,
          angle: Math.random() * Math.PI,
        });
      }
      s.rings.push(
        { x, y, age: 0, life: 34, radius: 120, width: 2.5, color: "#3b82f6", delay: 0 },
        { x, y, age: 0, life: 42, radius: 80, width: 1.5, color: "#a5b4fc", delay: 5 },
        { x, y, age: 0, life: 50, radius: 170, width: 1, color: "#93c5fd", delay: 10 },
      );
      s.flashes.push({ x, y, age: 0, life: 16 });

      if (s.raf) return;
      const frame = () => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        for (const f of s.flashes) {
          const k = f.age / f.life;
          const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 70);
          g.addColorStop(0, `rgba(147, 197, 253, ${0.55 * (1 - k)})`);
          g.addColorStop(1, "rgba(147, 197, 253, 0)");
          ctx.fillStyle = g;
          ctx.fillRect(f.x - 70, f.y - 70, 140, 140);
          f.age++;
        }

        for (const ring of s.rings) {
          ring.age++;
          if (ring.age < ring.delay) continue;
          const k = Math.min(1, (ring.age - ring.delay) / ring.life);
          ctx.globalAlpha = (1 - k) * 0.85;
          ctx.strokeStyle = ring.color;
          ctx.lineWidth = ring.width * (1 - k) + 0.4;
          ctx.beginPath();
          ctx.arc(ring.x, ring.y, ring.radius * easeOut(k), 0, Math.PI * 2);
          ctx.stroke();
        }

        for (const p of s.particles) {
          p.vx *= 0.955;
          p.vy = p.vy * 0.955 + 0.085;
          p.x += p.vx;
          p.y += p.vy;
          p.angle += p.spin;
          p.age++;
          const k = p.age / p.life;
          ctx.globalAlpha = Math.max(0, 1 - Math.pow(k, 1.6));
          ctx.fillStyle = p.color;
          ctx.strokeStyle = p.color;
          if (p.kind === "dot") {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, Math.PI * 2);
            ctx.fill();
          } else if (p.kind === "streak") {
            ctx.lineCap = "round";
            ctx.lineWidth = p.size * 0.75;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 3.2, p.y - p.vy * 3.2);
            ctx.stroke();
          } else {
            star(ctx, p.x, p.y, p.size * 2.2 * (1 - k * 0.4), p.angle);
          }
        }
        ctx.globalAlpha = 1;

        s.particles = s.particles.filter((p) => p.age < p.life);
        s.rings = s.rings.filter((r) => r.age < r.life + r.delay);
        s.flashes = s.flashes.filter((f) => f.age < f.life);
        if (s.particles.length || s.rings.length || s.flashes.length) {
          s.raf = requestAnimationFrame(frame);
        } else {
          ctx.clearRect(0, 0, w, h);
          s.raf = 0;
        }
      };
      s.raf = requestAnimationFrame(frame);
    },
    [inset],
  );

  return { canvasRef, burst };
}
