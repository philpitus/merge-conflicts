"use client";

import { forwardRef, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import styles from "./prompt-composer.module.css";

// Discrete steps, as in Claude Code's /effort slider (Codex and Cursor offer the same scale under other names).
export const EFFORT_LEVELS = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Extra high" },
  { id: "max", label: "Max" },
] as const;

/** Where effort starts. */
export const DEFAULT_EFFORT = 1;
export const MAX_EFFORT = EFFORT_LEVELS.length - 1;

// Label widths at 12px / 460, used until the real ones are measured.
const LABEL_FALLBACK = [23, 45, 27, 55, 25];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Keys that move along the scale; returns the new level or null. */
export function stepFor(key: string, level: number): number | null {
  if (key === "ArrowRight" || key === "ArrowUp") return Math.min(MAX_EFFORT, level + 1);
  if (key === "ArrowLeft" || key === "ArrowDown") return Math.max(0, level - 1);
  if (key === "Home") return 0;
  if (key === "End") return MAX_EFFORT;
  return null;
}

/**
 * Measures the five level names once the font is ready, rounded up as Figma sizes text.
 * Render `measurer` anywhere in the component.
 */
export function useEffortLabelWidths() {
  const ref = useRef<HTMLSpanElement>(null);
  const [widths, setWidths] = useState<number[]>(LABEL_FALLBACK);
  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      const el = ref.current;
      if (cancelled || !el) return;
      setWidths([...el.children].map((c) => Math.ceil(parseFloat(getComputedStyle(c).width))));
    });
    return () => void (cancelled = true);
  }, []);
  const measurer = (
    <span ref={ref} className={styles.measure} aria-hidden="true">
      {EFFORT_LEVELS.map((l) => (
        <span key={l.id} className={styles.chipLabel}>
          {l.label}
        </span>
      ))}
    </span>
  );
  return [widths, measurer] as const;
}

/** Five bars filled up to the level; at Max they bounce like an equaliser. */
function Bars({ level }: { level: number }) {
  return (
    <span className={styles.bars} data-max={level === MAX_EFFORT} aria-hidden="true">
      {EFFORT_LEVELS.map((l, i) => (
        <i
          key={l.id}
          data-on={i <= level}
          style={{ height: 4 + i * 2, transitionDelay: `${i * 25}ms`, animationDelay: `${-i * 90}ms` }}
        />
      ))}
    </span>
  );
}

type ChipProps = {
  level: number;
  open: boolean;
  widths: number[];
  onToggle: () => void;
  onLevel: (level: number) => void;
};

/** The toolbar control. ← → change the level without opening the slider. */
export const EffortChip = forwardRef<HTMLButtonElement, ChipProps>(function EffortChip(
  { level, open, widths, onToggle, onLevel },
  ref,
) {
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const next = stepFor(e.key, level);
    if (next === null) return;
    e.preventDefault();
    onLevel(next);
  };
  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.btn} ${styles.effortChip}`}
      data-max={level === MAX_EFFORT}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`Effort: ${EFFORT_LEVELS[level].label}`}
      onClick={onToggle}
      onKeyDown={onKeyDown}
    >
      <Bars level={level} />
      <span className={styles.labelWrap} style={{ width: widths[level] }}>
        <span key={level} className={`${styles.chipLabel} ${styles.swapLabel}`}>
          {EFFORT_LEVELS[level].label}
        </span>
      </span>
    </button>
  );
});

type PanelProps = {
  level: number;
  open: boolean;
  onLevel: (level: number) => void;
  onClose: (returnFocus: boolean) => void;
};

// The thumb is a 26px pill inside a 2px-padded track, so step positions (the thumb's centre)
// run between 15px in from either end.
const INSET = 15;
const stepAt = (t: number) => `calc(${INSET}px + (100% - ${INSET * 2}px) * ${t})`;

/**
 * After Claude's effort slider, made of the composer's own parts: "Effort  High" with a help tip,
 * Faster … Smarter, and the Local / Remote switch as a track — grey pill, white thumb — that fills
 * up to the thumb, with a dot per step. Drag or click anywhere; it snaps to the nearest step.
 */
export const EffortPanel = forwardRef<HTMLDivElement, PanelProps>(function EffortPanel(
  { level, open, onLevel, onClose },
  ref,
) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null); // 0–1 while dragging
  const p = drag ?? level / MAX_EFFORT;
  const current = EFFORT_LEVELS[level];
  const max = level === MAX_EFFORT;

  const follow = (e: PointerEvent<HTMLElement>) => {
    const r = trackRef.current!.getBoundingClientRect();
    const next = clamp((e.clientX - r.left - INSET) / (r.width - INSET * 2), 0, 1);
    setDrag(next);
    onLevel(Math.round(next * MAX_EFFORT));
  };

  return (
    <div
      ref={ref}
      className={`${styles.popover} ${styles.anchored} ${styles.effortPop}`}
      data-open={open}
      role="dialog"
      aria-label="Effort"
      onKeyDown={(e) => {
        if (e.key === "Escape" || (e.key === "Enter" && e.target === trackRef.current)) {
          e.preventDefault();
          onClose(true);
        }
      }}
    >
      <div className={styles.effHead}>
        <span className={styles.effTitle}>Effort</span>
        <span key={level} className={`${styles.effLevel} ${styles.swapLabel}`} data-max={max}>
          {current.label}
        </span>
        <button
          type="button"
          className={styles.effHelp}
          tabIndex={open ? 0 : -1}
          aria-label="What is effort?"
          aria-describedby="effort-tip"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth="1.2" />
            <path
              d="M5.6 5.6A1.45 1.45 0 0 1 8.4 6.05C8.4 7 7 7.2 7 8.1"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <circle cx="7" cy="9.9" r="0.7" fill="currentColor" />
          </svg>
        </button>
        <span id="effort-tip" role="tooltip" className={styles.effTip}>
          How long the model thinks before it answers. More effort is slower, but better on hard problems.
        </span>
      </div>

      <div className={styles.effEnds} aria-hidden="true">
        <span>Faster</span>
        <span>Smarter</span>
      </div>

      <div
        ref={trackRef}
        className={styles.effTrack}
        role="slider"
        tabIndex={open ? 0 : -1}
        aria-label="Effort"
        aria-valuemin={0}
        aria-valuemax={MAX_EFFORT}
        aria-valuenow={level}
        aria-valuetext={current.label}
        data-max={max}
        data-dragging={drag !== null}
        style={{ "--p": p } as CSSProperties}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          follow(e);
        }}
        onPointerMove={(e) => drag !== null && follow(e)}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={(e) => {
          const next = stepFor(e.key, level);
          if (next === null) return;
          e.preventDefault();
          onLevel(next);
        }}
      >
        <span className={styles.effFill} />
        {EFFORT_LEVELS.map((l, i) => (
          <span
            key={l.id}
            className={styles.effDot}
            data-on={i <= level}
            style={{ left: stepAt(i / MAX_EFFORT) }}
          />
        ))}
        <span className={styles.effThumb} data-handle />
      </div>
    </div>
  );
});
