import { schedule, type Row } from "@/components/thinking-state";

// ---------- the repo ----------
export const BRANCH = "feat/session-refresh";
export const BASE = "main";
export const PR_NUMBER = 128;
export const PR_TITLE = "Refresh sessions in the auth middleware";

export type DiffLine = ["+" | "-" | " ", string];
export type ChangedFile = { dir: string; name: string; add: number; del: number; isNew?: boolean; diff: DiffLine[] };
export const FILES: ChangedFile[] = [
  {
    dir: "src/",
    name: "middleware.ts",
    add: 168,
    del: 12,
    diff: [
      [" ", "export async function middleware(req) {"],
      ["-", "  const session = await getSession(req)"],
      ["+", "  let session = await getSession(req)"],
      ["+", "  if (nearExpiry(session)) await refresh(session)"],
      [" ", "  return next(req, session)"],
    ],
  },
  {
    dir: "src/lib/",
    name: "auth.ts",
    add: 142,
    del: 18,
    diff: [
      [" ", "export function verifySession(token) {"],
      ["-", "  return verify(token)"],
      ["+", "  return refreshIfNear(token, 5 * MINUTE)"],
      [" ", "}"],
      ["+", "export const nearExpiry = (s) => s.expiresAt - Date.now() < 5 * MINUTE"],
    ],
  },
  {
    dir: "src/lib/",
    name: "session.ts",
    add: 96,
    del: 7,
    diff: [
      [" ", "export async function refresh(session) {"],
      ["-", "  throw new Error('not implemented')"],
      ["+", "  const next = await issue(session.userId)"],
      ["+", "  session.cookie.set(next.token, { httpOnly: true })"],
      [" ", "}"],
    ],
  },
  {
    dir: "src/lib/",
    name: "session.test.ts",
    add: 76,
    del: 0,
    isNew: true,
    diff: [
      ["+", "describe('session refresh', () => {"],
      ["+", "  it('refreshes within five minutes of expiry', ...)"],
      ["+", "  it('keeps the cart across a refresh', ...)"],
      ["+", "})"],
    ],
  },
];
export const ADDED = FILES.reduce((n, f) => n + f.add, 0);
export const DELETED = FILES.reduce((n, f) => n + f.del, 0);

// ---------- the history ----------
/** Lanes: 0 main, 1 your branch, 2 Sam's branch */
export type Commit = { id: string; lane: 0 | 1 | 2; sha: string; message: string; author: string; ago: string };
export const COMMITS: Record<string, Commit> = {
  m1: { id: "m1", lane: 0, sha: "9c2d4a", message: "Bump next to 16.3", author: "Sam Ortiz", ago: "3h" },
  s1: { id: "s1", lane: 2, sha: "62b0e4", message: "Track checkout funnel events", author: "Sam Ortiz", ago: "2h" },
  f1: { id: "f1", lane: 1, sha: "1f8e3b", message: "Read session expiry from the token", author: "You", ago: "40m" },
  s2: { id: "s2", lane: 2, sha: "e83c51", message: "Add analytics consent banner", author: "Sam Ortiz", ago: "32m" },
  f2: { id: "f2", lane: 1, sha: "c70a92", message: "Refresh sessions near expiry", author: "You", ago: "25m" },
  // pushed to main by someone else while you worked: only seen once main is fetched
  m2: { id: "m2", lane: 0, sha: "a3f9c1", message: "Rotate session keys", author: "Lena Park", ago: "18m" },
  m3: { id: "m3", lane: 0, sha: "5be27d", message: "Read sessions with the current key", author: "Lena Park", ago: "6m" },
  f3: { id: "f3", lane: 1, sha: "d29f50", message: "Add session refresh tests", author: "You", ago: "now" },
  // made while resolving
  f4: { id: "f4", lane: 1, sha: "7e0c3b", message: `Merge ${BASE} into ${BRANCH}`, author: "You", ago: "now" },
};
export const OTHER_BRANCH = "feat/checkout-analytics";

