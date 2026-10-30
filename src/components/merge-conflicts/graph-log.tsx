"use client";

import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./merge-conflicts.module.css";
import { BASE, BRANCH, COMMITS, CONFLICT_LIST, OTHER_BRANCH } from "./data";
import { DashedDraw, TipBox, targetOf, targetTip, tipFor, vCurve, type Cursor, type GraphState } from "./graph-shared";
import { Tick } from "./icons";
import { ConflictTip } from "./conflict-tip";

/**
 * The history as `git log --graph` prints it: newest on top, lanes on the left, a row per commit with
 * its sha, author and age, and each branch's name at its tip. Three branches: main, yours, and Sam's,
 * still open beside them. It plays in from the oldest commit up when the card appears; new commits
 * decode in like data arriving; main's commits slot in by date while the rows above make room; the
 * commits that clash with yours count their conflicts down as they're resolved; and once merged a violet
 * wave runs down your branch from the merge.
 */
const ROW = 28;
const LANE_X = [10, 26, 42];
const SHORT: Record<string, string> = { "Sam Ortiz": "Sam", "Lena Park": "Lena", You: "You" };

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Text that decodes in left to right, the not-yet-settled letters cycling, like data arriving */
const GLYPHS = "abcdefghijklmnopqrstuvwxyz0123456789";
function Scramble({ text, delay = 0 }: { text: string; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) {
      el.textContent = text;
      return;
    }
    const start = performance.now() + delay;
    const dur = 260 + text.length * 14;
    let raf = 0;
    const frame = (now: number) => {
      const p = Math.max(0, Math.min(1, (now - start) / dur));
      const settled = Math.floor(p * text.length);
      let out = text.slice(0, settled);
      // a short run of noise ahead of the settled text, so it reads as decoding rather than flickering
      for (let i = settled; i < Math.min(text.length, settled + 8); i++) out += text[i] === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      el.textContent = out;
      if (p < 1) raf = requestAnimationFrame(frame);
      else el.textContent = text;
    };
    frame(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [text, delay]);
  return <span ref={ref} />;
}

type Row = { id: string; lane: 0 | 1 | 2 };

