"use client";

import { useEffect, type RefObject } from "react";

/**
 * Closes a popover on a click outside it (and outside its trigger), or when focus moves
 * somewhere else. Both refs count as "inside".
 */
export function useDismiss(
  open: boolean,
  panel: RefObject<HTMLElement | null>,
  trigger: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const inside = (node: Node | null) => !!node && (!!panel.current?.contains(node) || !!trigger.current?.contains(node));
    const onPointerDown = (e: Event) => {
      if (!inside(e.target as Node)) onClose();
    };
    const onFocusOut = (e: FocusEvent) => {
      const to = e.relatedTarget as Node | null;
      if (to && !inside(to)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [open, panel, trigger, onClose]);
}