/** The three conflicts, line by line, with who wrote each side (git blame). Resolved in this order. */
export type Conflict = { id: string; dir: string; file: string; line: number; ours: string; theirs: string; oursBy: string; theirsBy: string };
export const CONFLICT_LIST: Conflict[] = [
  {
    id: "c1",
    dir: "src/",
    file: "middleware.ts",
    line: 18,
    ours: "if (nearExpiry(session)) await refresh(session)",
    theirs: "const session = await readSession(req, keys)",
    oursBy: "f2",
    theirsBy: "m3",
  },
  {
    id: "c2",
    dir: "src/lib/",
    file: "auth.ts",
    line: 42,
    ours: "return refreshIfNear(token, 5 * MINUTE)",
    theirs: "return verify(token, keys.current)",
    oursBy: "f2",
    theirsBy: "m2",
  },
  {
    id: "c3",
    dir: "src/lib/",
    file: "auth.ts",
    line: 57,
    ours: "const ttl = session.expiresAt - Date.now()",
    theirs: "const ttl = keys.current.ttl",
    oursBy: "f3",
    theirsBy: "m2",
  },
];
export const CONFLICTS = CONFLICT_LIST.length;
export const CONFLICTED_FILES = new Set(CONFLICT_LIST.map((c) => c.file)).size;

/** CI on the PR once the merge is pushed: what ran, how it went, how long it took */
export type Check = { name: string; result: string; took: string; detail: string };
export const CHECKS: Check[] = [
  { name: "Tests", result: "42 passed", took: "38s", detail: "vitest · 42 passed, 0 failed" },
  { name: "Lint", result: "passed", took: "9s", detail: "eslint · no problems" },
  { name: "Types", result: "passed", took: "21s", detail: "tsc --noEmit · no errors" },
  { name: "Preview", result: "ready", took: "1m 4s", detail: "Deployed to session-refresh.preview.acme.dev" },
];

// ---------- the conversation ----------
const ts = (label: string, href: string) => ({ label, href, icon: "ts" });

/** Create PR: commit, push, open, then find main has moved on */
export const ROWS_A: Row[] = [
  { id: "commit", lane: 0, node: "dot", active: "Committing the last changes", done: `Committed “${COMMITS.f3.message}”`, ms: 1100 },
  { id: "push", lane: 0, node: "dot", active: "Pushing 3 commits to origin", done: `Pushed ${BRANCH}`, ms: 1000 },
  { id: "open", lane: 0, node: "dot", active: "Opening the pull request", done: `Opened #${PR_NUMBER}`, ms: 900 },
  { id: "fetch", lane: 1, node: "fork", from: "open", active: `Fetching ${BASE}`, done: `${BASE} is 2 commits ahead`, ms: 800 },
  { id: "check", lane: 0, node: "merge", into: "fetch", active: "Checking it merges cleanly", done: `${CONFLICTS} conflicts in ${CONFLICTED_FILES} files`, ms: 1100 },
];
export const A = schedule(ROWS_A, 350);

/** Resolve conflicts: merge main in, resolve, test, push */
export const ROWS_B: Row[] = [
  { id: "merge", lane: 0, node: "dot", active: `Merging ${BASE} into the branch`, done: `Merged ${BASE} into ${BRANCH}`, ms: 1000 },
  {
    id: "resolve",
    lane: 0,
    node: "dot",
    active: `Resolving conflict {n} of ${CONFLICTS}`,
    done: `Resolved ${CONFLICTS} conflicts`,
    ms: 1800,
    count: CONFLICTS,
    chips: [ts("middleware.ts", "src/middleware.ts"), ts("auth.ts", "src/lib/auth.ts")],
  },
  { id: "tests", lane: 1, node: "fork", from: "resolve", active: "Running {n} of 42 tests", done: "42 tests passed", ms: 1300, count: 42 },
  { id: "push", lane: 0, node: "merge", into: "tests", active: "Pushing the merge", done: `Pushed to #${PR_NUMBER}`, ms: 800 },
];
export const B = schedule(ROWS_B, 350);

/** When a row starts and ends, by id */
export const span = (rows: Row[], starts: number[], id: string) => {
  const i = rows.findIndex((r) => r.id === id);
  return { from: starts[i], to: starts[i] + rows[i].ms };
};

export const ANSWER_A = `PR **#${PR_NUMBER}** is open, but \`${BASE}\` moved on while we worked: Lena's session key rotation changed the same lines in \`auth.ts\` and \`middleware.ts\`. I can merge \`${BASE}\` in and resolve them.`;

// ---------- timing ----------
/** A pause between "Create PR" landing in the chat and the assistant's answer appearing */
export const PR_DELAY = 800;
/** And after Resolve conflicts, before the assistant carries on */
export const RESOLVE_DELAY = 500;
export const CARD_AT = 120; // just after the thinking panel, inside turn A
export const WORD_MS = 38;
export const ANSWER_DELAY = 350; // after a turn's steps finish
export const MERGE_MS = 1100;
export const words = (s: string) => s.split(" ");
export const answerEnd = (total: number, text: string) => total + ANSWER_DELAY + words(text).length * WORD_MS + 200;
