"use client";

import styles from "./merge-conflicts.module.css";
import { BASE, COMMITS, CONFLICT_LIST } from "./data";
import { Tick } from "./icons";

/**
 * What's in the way, said plainly: who changed the same lines, then for each conflict its file and line
 * and the two versions, Lena's above yours. Shown over "3 conflicts" in the status line, or over the
 * counter on one of Lena's commits (then just that commit's). Resolved ones are ticked off as they go.
 */
export function ConflictTip({ id, resolved, only, below }: { id: string; resolved: number; only?: string; below?: boolean }) {
  const list = CONFLICT_LIST.map((c, i) => ({ ...c, done: i < resolved })).filter((c) => !only || c.theirsBy === only);
  const commit = only ? COMMITS[only] : null;
  return (
    <span id={id} className={styles.conflictTip} data-below={!!below} role="tooltip">
      <span className={styles.tipLead}>
        {commit ? (
          <>
            <b>{commit.message}</b> clashes with your changes
          </>
        ) : (
          <>
            <b>Lena Park</b> changed the same lines on {BASE}
          </>
        )}
      </span>
      {list.map((c) => (
        <span key={c.id} className={styles.clashItem} data-done={c.done}>
          <span className={styles.clashWhere}>
            {c.file}
            <span className={styles.clashLine}>line {c.line}</span>
            {c.done && (
              <span className={styles.clashDone}>
                <Tick size={11} /> Resolved
              </span>
            )}
          </span>
          <span className={styles.clashSide} data-who="lena">
            <b>Lena</b>
            <code>{c.theirs}</code>
          </span>
          <span className={styles.clashSide} data-who="you">
            <b>You</b>
            <code>{c.ours}</code>
          </span>
        </span>
      ))}
    </span>
  );
}