export function GraphLog({ g, cursor, resolved }: { g: GraphState; cursor: Cursor; resolved: number }) {
  const uid = useId().replace(/:/g, "");
  // oldest first, as they happened; drawn the other way up
  const chrono: Row[] = [
    { id: "m1", lane: 0 },
    { id: "s1", lane: 2 },
    { id: "f1", lane: 1 },
    { id: "s2", lane: 2 },
    { id: "f2", lane: 1 },
    ...(g.m2 ? [{ id: "m2", lane: 0 as const }] : []),
    ...(g.m3 ? [{ id: "m3", lane: 0 as const }] : []),
    { id: "f3", lane: 1 },
    ...(g.f4 ? [{ id: "f4", lane: 1 as const }] : []),
    ...(g.opened ? [{ id: "target", lane: 0 as const }] : []),
  ];
  const n = chrono.length;
  // the rows there when the card appeared play in; any that come later slot in, highlighted
  const [first] = useState(() => new Set(chrono.map((r) => r.id)));

  const yOf = (id: string) => {
    const i = chrono.findIndex((r) => r.id === id);
    return i < 0 ? -1 : (n - 1 - i) * ROW + ROW / 2;
  };
  const h = n * ROW;
  const [x0, x1, x2] = LANE_X;
  const lastMain = g.m3 ? "m3" : g.m2 ? "m2" : "m1";
  const target = targetOf(g);
  const tY = yOf("target");
  const tip = g.f4 ? "f4" : "f3";
  const branchRows = chrono.filter((r) => r.lane === 1).map((r) => r.id);

  const label = g.merged
    ? `${BRANCH} merged into ${BASE}.`
    : `${BRANCH}, ${g.f4 ? 4 : 3} commits off ${BASE}, beside ${OTHER_BRANCH}.` +
      (g.fetched ? ` ${BASE} has 2 new commits from Lena Park.` : "") +
      (g.ready ? " It merges cleanly." : g.conflict && g.left ? ` Merging it has ${g.left} conflicts.` : "");

  // CSS `d`, so a line eases to its new shape as rows slot in (where supported; elsewhere it just moves)
  const path = (d: string, cls: string, attrs: Record<string, string | boolean> = {}, drawn = false) => (
    <path d={d} style={{ d: `path("${d}")` }} pathLength={drawn ? 1 : undefined} className={`${styles.edge} ${styles.morph} ${cls}`} {...attrs} />
  );

  // live counts for the row being worked on ("resolving 2/3" → "2/3")
  const count = cursor?.label.match(/\d+\/\d+/)?.[0];
  const testing = cursor?.label.startsWith("testing") && count ? Number(count.split("/")[0]) / Number(count.split("/")[1]) : null;
  const clashing = g.conflict && !g.ready;
  // the conflicts still open on one of Lena's commits
  const openOn = (id: string) => CONFLICT_LIST.filter((c, i) => c.theirsBy === id && i >= resolved).length;
  const clashesOn = (id: string) => CONFLICT_LIST.some((c) => c.theirsBy === id);

  // each branch's name sits at its tip, as `git log --decorate` puts it
  const tagFor = (id: string) =>
    id === "s2"
      ? { lane: 2, name: OTHER_BRANCH }
      : id === tip
        ? { lane: 1, name: BRANCH }
        : id === (g.merged ? "target" : lastMain)
          ? { lane: 0, name: BASE }
          : null;

  return (
    <div className={styles.log} data-merged={g.merged} style={{ height: h }} role="img" aria-label={label}>
      <svg className={styles.edges} width={56} height={h} aria-hidden="true">
        {/* Sam's branch, forked from main and still open beside it */}
        {path(vCurve(x0, yOf("m1"), x2, yOf("s1")) + `V${yOf("s2")}`, "", { "data-lane": "2" })}

        {/* main, from its history up to its newest commit; then the future the PR merges into */}
        {path(`M${x0} ${h + 10}V${yOf(lastMain)}`, "", { "data-lane": "0" })}
        {g.opened && !g.merged && path(`M${x0} ${yOf(lastMain)}V${tY}`, styles.fadeIn, { "data-lane": "0", "data-dashed": "true" })}
        {g.merged && path(`M${x0} ${yOf(lastMain)}V${tY}`, styles.draw, { "data-lane": "0" }, true)}

        {/* your branch, its last changes dashed until they're committed */}
        {path(vCurve(x0, yOf("m1"), x1, yOf("f1")) + `V${yOf("f2")}`, "", { "data-lane": "1" })}
        {path(`M${x1} ${yOf("f2")}V${yOf("f3")}`, "", { "data-lane": "1", "data-dashed": !g.committed })}
        {/* the push: a streak up your branch to its tip */}
        {g.pushing && <path d={vCurve(x0, yOf("m1"), x1, yOf("f1")) + `V${yOf("f3")}`} pathLength={1} className={styles.glint} />}

        {g.mergingMain && g.f4 && (
          <>
            {path(`M${x1} ${yOf("f3")}V${yOf("f4")}`, styles.draw, { "data-lane": "1" }, true)}
            {path(vCurve(x0, yOf("m3"), x1, yOf("f4")), `${styles.draw} ${styles.late}`, { "data-lane": "0" }, true)}
          </>
        )}

        {g.opened && (
          <DashedDraw
            id={`${uid}a`}
            d={vCurve(x1, yOf("f3"), x0, tY)}
            w={56}
            h={h}
            tone={g.conflict ? "amber" : "blue"}
            dim={g.mergingMain}
            gone={g.pushed2}
            className={styles.morph}
          />
        )}
        {g.pushed2 && g.f4 && (
          <DashedDraw id={`${uid}b`} d={vCurve(x1, yOf("f4"), x0, tY)} w={56} h={h} tone={g.ready ? "green" : "blue"} className={styles.morph} />
        )}
        {g.merging && g.f4 && path(vCurve(x1, yOf("f4"), x0, tY), `${styles.draw} ${styles.mergeDraw}`, { "data-tone": "violet" }, true)}
      </svg>
      <span className={styles.logFade} aria-hidden="true" />

      <ol className={styles.logRows} aria-hidden="true">
        {chrono.map((r, i) => {
          const busy = cursor?.node === r.id;
          const isTarget = r.id === "target";
          const kind = isTarget ? "target" : r.id === "f4" ? "merge" : r.id === "f3" && !g.committed ? "pending" : "commit";
          const c = COMMITS[r.id];
          const message = isTarget ? (g.merged ? `Merged into ${BASE}` : `Merge into ${BASE}`) : kind === "pending" ? "Uncommitted changes" : c.message;
          const fresh = !first.has(r.id);
          // decode a message the first time it's shown, unless it was there when the card appeared
          const decode = fresh || (r.id === "f3" && g.committed);
          // the merge's wave runs down your branch, from the merge commit to the first one
          const wave = r.lane === 1 ? branchRows.length - 1 - branchRows.indexOf(r.id) : 0;
          const open = openOn(r.id);
          const tag = tagFor(r.id);
          const state = isTarget
            ? { ghost: "", checking: "checking", conflict: g.left ? `${g.left} ${g.left === 1 ? "conflict" : "conflicts"}` : "resolved", ready: "ready", merged: "merged" }[target]
            : null;
          return (
            <li
              key={r.id}
              className={styles.logRow}
              data-lane={r.lane}
              data-busy={busy}
              data-fresh={fresh}
              data-clash={clashing && clashesOn(r.id) && open > 0}
              data-state={isTarget ? target : undefined}
              style={{ top: yOf(r.id) - ROW / 2, "--i": fresh ? 0 : i, "--wave": `${wave * 80 + 250}ms` } as CSSProperties}
            >
              <span
                className={`${styles.node} ${isTarget ? styles.targetIn : ""}`}
                data-kind={kind}
                data-lane={r.lane}
                data-state={isTarget ? target : undefined}
                style={{ left: LANE_X[r.lane], top: ROW / 2 }}
              >
                {isTarget && target === "conflict" && <span className={styles.pulse} />}
                {/* a ring goes out when it turns green, and again, with sparks, when it's merged */}
                {isTarget && (target === "ready" || target === "merged") && <span key={`ring-${target}`} className={styles.ring} data-tone={target} />}
                {isTarget &&
                  target === "merged" &&
                  Array.from({ length: 8 }, (_, j) => <span key={j} className={styles.spark} style={{ "--a": `${j * 45 + 22}deg` } as CSSProperties} />)}
                {isTarget ? (
                  <span key={target} className={styles.targetDot}>
                    {target === "conflict" && (
                      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                        <path d="M4 1.4v3M4 6.5v.1" />
                      </svg>
                    )}
                    {target === "ready" && (
                      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                        <path d="M1.6 4.2l1.6 1.6 3.2-3.5" pathLength={1} className={styles.tickDraw} />
                      </svg>
                    )}
                  </span>
                ) : (
                  <span key={kind} className={styles.dot} />
                )}
                {busy && <span className={styles.nodeSpin} />}
                <TipBox tip={isTarget ? targetTip(g) : kind === "pending" ? { text: "4 changed files, not committed yet" } : tipFor(c)} align="start" />
              </span>
              <span className={styles.logText}>
                <span className={styles.logLeft}>
                  <span key={message} className={`${styles.logMessage} ${busy ? styles.shimmer : ""}`}>
                    {decode ? <Scramble text={message} delay={fresh ? 300 : 0} /> : message}
                  </span>
                  {tag && (
                    <span key={tag.name} className={styles.tag} data-lane={tag.lane}>
                      {tag.name}
                    </span>
                  )}
                  {/* the commits that clash with yours carry their conflicts, counted down as they're resolved */}
                  {clashing && clashesOn(r.id) && (
                    // hover the counter for this commit's conflicts (keyboard and screen readers get them from the status line)
                    <span className={styles.hoverable}>
                      <span key={open ? `n${open}` : "done"} className={styles.clash} data-done={!open}>
                        {open || <Tick size={10} className={styles.clashTick} />}
                      </span>
                      <ConflictTip id={`${uid}-${r.id}`} resolved={resolved} only={r.id} below />
                    </span>
                  )}
                </span>
                {/* git blame, in short: the commit, who, and how long ago (a live count while it's being worked on) */}
                {isTarget ? (
                  state && (
                    <span key={state} className={styles.logWho} data-tone={target}>
                      {state}
                    </span>
                  )
                ) : busy && count ? (
                  <span key="count" className={styles.logWho}>
                    {count}
                  </span>
                ) : kind === "pending" ? (
                  <span key="pending" className={styles.logWho}>
                    4 files
                  </span>
                ) : (
                  <span key="blame" className={styles.logWho}>
                    <code className={styles.logSha}>{c.sha}</code>
                    {SHORT[c.author]} · {c.ago}
                  </span>
                )}
              </span>
              {/* the tests filling up under the row that's running them */}
              {busy && testing != null && <span className={styles.progress} style={{ "--p": testing } as CSSProperties} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
