"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { PromptComposer } from "@/components/prompt-composer";
import { ThinkingPanel } from "@/components/thinking-state";
import { useGlide } from "@/lib/use-glide";
import styles from "./merge-conflicts.module.css";
import {
  A,
  ANSWER_A,
  ANSWER_DELAY,
  B,
  BASE,
  CARD_AT,
  PR_DELAY,
  RESOLVE_DELAY,
  CONFLICTS,
  CONFLICT_LIST,
  MERGE_MS,
  PR_NUMBER,
  ROWS_A,
  ROWS_B,
  WORD_MS,
  answerEnd,
  span,
  words,
} from "./data";
import { ChangeBar } from "./change-bar";
import { PrCard, type GraphState, type Phase } from "./pr-card";
import type { Cursor } from "./graph-shared";
import type { Row } from "@/components/thinking-state";

type Props = {
  /** Play the whole flow on its own (look at the files, create the PR, resolve, merge), then start over. */
  demo?: boolean;
  /** Light on a white stage, or dark on a near-black one. */
  theme?: "light" | "dark";
};

// the composer re-renders only when its own props change, not on every tick of the flow
const Composer = memo(PromptComposer);
// the thinking panels sit straight on the stage, across the chat's full width
const PANEL = { width: "100%", "--halo": "var(--stage)" } as CSSProperties;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- answers: words stream in; **bold** and `code` ----------
type Token = { bold: boolean; parts: { text: string; code: boolean }[] };
function tokens(text: string): Token[] {
  let bold = false;
  return words(text).map((w) => {
    const opens = w.startsWith("**");
    if (opens) bold = true;
    const parts = w
      .replaceAll("**", "")
      .split(/(`[^`]+`)/)
      .filter(Boolean)
      .map((p) => (p.startsWith("`") ? { text: p.slice(1, -1), code: true } : { text: p, code: false }));
    const token = { bold, parts };
    if (w.includes("**", opens ? 2 : 0)) bold = false;
    return token;
  });
}
const TOKENS_A = tokens(ANSWER_A);

function Answer({ toks, t }: { toks: Token[]; t: number }) {
  const shown = Math.min(toks.length, Math.floor(t / WORD_MS) + 1);
  return (
    <p className={styles.para} aria-busy={shown < toks.length}>
      {toks.slice(0, shown).map((w, i) => {
        const body = w.parts.map((p, j) => (p.code ? <code key={j}>{p.text}</code> : p.text));
        return (
          <span key={i} className={styles.word}>
            {i > 0 && " "}
            {w.bold ? <strong>{body}</strong> : body}
          </span>
        );
      })}
    </p>
  );
}

// ---------- your messages: they appear in the chat as anything you type would ----------
function Bubble({ id, text }: { id: string; text: string }) {
  return (
    <div className={styles.user} data-msg={id}>
      {text}
    </div>
  );
}

/** One play-through. Remounted (by key) to start over. */
/** The step in progress at `t` (or the one just finished, in a pause after it), with its live count */
function liveStep(rows: Row[], starts: number[], t: number) {
  let i = -1;
  for (let j = 0; j < rows.length; j++) if (starts[j] <= t) i = j;
  if (i < 0) return { id: "start", n: 0, text: rows[0].active.replace("{n}", "1") }; // about to start: name the first step
  const r = rows[i];
  const active = t < starts[i] + r.ms;
  const n = r.count ? Math.min(r.count, Math.floor(((t - starts[i]) / r.ms) * r.count * 1.15) + 1) : 0;
  return { id: r.id, n, text: active ? r.active.replace("{n}", String(n)) : r.done };
}

// where each step happens on the chart, and its word there
const CURSOR_A: Record<string, (n: number) => Cursor> = {
  start: () => ({ node: "f3", label: "staging" }),
  commit: () => ({ node: "f3", label: "committing" }),
  push: () => ({ node: "f3", label: "pushing" }),
  open: () => ({ node: "target", label: "opening PR" }),
  fetch: () => ({ node: "m3", label: "fetching" }),
  check: () => ({ node: "target", label: "checking" }),
};
const CURSOR_B: Record<string, (n: number) => Cursor> = {
  start: () => ({ node: "f4", label: "merging main" }),
  merge: () => ({ node: "f4", label: "merging main" }),
  resolve: (n) => ({ node: "f4", label: `resolving ${n}/${CONFLICTS}` }),
  tests: (n) => ({ node: "f4", label: `testing ${n}/42` }),
  push: () => ({ node: "target", label: "pushing" }),
};

function Run({ demo, theme, onRestart }: { demo: boolean; theme: "light" | "dark"; onRestart: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lowerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const resolveRef = useRef<HTMLButtonElement>(null);
  const mergeRef = useRef<HTMLButtonElement>(null);

  // when each step was asked for, on the clock; and what you said to ask for it
  const [startA, setStartA] = useState<number | null>(null);
  const [startB, setStartB] = useState<number | null>(null);
  const [startM, setStartM] = useState<number | null>(null);
  const [textA, setTextA] = useState("Create PR");
  // the Resolve conflicts button just lets the assistant carry on; typing it shows as your message
  const [textB, setTextB] = useState<string | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);

  // ---------- where the flow is, from one clock: visible ms, ticking only while something runs ----------
  const [clock, setClock] = useState(0);
  const clockRef = useRef(0);
  // each turn starts a beat after you ask: your message lands, a pause, then the answer begins
  const NONE = -1e9;
  const tA = startA == null ? NONE : clock - startA - PR_DELAY;
  const tB = startB == null ? NONE : clock - startB - RESOLVE_DELAY;
  const tM = startM == null ? -1 : clock - startM;
  const phase: Phase =
    tM >= 0
      ? tM >= MERGE_MS
        ? "merged"
        : "merging"
      : startB != null
        ? tB >= B.total
          ? "ready"
          : "resolving"
        : startA != null
          ? tA >= A.total
            ? "conflict"
            : "creating"
          : "idle";
  const endA = answerEnd(A.total, ANSWER_A);
  const endB = B.total + 100;
  const running = (startA != null && tA < endA) || (startB != null && tB < endB) || (tM >= 0 && tM < MERGE_MS + 100);
  useEffect(() => {
    if (!running) return;
    // counts only time the page is visible: a hidden tab pauses the CSS, so the steps wait for it
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      if (document.visibilityState === "visible") clockRef.current += now - last;
      last = now;
      setClock(clockRef.current);
    }, 50);
    return () => clearInterval(id);
  }, [running]);

  // ---------- conflicts, counted down as they're resolved ----------
  const res = span(ROWS_B, B.starts, "resolve");
  const resolved =
    tB < res.from ? 0 : tB >= res.to ? CONFLICTS : Math.min(CONFLICTS, Math.floor(((tB - res.from) / (res.to - res.from)) * CONFLICTS * 1.15) + 1) - 1;
  const left = startA != null && tA >= A.total ? CONFLICTS - resolved : 0;
  // conflicts still open in each file, for the file list
  const leftIn: Record<string, number> = {};
  if (left) CONFLICT_LIST.forEach((c, i) => i >= resolved && (leftIn[c.file] = (leftIn[c.file] ?? 0) + 1));

  const sA = (id: string) => span(ROWS_A, A.starts, id);
  const sB = (id: string) => span(ROWS_B, B.starts, id);
  const g: GraphState = {
    committed: tA >= sA("commit").to,
    pushing: tA >= sA("push").from && tA < sA("push").to,
    opened: tA >= sA("open").from,
    numbered: tA >= sA("open").from + 450,
    fetched: tA >= sA("fetch").from,
    m2: tA >= sA("fetch").from + 220,
    m3: tA >= sA("fetch").from + 480,
    checking: tA >= sA("check").from && tA < A.total,
    conflict: startA != null && tA >= A.total,
    mergingMain: tB >= sB("merge").from,
    f4: tB >= sB("merge").from + 420,
    pushed2: tB >= sB("push").from,
    ready: tB >= B.total,
    merging: tM >= 0,
    merged: tM >= MERGE_MS,
    left,
  };

  // the step in progress, said in the card's status line and pointed at on its chart
  let live: { key: string; text: string } | null = null;
  let cursor: Cursor = null;
  if (phase === "creating") {
    const s = liveStep(ROWS_A, A.starts, tA);
    live = { key: `a-${s.id}`, text: s.text };
    // main's commits arrive partway into fetching; until then, point at the branch tip
    cursor = s.id === "fetch" && !g.m3 ? { node: "f3", label: "fetching" } : CURSOR_A[s.id](s.n);
  } else if (phase === "resolving") {
    const s = liveStep(ROWS_B, B.starts, tB);
    live = { key: `b-${s.id}`, text: s.text };
    cursor = g.f4 ? CURSOR_B[s.id](s.n) : { node: "m3", label: "merging main" };
  } else if (phase === "merging") {
    live = { key: "merging", text: `Merging into ${BASE}` };
    cursor = { node: "target", label: "merging" };
  }

  useGlide(scrollRef, contentRef, lowerRef);

  // ---------- the three things you can ask for ----------
  const phaseRef = useRef(phase);
  const doneRef = useRef({ a: false, b: false, m: false });
  useLayoutEffect(() => {
    phaseRef.current = phase;
    doneRef.current = { a: tA >= endA, b: tB >= endB, m: tM >= MERGE_MS };
  });
  // each step starts at the clock's current reading (it holds still while nothing runs)
  const begin = useCallback((set: (n: number) => void) => set(clockRef.current), []);
  const create = useCallback(
    (text?: string) => {
      if (phaseRef.current !== "idle") return;
      setFilesOpen(false);
      if (text) setTextA(text);
      begin(setStartA);
    },
    [begin],
  );
  const resolve = useCallback(
    (text?: string) => {
      if (phaseRef.current !== "conflict") return;
      if (text) setTextB(text);
      begin(setStartB);
    },
    [begin],
  );
  const merge = useCallback(() => {
    if (phaseRef.current !== "ready") return;
    begin(setStartM);
  }, [begin]);

  // typing it works too
  const onSend = useCallback(
    (text: string) => {
      if (/\b(pr|pull request)\b/i.test(text)) create(text);
      else if (/resolv|conflict|fix/i.test(text)) resolve(text);
    },
    [create, resolve],
  );

  // the PR's status above the composer takes you back to its card
  const showPr = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    card.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "nearest" });
    card.focus({ preventScroll: true });
    if (!reducedMotion())
      card.animate(
        [{ boxShadow: "0 0 0 0 rgba(37, 99, 235, 0)" }, { boxShadow: "0 0 0 4px rgba(37, 99, 235, 0.18)" }, { boxShadow: "0 0 0 0 rgba(37, 99, 235, 0)" }],
        { duration: 900, easing: "ease-out" },
      );
  }, []);

  // ---------- auto demo: look at the files, create the PR, resolve, merge, start over ----------
  useEffect(() => {
    if (!demo) return;
    const ctrl = new AbortController();
    const { signal } = ctrl;
    const wait = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        const id = setTimeout(resolve, ms);
        signal.addEventListener("abort", () => (clearTimeout(id), reject(new DOMException("aborted", "AbortError"))));
      });
    const until = async (cond: () => boolean) => {
      while (!cond()) await wait(100);
    };
    const press = async (el: HTMLElement | null) => {
      el?.animate([{ scale: "1" }, { scale: "0.95" }, { scale: "1" }], { duration: 240, easing: "ease-out" });
      await wait(140);
    };
    (async () => {
      await wait(1200);
      setFilesOpen(true);
      await wait(2300);
      setFilesOpen(false);
      await wait(800);
      await press(createRef.current);
      create();
      await until(() => doneRef.current.a);
      await wait(1700);
      await press(resolveRef.current);
      resolve();
      await until(() => doneRef.current.b);
      await wait(1500);
      await press(mergeRef.current);
      merge();
      await until(() => doneRef.current.m);
      await wait(4200);
      onRestart();
    })().catch(() => {});
    return () => ctrl.abort();
  }, [demo, create, resolve, merge, onRestart]);

  const announce = {
    idle: "",
    creating: "Creating the pull request",
    conflict: `Pull request #${PR_NUMBER} is open. ${CONFLICTS} conflicts with ${BASE}.`,
    resolving: "Resolving the conflicts",
    ready: `Conflicts resolved. #${PR_NUMBER} is ready to merge.`,
    merging: "Merging",
    merged: `#${PR_NUMBER} merged into ${BASE}.`,
  }[phase];

  return (
    <div ref={rootRef} className={styles.root} data-theme={theme}>
      <div className={styles.chat}>
        <div ref={scrollRef} className={styles.scroller}>
          <div ref={contentRef} className={styles.content}>
            {startA != null && (
              <>
                <Bubble id="create" text={textA} />
                {tA >= 0 && (
                <div className={styles.turn}>
                  <ThinkingPanel
                    rows={ROWS_A}
                    starts={A.starts}
                    total={A.total}
                    t={Math.min(tA, A.total)}
                    doneLabel="Pull request opened"
                    doneNote={`${CONFLICTS} conflicts with ${BASE}`}
                    doneVerb="Worked"
                    defaultExpanded={false}
                    style={PANEL}
                  />
                  {tA >= CARD_AT && (
                    <PrCard
                      phase={phase}
                      g={g}
                      live={live}
                      cursor={cursor}
                      resolved={resolved}
                      cardRef={cardRef}
                      resolveRef={resolveRef}
                      mergeRef={mergeRef}
                      onResolve={() => resolve()}
                      onMerge={merge}
                    />
                  )}
                  {tA >= A.total + ANSWER_DELAY && <Answer toks={TOKENS_A} t={tA - A.total - ANSWER_DELAY} />}
                </div>
                )}
              </>
            )}

            {/* resolving plays out in the card; a message shows only if you typed it */}
            {startB != null && textB && <Bubble id="resolve" text={textB} />}
          </div>
        </div>


      </div>

      {/* the composer, with the bar floating just above it: they move as one */}
      <div ref={lowerRef} className={styles.composer}>
        <ChangeBar
          phase={phase}
          left={left}
          leftIn={leftIn}
          open={filesOpen}
          onOpen={setFilesOpen}
          createRef={createRef}
          onCreate={() => create()}
          onShowPr={showPr}
        />
        <Composer onSend={onSend} />
      </div>

      <p className={styles.srOnly} aria-live="polite">
        {announce}
      </p>
    </div>
  );
}

/**
 * Create PR & merge conflicts. Above the composer float the branch's changes (open them for the files)
 * and Create PR. Pressing it sends "Create PR" as a message; the assistant works through it under a
 * collapsed thinking panel, and the pull request plays out as a live git log under a status line that
 * names each step: the last changes are committed and pushed, the PR reaches for main, then main's new
 * commits slot in by date and the conflict lands on the log. Resolve conflicts merges main in and
 * counts them down on the commits that clashed; then merge.
 */
export function MergeConflicts({ demo = false, theme = "light" }: Props) {
  const [run, setRun] = useState(0);
  const restart = useCallback(() => setRun((r) => r + 1), []);
  return <Run key={`${run}-${demo}`} demo={demo} theme={theme} onRestart={restart} />;
}

/** The same flow in dark mode, for its own stage. */
export function MergeConflictsDark({ demo = false }: Pick<Props, "demo">) {
  return <MergeConflicts demo={demo} theme="dark" />;
}
