"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./thinking-state.module.css";
import { Check, Chevron, ChipIcon, Search } from "./icons";
import { DONE_LABEL, DONE_NOTE, LOOP_PAUSE_MS, ROWS, STARTS, TOTAL_MS, type Chip as ChipData, type Row } from "./rows";

type Props = {
  /** Start over a few seconds after finishing, for recordings. */
  demo?: boolean;
};

// The graph column: lane 0 (main line of thought) and lane 1 (branches), and where a row's node sits.
const LANE_X = [10, 28];
const NODE_Y = 10;

type Edge = { id: string; d: string; kind: "main" | "branch" | "dead" };

/** The lines between nodes: the main line, forks out to lane 1, branch segments, and merges back. */
function edgesFor(visible: Row[], done: boolean, y: Record<string, number>): Edge[] {
  const [x0, x1] = LANE_X;
  const out: Edge[] = [];
  const main = visible.filter((r) => r.lane === 0).map((r) => r.id);
  if (done) main.push("done");
  for (let i = 1; i < main.length; i++) {
    const a = y[main[i - 1]];
    const b = y[main[i]];
    if (a != null && b != null) out.push({ id: `main-${main[i]}`, d: `M${x0} ${a}V${b}`, kind: "main" });
  }
  visible.forEach((r, i) => {
    const yr = y[r.id];
    if (yr == null) return;
    if (r.node === "fork" && r.from && y[r.from] != null) {
      // down from the main node, then ease across into lane 1
      const y0 = y[r.from];
      out.push({
        id: `fork-${r.id}`,
        d: `M${x0} ${y0}C${x0} ${y0 + 12} ${x1} ${y0 + 8} ${x1} ${y0 + 20}V${yr}`,
        kind: r.dead ? "dead" : "branch", // a one-step branch that dead-ends is dashed from the fork
      });
    } else if (r.lane === 1 && visible[i - 1]?.lane === 1 && y[visible[i - 1].id] != null) {
      out.push({ id: `branch-${r.id}`, d: `M${x1} ${y[visible[i - 1].id]}V${yr}`, kind: r.dead ? "dead" : "branch" });
    }
    if (r.node === "merge" && r.into && y[r.into] != null) {
      // down lane 1, then ease back across into the merge node
      const yb = y[r.into];
      out.push({ id: `merge-${r.id}`, d: `M${x1} ${yb}V${yr - 20}C${x1} ${yr - 8} ${x0} ${yr - 12} ${x0} ${yr}`, kind: "branch" });
    }
  });
  return out;
}

function Chip({ chip, index }: { chip: ChipData; index: number }) {
  return (
    <span className={styles.chip} tabIndex={chip.href ? 0 : -1} style={{ "--i": index } as CSSProperties}>
      <ChipIcon icon={chip.icon} />
      {chip.label}
      {chip.href && (
        <span className={styles.tip} role="tooltip">
          {chip.href}
        </span>
      )}
    </span>
  );
}

function Node({ row, active }: { row: Row; active: boolean }) {
  let node;
  if (row.node === "search") {
    node = (
      <span className={styles.searchNode}>
        <Search />
      </span>
    );
  } else if (row.node === "merge") {
    node = <span className={styles.mergeNode} />;
  } else if (row.dead && !active) {
    node = (
      <svg className={styles.deadNode} width="9" height="9" viewBox="0 0 9 9" aria-hidden="true">
        <path d="M2 2L7 7M7 2L2 7" />
      </svg>
    );
  } else {
    node = <span className={styles.dot} />;
  }
  return (
    <span className={styles.node} style={{ left: LANE_X[row.lane] }}>
      {node}
      {active && <span className={styles.spin} />}
    </span>
  );
}

export type ThinkingPanelProps = {
  rows: Row[];
  /** When each row starts, and when the run ends (see `schedule` in rows.ts) */
  starts: number[];
  total: number;
  /** ms since the run started; everything else follows from it */
  t: number;
  doneLabel: string;
  doneNote?: string;
  /** The finished header reads "<verb> for 4s" */
  doneVerb?: string;
  defaultExpanded?: boolean;
  /** The header names the step in progress instead of "Thinking", so the panel says what's happening while collapsed */
  liveHead?: boolean;
  style?: CSSProperties;
};

