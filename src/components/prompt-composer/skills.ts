export type Skill = { name: string; description: string };

// The first three are from the Figma file; the rest give the search something to filter.
export const SKILLS: Skill[] = [
  {
    name: "improve-codebase-architecture",
    description:
      "Analyze codebases for architectural friction and propose module-deepening refactors as testability improvements.",
  },
  {
    name: "arbe-improve-codebase",
    description:
      "Find places where a shallow module should be turned into a deep one. Whole-repo scope — for single diffs, use a review skill.",
  },
  {
    name: "codebase-design",
    description:
      "Design deep modules: a lot of behaviour behind a small interface, placed at a clean seam, testable through that interface.",
  },
  { name: "code-review", description: "Review the current diff for correctness bugs, then suggest focused cleanups." },
  { name: "security-review", description: "Audit pending changes for injection, auth and secrets-handling issues." },
  { name: "write-tests", description: "Add tests for untested behaviour, matching the project's existing test style." },
  { name: "debug-failing-test", description: "Reproduce a failing test, find the root cause and fix it with a minimal change." },
  { name: "frontend-design", description: "Build polished, accessible UI that follows the project's design tokens." },
  { name: "performance-audit", description: "Profile slow paths and propose changes ranked by measured impact." },
  { name: "accessibility-audit", description: "Check pages against WCAG 2.2 AA and fix contrast, focus and labelling issues." },
  { name: "update-docs", description: "Bring READMEs and inline docs in line with what the code does today." },
  { name: "dependency-upgrade", description: "Upgrade packages one at a time, reading changelogs and fixing breakages." },
  { name: "database-migration", description: "Write a reversible schema migration and backfill, with a rollout plan." },
  { name: "pr-description", description: "Summarise a branch as a pull request: what changed, why, and how to test it." },
];

export const MAX_RESULTS = 5;

/**
 * Ranks skills for the text typed after "/": name prefix, then name contains,
 * then names sharing a word with the query. Descriptions are searched only
 * when no name matches.
 */
export function searchSkills(query: string): Skill[] {
  const q = query.toLowerCase();
  if (!q) return SKILLS.slice(0, MAX_RESULTS);
  const words = q.split(/[-\s]+/).filter(Boolean);
  const scored = SKILLS.map((skill, order) => {
    const name = skill.name;
    let score = 0;
    if (name.startsWith(q)) score = 3;
    else if (name.includes(q)) score = 2;
    else {
      const parts = name.split("-");
      const shared = words.filter((w) => parts.some((p) => p.startsWith(w))).length;
      if (shared) score = shared / words.length;
    }
    return { skill, score, order };
  }).filter((r) => r.score > 0);

  const ranked = scored.length
    ? scored
    : SKILLS.map((skill, order) => ({ skill, order, score: skill.description.toLowerCase().includes(q) ? 0.5 : 0 })).filter(
        (r) => r.score > 0,
      );

  return ranked
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, MAX_RESULTS)
    .map((r) => r.skill);
}

/** Whether a "/token" names a skill or is on its way to one. */
export const isSkillPrefix = (token: string) => SKILLS.some((s) => s.name.startsWith(token.toLowerCase()));
