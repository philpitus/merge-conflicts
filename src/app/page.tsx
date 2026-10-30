"use client";

import { useEffect, useState } from "react";
import { MergeConflicts } from "@/components/merge-conflicts";
import styles from "./page.module.css";

/**
 * A full-screen stage for the component. The toolbar stays hidden until the pointer nears the
 * bottom edge, so recordings show only the component.
 * Shortcuts: R replays the intro, D toggles the auto demo, T switches light and dark.
 */
export default function Stage() {
  const [run, setRun] = useState(0);
  const [demo, setDemo] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [toolbar, setToolbar] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Leave letters alone while someone types into the component, except during the demo, when nobody is.
      const t = e.target as HTMLElement;
      const typing = t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
      if (typing && !demo) return;
      const key = e.key.toLowerCase();
      if (key === "r") setRun((n) => n + 1);
      else if (key === "d") setDemo((d) => !d);
      else if (key === "t") setTheme((m) => (m === "light" ? "dark" : "light"));
      else return;
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => setToolbar(window.innerHeight - e.clientY < 110);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onMove);
    };
  }, [demo]);

  return (
    <main className={styles.stage} data-theme={theme}>
      <MergeConflicts key={run} demo={demo} theme={theme} />

      <nav aria-label="Stage controls" className={styles.toolbar} data-shown={toolbar || undefined}>
        <button type="button" className={styles.button} onClick={() => setRun((n) => n + 1)}>
          Replay <kbd>R</kbd>
        </button>
        <button type="button" className={styles.button} aria-pressed={demo} onClick={() => setDemo((d) => !d)}>
          Auto demo <kbd>D</kbd>
        </button>
        <button
          type="button"
          className={styles.button}
          aria-pressed={theme === "dark"}
          onClick={() => setTheme((m) => (m === "light" ? "dark" : "light"))}
        >
          Dark <kbd>T</kbd>
        </button>
      </nav>
    </main>
  );
}
