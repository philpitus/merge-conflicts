export type Chip = {
  label: string;
  /** Shown in the tooltip: a repo path or a URL without the protocol */
  href?: string;
  /** Picks the icon: a file extension ("ts", "tsx") or "web" */
  icon: string;
};

/**
 * One row on the thinking graph. Lane 0 is the main line of thought; lane 1 is a branch:
 * an idea the agent tries on the side (which may dead-end) or a sub-task it runs in parallel
 * and then merges back in, like a git history.
 */
export type Row = {
  id: string;
  lane: 0 | 1;
  node: "search" | "dot" | "fork" | "merge";
  /** Label while it's happening; "{n}" is replaced by the live count */
  active: string;
  /** Label once it's done */
  done: string;
  /** How long the step runs, in ms */
  ms: number;
  /** A beat after it finishes before the next row arrives; used where a branch ends */
  pause?: number;
  /** fork: the main-line row it branches from */
  from?: string;
  /** merge: the branch row that merges in here */
  into?: string;
  /** A branch row whose idea didn't work out: the branch ends here instead of merging */
  dead?: boolean;
  /** Counts up to this while active */
  count?: number;
  chips?: Chip[];
  /** Chips behind "+N more" */
  more?: Chip[];
};

// Example run: the agent working through "/improve-codebase-architecture" from the prompt composer.
export const ROWS: Row[] = [
  {
    id: "search",
    lane: 0,
    node: "search",
    active: "Searching the codebase",
    done: "Searched the codebase",
    ms: 1900,
    chips: [
      { label: "router.ts", href: "src/app/router.ts", icon: "ts" },
      { label: "auth.ts", href: "src/lib/auth.ts", icon: "ts" },
      { label: "Button.tsx", href: "src/components/Button.tsx", icon: "tsx" },
      { label: "Routing – Next.js docs", href: "nextjs.org/docs/app/building-your-application/routing", icon: "web" },
    ],
    more: [
      { label: "session.ts", href: "src/lib/session.ts", icon: "ts" },
      { label: "middleware.ts", href: "src/middleware.ts", icon: "ts" },
      { label: "Deep modules – APoSD", href: "web.stanford.edu/~ouster/cgi-bin/book.php", icon: "web" },
    ],
  },
  { id: "read", lane: 0, node: "dot", active: "Reading {n} of 7 files", done: "Read 7 files about routing and auth", ms: 1500, count: 7 },
  {
    id: "see",
    lane: 1,
    node: "fork",
    from: "read",
    dead: true,
    active: "Checking if middleware can handle the session",
    done: "Dead end: middleware can't read the request body",
    ms: 1500,
    pause: 700, // let the dead end land before the main line carries on
  },
  { id: "map", lane: 0, node: "dot", active: "Mapping how the modules depend on each other", done: "Mapped 12 module dependencies", ms: 1300 },
  {
    id: "tests",
    lane: 1,
    node: "fork",
    from: "map",
    active: "Running the auth tests in parallel",
    done: "Ran 42 auth tests",
    ms: 1400,
  },
  { id: "fails", lane: 1, node: "dot", active: "Sorting out the 4 that touch the session", done: "4 tests touch session.ts", ms: 1100, pause: 500 },
  { id: "merge", lane: 0, node: "merge", into: "fails", active: "Merging the test results", done: "Merged the test results", ms: 900 },
  { id: "spot", lane: 0, node: "dot", active: "Spotting shallow modules worth deepening", done: "Found 4 shallow modules", ms: 1400 },
  { id: "plan", lane: 0, node: "dot", active: "Drafting the refactor plan", done: "Drafted a 3-step refactor plan", ms: 1400 },
];

export const DONE_LABEL = "Finished thinking";
export const DONE_NOTE = "4 modules to deepen · 3 steps";

export const START_MS = 450;
/** In demo mode, how long the finished state holds before it starts over. */
export const LOOP_PAUSE_MS = 4000;

/** When each row starts (after the previous one runs and any pause), and when the whole run finishes. */
export function schedule(rows: Row[], startMs = START_MS) {
  const starts = rows.reduce<number[]>(
    (acc, r, i) => (acc.push(i ? acc[i - 1] + rows[i - 1].ms + (rows[i - 1].pause ?? 0) : startMs), acc),
    [],
  );
  return { starts, total: starts[starts.length - 1] + rows[rows.length - 1].ms };
}

export const { starts: STARTS, total: TOTAL_MS } = schedule(ROWS);
