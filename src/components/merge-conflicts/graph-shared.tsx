"use client";

import styles from "./merge-conflicts.module.css";
import { BASE, PR_NUMBER, type Commit } from "./data";

export type Phase = "idle" | "creating" | "conflict" | "resolving" | "ready" | "merging" | "merged";

/** What the graph shows, worked out from the flow's clock */
export type GraphState = {
  committed: boolean; // the last changes are a commit (until then a hollow node on a dashed line)
  pushing: boolean; // a glint runs up the branch
  opened: boolean; // the PR's dashed line reaches for main
  numbered: boolean; // the PR has its number
  fetched: boolean; // main's new commits come in
  m2: boolean;
  m3: boolean;
  checking: boolean;
  conflict: boolean;
  mergingMain: boolean; // main merges into the branch
  f4: boolean;
  pushed2: boolean; // the PR's line moves to the merge commit
  ready: boolean;
  merging: boolean;
  merged: boolean;
  /** Conflicts still to resolve */
  left: number;
};

/** The node being worked on, and a word or two for what's happening to it */
export type Cursor = { node: "f3" | "m3" | "f4" | "target"; label: string } | null;

export const r1 = (v: number) => Math.round(v * 10) / 10;
/** An S-curve between two lanes running top to bottom */
export const vCurve = (x0: number, y0: number, x1: number, y1: number) => {
  const k = (y1 - y0) * 0.55;
  return `M${r1(x0)} ${r1(y0)}C${r1(x0)} ${r1(y0 + k)} ${r1(x1)} ${r1(y1 - k)} ${r1(x1)} ${r1(y1)}`;
};

export type TargetState = "ghost" | "checking" | "conflict" | "ready" | "merged";
export const targetOf = (g: GraphState): TargetState =>
  g.merged ? "merged" : g.ready ? "ready" : g.conflict ? "conflict" : g.checking ? "checking" : "ghost";

export type Tip = { sha?: string; text: string; meta?: string };
export const agoText = (ago: string) => (ago === "now" ? "just now" : `${ago} ago`);
export const tipFor = (c: Commit): Tip => ({ sha: c.sha, text: c.message, meta: `${c.author} · ${agoText(c.ago)}` });
export const targetTip = (g: GraphState): Tip =>
  ({
    merged: { sha: "b81f2e", text: `Merge pull request #${PR_NUMBER}`, meta: "You · just now" },
    ready: { text: `Merges cleanly into ${BASE}` },
    conflict: { text: g.left ? `Can't merge: ${g.left} ${g.left === 1 ? "conflict" : "conflicts"} with ${BASE}` : "Conflicts resolved" },
    checking: { text: `Checking it merges into ${BASE}` },
    ghost: { text: `Merge into ${BASE}` },
  })[targetOf(g)];

/** A tooltip over a node */
export function TipBox({ tip, align }: { tip: Tip; align: string }) {
  return (
    <span className={styles.tip} data-align={align} aria-hidden="true">
      <span>
        {tip.sha && <span className={styles.tipSha}>{tip.sha}</span>}
        {tip.text}
      </span>
      {tip.meta && <span className={styles.tipMeta}>{tip.meta}</span>}
    </span>
  );
}

/** A dashed line that draws itself in: the dashes are masked by a solid stroke that grows */
export function DashedDraw({
  id,
  d,
  w,
  h,
  tone,
  dim,
  gone,
  className = "",
}: {
  id: string;
  d: string;
  w: number;
  h: number;
  tone: string;
  dim?: boolean;
  gone?: boolean;
  className?: string;
}) {
  return (
    <>
      <mask id={id} maskUnits="userSpaceOnUse" x="-20" y="-20" width={w + 40} height={h + 40}>
        <path d={d} style={{ d: `path("${d}")` }} pathLength={1} className={`${styles.maskDraw} ${className}`} />
      </mask>
      <path
        d={d}
        style={{ d: `path("${d}")` }}
        className={`${styles.edge} ${className}`}
        data-dashed="true"
        data-tone={tone}
        data-dim={!!dim}
        data-gone={!!gone}
        mask={`url(#${id})`}
      />
    </>
  );
}