/** The panel itself, driven by the caller's clock, so it can be reused inside other flows. */
export function ThinkingPanel({
  rows,
  starts,
  total,
  t,
  doneLabel,
  doneNote,
  doneVerb = "Thought",
  defaultExpanded = true,
  liveHead = false,
  style,
}: ThinkingPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [moreOpen, setMoreOpen] = useState(false);
  const [geo, setGeo] = useState<{ y: Record<string, number>; h: number }>({ y: {}, h: 0 });

  const done = t >= total;

  // Measure where each row's node sits, so the graph's lines can join them.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const y: Record<string, number> = {};
      list.querySelectorAll<HTMLLIElement>("li[data-id]").forEach((el) => (y[el.dataset.id!] = el.offsetTop + NODE_Y));
      setGeo((g) =>
        g.h === list.offsetHeight && Object.keys(y).every((k) => g.y[k] === y[k]) && Object.keys(g.y).length === Object.keys(y).length
          ? g
          : { y, h: list.offsetHeight },
      );
    };
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, []);

  // The panel animates its height as rows arrive, and to just the header when collapsed.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const inner = innerRef.current;
    const head = headRef.current;
    if (!root || !inner || !head) return;
    const fit = () => {
      root.style.height = `${expanded ? inner.offsetHeight : head.offsetTop + head.offsetHeight}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [expanded]);

  const visible = rows.filter((_, i) => starts[i] <= t);
  // A row is running until its time is up; during a pause after it, nothing is.
  const last = visible.length - 1;
  const activeIndex = !done && last >= 0 && t < starts[last] + rows[last].ms ? last : -1;
  const countFor = (row: Row, i: number) =>
    row.count ? Math.min(row.count, Math.floor(((t - starts[i]) / row.ms) * row.count * 1.15) + 1) : 0;

  const edges = edgesFor(visible, done, geo.y);
  const seconds = Math.floor(t / 1000);
  // the live header: the step in progress, or the one just finished during a pause after it
  const live =
    activeIndex >= 0
      ? { key: `${rows[activeIndex].id}-a`, text: rows[activeIndex].active.replace("{n}", String(countFor(rows[activeIndex], activeIndex))) }
      : last >= 0
        ? { key: `${rows[last].id}-d`, text: rows[last].done }
        : { key: "start", text: "Thinking" };

  return (
    <div ref={rootRef} className={styles.root} data-expanded={expanded} style={style}>
      <div ref={innerRef}>
        <button
          ref={headRef}
          type="button"
          className={styles.head}
          data-live={liveHead && !done}
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
        >
          <span className={styles.lead}>
            <Chevron className={styles.chevron} />
          </span>
          {done ? (
            <span key="done" className={`${styles.headDone} ${styles.swap}`}>
              {doneVerb} for {Math.max(1, seconds)}s
            </span>
          ) : liveHead ? (
            <>
              {/* keyed by step (not by count), so it swaps in once per step and the count ticks in place */}
              <span key={live.key} className={`${styles.liveLabel} ${styles.swap}`}>
                <span className={styles.shimmer}>{live.text}</span>
              </span>
              <span className={styles.timer}>{seconds}s</span>
            </>
          ) : (
            <>
              <span className={styles.shimmer}>Thinking</span>
              <span className={styles.timer}>{seconds}s</span>
            </>
          )}
        </button>

        <div className={styles.graphWrap} aria-hidden={!expanded}>
          <svg className={styles.graph} width="40" height={geo.h} aria-hidden="true">
            {edges.map((e) => (
              <path key={e.id} d={e.d} className={styles.edge} data-kind={e.kind} pathLength={e.kind === "dead" ? undefined : 1} />
            ))}
          </svg>
          <ol ref={listRef} className={styles.list} aria-live="polite" aria-label="Thinking steps">

          {visible.map((row, i) => {
            const active = i === activeIndex;
            const label = active ? row.active.replace("{n}", String(countFor(row, i))) : row.done;
            const chips = row.more && moreOpen ? [...(row.chips ?? []), ...row.more] : row.chips;
            const showChips = chips && (row.node === "search" || !active);
            return (
              <li
                key={row.id}
                data-id={row.id}
                className={styles.row}
                data-lane={row.lane}
                data-active={active}
                data-node={row.node}
                data-dead={!!row.dead}
              >
                <Node row={row} active={active} />
                <div className={styles.body}>
                  <div className={styles.line}>
                    <span className={styles.label}>
                      <span key={active ? "a" : "d"} className={`${active ? styles.shimmer : ""} ${active ? "" : styles.swap}`}>
                        {label}
                      </span>
                    </span>
                  </div>
                  {showChips && (
                    <div className={styles.chips}>
                      {chips!.map((c, j) => (
                        <Chip key={c.label} chip={c} index={row.chips && j >= row.chips.length ? j - row.chips.length : j} />
                      ))}
                      {row.more && !moreOpen && (
                        <button
                          type="button"
                          className={styles.more}
                          style={{ "--i": row.chips?.length ?? 0 } as CSSProperties}
                          onClick={() => setMoreOpen(true)}
                        >
                          +{row.more.length} more
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}

          {done && (
            <li data-id="done" className={`${styles.row} ${styles.finish}`} data-lane={0}>
              <span className={styles.node} style={{ left: LANE_X[0] }}>
                <Check className={styles.check} />
              </span>
              <div className={styles.body}>
                <div className={styles.line}>
                  <span className={styles.label}>{doneLabel}</span>
                  {doneNote && <span className={styles.note}>{doneNote}</span>}
                </div>
              </div>
            </li>
          )}
          </ol>
        </div>
      </div>
    </div>
  );
}

/** One play-through. Remounted (by key) to start over, so every run begins from fresh state. */
function Run({ loop, onRestart }: { loop: boolean; onRestart: () => void }) {
  const [t, setT] = useState(0);
  const done = t >= TOTAL_MS;

  // One clock drives the run: which rows are showing, the live counts and the timer.
  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => {
      const now = performance.now() - start;
      setT(Math.min(now, TOTAL_MS));
      if (now >= TOTAL_MS) clearInterval(id);
    }, 80);
    return () => clearInterval(id);
  }, []);

  // In demo mode, hold the finished state for a moment, then start over.
  useEffect(() => {
    if (!done || !loop) return;
    const id = setTimeout(onRestart, LOOP_PAUSE_MS);
    return () => clearTimeout(id);
  }, [done, loop, onRestart]);

  return <ThinkingPanel rows={ROWS} starts={STARTS} total={TOTAL_MS} t={t} doneLabel={DONE_LABEL} doneNote={DONE_NOTE} />;
}

/**
 * An AI working panel drawn as a git-style graph. The main line is the agent's train of thought;
 * branches fork off for an idea it tries on the side (which can dead-end) or a sub-task it runs in
 * parallel, which merges back in. A live timer sits in the header, searched files pop in as chips,
 * and the run ends with a check. The header collapses the steps.
 */
export function ThinkingState({ demo = false }: Props) {
  const [run, setRun] = useState(0);
  const restart = useCallback(() => setRun((r) => r + 1), []);
  return <Run key={run} loop={demo} onRestart={restart} />;
}
