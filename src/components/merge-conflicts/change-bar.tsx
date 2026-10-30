"use client";

import { useCallback, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { ChipIcon } from "@/components/thinking-state";
import { useDismiss } from "@/components/prompt-composer/use-dismiss";
import styles from "./merge-conflicts.module.css";
import { ADDED, BRANCH, DELETED, FILES, PR_NUMBER } from "./data";
import { ChevronDown, MergeIcon, Spinner } from "./icons";
import type { Phase } from "./pr-card";

// GitHub's diffstat: four squares split between additions and deletions (at least one red if anything
// was deleted), and a grey fifth
const RED_BLOCKS = DELETED ? Math.max(1, Math.round((4 * DELETED) / (ADDED + DELETED))) : 0;
const BLOCKS = Array.from({ length: 5 }, (_, i) => (i === 4 ? "none" : i < 4 - RED_BLOCKS ? "add" : "del"));

type Face = { tone: "plain" | "amber" | "green" | "violet"; icon?: ReactNode; label: string; note?: string };

function faceFor(phase: Phase, left: number): Face {
  const dot = <span className={styles.statusDot} />;
  const spin = <Spinner className={styles.spinner} />;
  const pr = `#${PR_NUMBER}`;
  switch (phase) {
    case "idle":
      return { tone: "plain", label: "Create PR" };
    case "creating":
      return { tone: "plain", icon: spin, label: "Creating PR" };
    case "conflict":
      return { tone: "amber", icon: dot, label: pr, note: `${left} conflicts` };
    case "resolving":
      return { tone: "plain", icon: spin, label: pr, note: "Resolving" };
    case "ready":
      return { tone: "green", icon: dot, label: pr, note: "Ready to merge" };
    case "merging":
      return { tone: "plain", icon: spin, label: pr, note: "Merging" };
    case "merged":
      return { tone: "violet", icon: <MergeIcon />, label: pr, note: "Merged" };
  }
}

type Props = {
  phase: Phase;
  left: number;
  leftIn: Record<string, number>;
  open: boolean;
  onOpen: (open: boolean) => void;
  createRef: RefObject<HTMLButtonElement | null>;
  onCreate: () => void;
  onShowPr: () => void;
};

/**
 * Floats just above the composer, at its left: the next step for the branch, and what's changed on it. The changes
 * open into the list of files; Create PR becomes the PR's status once it's open.
 */
export function ChangeBar({ phase, left, leftIn, open, onOpen, createRef, onCreate, onShowPr }: Props) {
  const popId = useId();
  const changesRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLSpanElement>(null);
  const face = faceFor(phase, left);
  const inPr = phase !== "idle" && phase !== "creating";

  const close = useCallback(() => onOpen(false), [onOpen]);
  useDismiss(open, popRef, changesRef, close);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      onOpen(false);
      changesRef.current?.focus();
    }
  };

  // The PR button eases to the width of what it says (measured again once the font is in)
  useLayoutEffect(() => {
    const btn = createRef.current;
    const el = faceRef.current;
    if (!btn || !el) return;
    const fit = () => (btn.style.width = `${el.offsetWidth}px`);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [createRef]);

  return (
    <div className={styles.bar} onKeyDown={onKeyDown}>
      <div
        ref={popRef}
        id={popId}
        className={styles.filesPop}
        data-open={open}
        role="region"
        aria-label="Changed files"
        aria-hidden={!open}
      >
        <p className={styles.popHead}>
          <span>{inPr ? `In #${PR_NUMBER} from` : "Changes on"}</span>
          <code className={styles.branch}>{BRANCH}</code>
        </p>
        <ul className={styles.fileList}>
          {FILES.map((f) => {
            const n = leftIn[f.name] ?? 0;
            return (
              // hover or focus a file for a peek at what changed in it
              <li key={f.name} className={styles.fileRow} tabIndex={open ? 0 : -1} aria-describedby={`${popId}-${f.name}`}>
                <ChipIcon icon="ts" />
                <span className={styles.fileName}>{f.name}</span>
                <span className={styles.fileMeta}>
                  <span className={styles.fileDir}>{f.dir}</span>
                  {f.isNew && <span className={styles.tag}>New</span>}
                  {n > 0 && (
                    <span className={styles.tag} data-tone="amber">
                      {n} {n === 1 ? "conflict" : "conflicts"}
                    </span>
                  )}
                </span>
                <span className={styles.fileStat}>
                  <span className={styles.add}>+{f.add}</span>
                  {f.del > 0 && <span className={styles.del}>−{f.del}</span>}
                </span>
                <span id={`${popId}-${f.name}`} className={styles.peek} role="tooltip">
                  <span className={styles.peekHead}>
                    {f.dir}
                    {f.name}
                  </span>
                  {f.diff.map(([kind, line], j) => (
                    <span key={j} className={styles.peekLine} data-kind={kind}>
                      <b aria-hidden="true">{kind}</b>
                      <code>{line}</code>
                    </span>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <button
        ref={createRef}
        type="button"
        className={`${styles.pill} ${styles.prBtn}`}
        data-tone={face.tone}
        aria-busy={phase === "creating" || phase === "resolving" || phase === "merging"}
        aria-label={phase === "idle" ? "Create PR" : `Pull request #${PR_NUMBER}: ${face.note ?? "creating"}. Show it`}
        onClick={phase === "idle" ? onCreate : phase === "creating" ? undefined : onShowPr}
      >
        <span ref={faceRef} className={styles.prFace}>
          {/* keyed by what it says, so each change swaps in */}
          <span key={`${face.label}${face.note ?? ""}`} className={styles.prFaceIn}>
            {face.icon}
            <span>{face.label}</span>
            {face.note && <span className={styles.prNote}>{face.note}</span>}
          </span>
        </span>
      </button>
      <div className={styles.changesWrap} data-gone={phase === "merged"}>
        <button
          ref={changesRef}
          type="button"
          className={`${styles.pill} ${styles.changes}`}
          aria-expanded={open}
          aria-controls={popId}
          aria-label={`${FILES.length} files changed: ${ADDED} additions, ${DELETED} deletions`}
          tabIndex={phase === "merged" ? -1 : 0}
          onClick={() => onOpen(!open)}
        >
          <span className={styles.stat}>
            <span className={styles.add}>+{ADDED}</span>
            <span className={styles.del}>−{DELETED}</span>
          </span>
          <span className={styles.blocks} aria-hidden="true">
            {BLOCKS.map((kind, i) => (
              <i key={i} data-kind={kind} />
            ))}
          </span>
          <ChevronDown className={styles.chev} />
        </button>
      </div>

    </div>
  );
}
