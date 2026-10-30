"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

const GAP = 6;
const MARGIN = 8; // keep this far from the viewport edge
const MIN_ROOM = 240; // below this much space, a tall menu flips above instead of scrolling

/**
 * Places a popover against the button that opened it: just below it, lined up with its start
 * or end edge. A menu taller than the room below scrolls; it opens above only when there's
 * very little room below. Returns the ref to put on the
 * panel; positions are written straight to it (relative to `root`), which also keeps the
 * last spot while it animates closed.
 */
export function useAnchor<T extends HTMLElement>(
  open: boolean,
  root: RefObject<HTMLElement | null>,
  trigger: RefObject<HTMLElement | null>,
  align: "start" | "end",
) {
  const panel = useRef<T>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = root.current;
      const t = trigger.current;
      const p = panel.current;
      if (!r || !t || !p) return;
      // Layout sizes, unaffected by the panel's own open/close transform.
      p.style.maxHeight = "";
      const rr = r.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      const w = p.offsetWidth;
      const h = p.offsetHeight;
      const roomBelow = window.innerHeight - MARGIN - (tr.bottom + GAP);
      const roomAbove = tr.top - GAP - MARGIN;
      // Below if it fits, or if there's still a good amount of room (it scrolls); above only as a fallback.
      const below = h <= roomBelow || roomBelow >= Math.min(h, MIN_ROOM) || roomBelow >= roomAbove;
      const room = below ? roomBelow : roomAbove;
      if (h > room) p.style.maxHeight = `${room}px`;
      const height = Math.min(h, room);
      const top = below ? tr.bottom - rr.top + GAP : tr.top - rr.top - GAP - height;
      const left = align === "start" ? tr.left - rr.left : tr.right - rr.left - w;
      p.style.top = `${top}px`;
      p.style.left = `${left}px`;
      p.dataset.side = below ? "bottom" : "top";
      // grow out of the trigger
      const ox = align === "start" ? Math.min(tr.width / 2, w / 2) : w - Math.min(tr.width / 2, w / 2);
      p.style.transformOrigin = `${ox}px ${below ? "0" : "100%"}`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, root, trigger, align]);
  return panel;
}
