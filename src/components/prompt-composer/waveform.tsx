"use client";

import { useEffect, useRef } from "react";
import { useMicLevel } from "./use-dictation";
import styles from "./prompt-composer.module.css";

const BAR = 2; // px wide
const STEP = 4; // px from one bar to the next
const EVERY_MS = 55; // a new bar this often, so the line scrolls at a steady pace
const MIN_H = 2; // silence: a dotted line

/**
 * Your voice level over the last few seconds, scrolling right to left across the toolbar while
 * dictating: newest bar at the right edge, silence as a row of dots. Drawn on a canvas each frame.
 */
export function Waveform({ on }: { on: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({ levels: [] as number[], last: 0, peak: 0 });

  // Draws the line: the bars heard so far at the right, silence (dots) across the rest.
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = state.current;
    const now = performance.now();
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const count = Math.floor(w / STEP);
    if (s.levels.length > count + 1) s.levels.splice(0, s.levels.length - count - 1);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // the newest bar slides in from the right between samples, so the line moves smoothly
    const slide = s.last ? Math.min(1, (now - s.last) / EVERY_MS) * STEP : 0;
    const color = getComputedStyle(canvas).color;
    // the line spans the whole toolbar from the start: positions with no sound yet are silence
    const padded = [...Array(Math.max(0, count + 1 - s.levels.length)).fill(0), ...s.levels];
    padded.forEach((lv, i) => {
      const x = w - (padded.length - i) * STEP - BAR + STEP - slide;
      if (x < 0) return;
      const bh = Math.max(MIN_H, lv * (h - 4));
      ctx.globalAlpha = lv > 0.04 ? 1 : 0.55;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, (h - bh) / 2, BAR, bh, BAR / 2);
      ctx.fill();
    });
    // fade the oldest bars out at the left edge
    ctx.globalCompositeOperation = "destination-out";
    const fade = ctx.createLinearGradient(0, 0, 32, 0);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 32, h);
    ctx.globalCompositeOperation = "source-over";
  };

  // the dotted line shows straight away, before the microphone's first sound arrives
  useEffect(() => {
    const id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  });

  useMicLevel(on, (level) => {
    const s = state.current;
    const now = performance.now();
    s.peak = Math.max(s.peak, level);
    if (now - s.last >= EVERY_MS) {
      s.levels.push(s.peak);
      s.peak = 0;
      s.last = now;
    }
    draw();
  });

  return <canvas ref={canvasRef} className={styles.wave} aria-hidden="true" />;
}
