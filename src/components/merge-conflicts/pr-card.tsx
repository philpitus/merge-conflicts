"use client";

import { useId, type CSSProperties, type RefObject } from "react";
import styles from "./merge-conflicts.module.css";
import { BASE, CHECKS, CONFLICTS, PR_NUMBER, PR_TITLE } from "./data";
import { ConflictTip } from "./conflict-tip";
import { GraphLog } from "./graph-log";
import type { Cursor, GraphState, Phase } from "./graph-shared";
import { GitHubMark, MergeIcon, Spinner, Tick, Warn } from "./icons";

export type { GraphState, Phase } from "./graph-shared";

type CardProps = {
  phase: Phase;
  g: GraphState;
  /** The step in progress, while there is one */
  live: { key: string; text: string } | null;
  cursor: Cursor;
  /** How many of the conflicts have been resolved */
  resolved: number;
  cardRef: RefObject<HTMLElement | null>;
  resolveRef: RefObject<HTMLButtonElement | null>;
  mergeRef: RefObject<HTMLButtonElement | null>;
  onResolve: () => void;
  onMerge: () => void;
};

/** The pull request: its title, the live history, and one line for where it stands with the one thing to do next. */
export function PrCard({ phase, g, live, cursor, resolved, cardRef, resolveRef, mergeRef, onResolve, onMerge }: CardProps) {
  const titleId = useId();
  const tipId = useId();
  const state = g.merged ? "merged" : g.numbered ? "open" : null;
  const busy = phase === "resolving" || phase === "merging";

  // what the status line says: the step while one runs, otherwise where things stand
  let status;
  if (live) {
    status = (
      <span key={live.key} className={`${styles.statusText} ${styles.swap}`}>
        <Spinner className={styles.spinner} />
        <span className={styles.shimmer}>{live.text}</span>
      </span>
    );
  } else if (phase === "conflict") {
    status = (
      <span key="conflict" className={`${styles.statusText} ${styles.swap}`} data-tone="amber">
        <Warn className={styles.statusIcon} />
        {/* hover (or focus) for each conflict, line by line */}
        <span className={styles.hoverable} tabIndex={0} aria-describedby={tipId}>
          <span className={styles.count}>{CONFLICTS} conflicts</span> with {BASE}
          <ConflictTip id={tipId} resolved={resolved} />
        </span>
      </span>
    );
  } else if (phase === "ready") {
    status = (
      <span key="ready" className={`${styles.statusText} ${styles.swap}`} data-tone="green">
        <Tick className={`${styles.statusIcon} ${styles.tickIn}`} />
        <span>Ready to merge</span>
      </span>
    );
  } else if (phase === "merged") {
    status = (
      <span key="merged" className={`${styles.statusText} ${styles.swap}`} data-tone="violet">
        <MergeIcon className={styles.statusIcon} />
        <span>Merged into {BASE}</span>
      </span>
    );
  }

  const button =
    phase === "conflict" ? (
      <button ref={resolveRef} type="button" className={styles.action} onClick={onResolve}>
        <span className={styles.actionFace}>Resolve conflicts</span>
      </button>
    ) : phase === "resolving" ? (
      <button type="button" className={styles.action} aria-disabled="true">
        <span className={styles.actionFace}>
          <Spinner className={styles.spinner} />
          Resolving
        </span>
      </button>
    ) : phase === "ready" || phase === "merging" ? (
      <button ref={mergeRef} type="button" className={styles.action} aria-disabled={busy} onClick={busy ? undefined : onMerge}>
        <span key={String(busy)} className={styles.actionFace}>
          {busy ? <Spinner className={styles.spinner} /> : <MergeIcon size={13} />}
          {busy ? "Merging" : "Merge"}
        </span>
      </button>
    ) : phase === "merged" ? (
      // after the merge: see it on GitHub
      <a className={`${styles.action} ${styles.actionPlain}`} href="https://github.com" target="_blank" rel="noreferrer">
        <span className={styles.actionFace}>
          <GitHubMark size={13} />
          GitHub
        </span>
      </a>
    ) : null;

  return (
    <section ref={cardRef} className={styles.card} aria-labelledby={titleId} tabIndex={-1}>
      <header className={styles.cardHead}>
        <h3 id={titleId} className={styles.title}>
          {PR_TITLE}
          {g.numbered && <span className={styles.number}> #{PR_NUMBER}</span>}
        </h3>
        {state && (
          <span key={state} className={styles.state} data-state={state}>
            {state === "merged" ? "Merged" : "Open"}
          </span>
        )}
      </header>
      <GraphLog g={g} cursor={cursor} resolved={resolved} />
      {/* CI, once the merge is pushed: each check ticks in, details on hover */}
      {(phase === "ready" || phase === "merging") && (
        <ul className={styles.checks} aria-label="Checks">
          {CHECKS.map((c, i) => (
            <li key={c.name} className={styles.check} tabIndex={0} style={{ "--i": i } as CSSProperties} aria-describedby={`${tipId}-${c.name}`}>
              <span className={styles.checkTick}>
                <Tick size={10} />
              </span>
              <span>{c.name}</span>
              <span className={styles.checkResult}>{c.result}</span>
              <span id={`${tipId}-${c.name}`} className={styles.checkTip} role="tooltip">
                {c.detail}
                <span className={styles.checkTook}>{c.took}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.status}>
        {status}
        {button}
      </div>
    </section>
  );
}
