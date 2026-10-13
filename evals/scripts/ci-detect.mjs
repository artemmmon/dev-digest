/**
 * CI change detector for the harness evals.
 *
 * Reads a newline-separated list of changed files (repo-relative) from $CHANGED_FILES and maps
 * them onto the eval suites that should run for this PR:
 *
 *   .claude/skills/<name>/**   OR  evals/skills/<name>/**   → run evals/skills/<name>  (content tier)
 *   .claude/agents/<name>.md   OR  evals/agents/<name>/**   → run evals/agents/<name>  (tool tier)
 *   any CLAUDE.md / AGENTS.md, any SKILL.md, any agent, settings.json, the workflow cases or the
 *   engine → run the workflow tier (it measures the live harness: routing, nested rules, skills)
 *
 * EVAL_ALL=1 ignores the diff and selects every skill and agent that has evals, plus the workflow
 * tier (a manual full run).
 *
 * A changed artifact with NO written evals is NOT a failure: it is reported on the `skipped_*`
 * outputs so the job can print a visible "SKIP <name> (no evals)" line instead of going red.
 *
 * Emits GitHub Actions step outputs (skills, agents, run_workflow, skipped_skills, skipped_agents)
 * to $GITHUB_OUTPUT. Pure filesystem + string work — no deps.
 */

import { existsSync, readdirSync, readFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(EVALS_DIR, "..");

const ALL = process.env.EVAL_ALL === "1";

const changed = (process.env.CHANGED_FILES ?? "")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

/** Does evals/<tier>/<name>/ contain at least one *.eval.ts? */
function hasEvals(tier, name) {
  const dir = join(EVALS_DIR, tier, name);
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith(".eval.ts"));
}

/** Names of every folder under evals/<tier>/ that has a *.eval.ts. */
function allWithEvals(tier) {
  const dir = join(EVALS_DIR, tier);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => hasEvals(tier, n)).sort();
}

/**
 * Eval folders that import another artifact's cases or fixtures (`from "../<other>/..."`), for the
 * names whose eval folder itself changed. architecture-reviewer-lite runs the cases that live in
 * evals/agents/architecture-reviewer/, so a change there has to select it too. An edit to the
 * artifact itself (`.claude/agents/<other>.md`) does not: the importer injects its own definition.
 */
function dependentsOf(tier, changedEvalDirs) {
  const out = new Set();
  const dir = join(EVALS_DIR, tier);
  if (!existsSync(dir) || changedEvalDirs.size === 0) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const f of readdirSync(join(dir, entry.name)).filter((n) => n.endsWith(".eval.ts"))) {
      const src = readFileSync(join(dir, entry.name, f), "utf8");
      for (const m of src.matchAll(/from\s+["']\.\.\/([^/"']+)\//g)) {
        if (changedEvalDirs.has(m[1])) out.add(entry.name);
      }
    }
  }
  return out;
}

/** Names whose `evals/<tier>/<name>/` folder is in the change. */
function changedEvalDirs(tier) {
  const re = new RegExp(`^evals/${tier}/([^/]+)/`);
  return new Set(changed.map((f) => f.match(re)?.[1]).filter(Boolean));
}

/** A skill that only has skill-creator evals (evals/evals.json) cannot run in CI: say so by name. */
function hasCreatorEvalsOnly(name) {
  return (
    !hasEvals("skills", name) && existsSync(join(REPO_ROOT, ".claude", "skills", name, "evals", "evals.json"))
  );
}

/** Collect distinct artifact names touched under a `.claude` and/or `evals` prefix. */
function touched(reClaude, reEvals) {
  const names = new Set();
  for (const f of changed) {
    const m = f.match(reClaude) ?? f.match(reEvals);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

const union = (...lists) => [...new Set(lists.flatMap((l) => [...l]))].sort();
const skillNames = ALL
  ? allWithEvals("skills")
  : union(
      touched(/^\.claude\/skills\/([^/]+)\//, /^evals\/skills\/([^/]+)\//),
      dependentsOf("skills", changedEvalDirs("skills")),
    );
// .claude/agents/README.md is the catalogue, not an agent.
const agentNames = ALL
  ? allWithEvals("agents")
  : union(
      touched(/^\.claude\/agents\/(?!README\.md$)([^/]+)\.md$/, /^evals\/agents\/([^/]+)\//),
      dependentsOf("agents", changedEvalDirs("agents")),
    );

const skills = skillNames.filter((n) => hasEvals("skills", n));
const skippedSkills = skillNames.filter((n) => !hasEvals("skills", n));
const agents = agentNames.filter((n) => hasEvals("agents", n));
const skippedAgents = agentNames.filter((n) => !hasEvals("agents", n));

// The workflow tier measures the LIVE harness, so anything that changes it re-triggers it:
//   - any CLAUDE.md or AGENTS.md (root, .claude/, or a package's own: server/, client/, ...).
//     The CLAUDE.md files are symlinks to AGENTS.md, so the edit shows up on AGENTS.md;
//   - a skill's SKILL.md (its description decides whether it is picked);
//   - any agent definition, .claude/settings.json;
//   - the workflow cases or the engine itself.
const runWorkflow =
  ALL ||
  changed.some(
    (f) =>
      /(^|\/)(CLAUDE|AGENTS)\.md$/.test(f) ||
      /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(f) ||
      /^\.claude\/agents\/(?!README\.md$).+\.md$/.test(f) ||
      /^\.claude\/settings(\.local)?\.json$/.test(f) ||
      /^evals\/workflow\//.test(f) ||
      /^evals\/src\//.test(f),
  );

const out = process.env.GITHUB_OUTPUT;
const write = (k, v) => (out ? appendFileSync(out, `${k}=${v}\n`) : console.log(`${k}=${v}`));

write("skills", JSON.stringify(skills));
write("agents", JSON.stringify(agents));
write("run_workflow", String(runWorkflow));
write("skipped_skills", skippedSkills.join(" "));
write("skipped_agents", skippedAgents.join(" "));

// Human-readable summary in the step log.
console.error("── eval change detection ──");
console.error(ALL ? "mode          : all (EVAL_ALL=1)" : `changed files : ${changed.length}`);
console.error(`skills → run  : ${skills.join(", ") || "(none)"}`);
console.error(`agents → run  : ${agents.join(", ") || "(none)"}`);
console.error(`workflow tier : ${runWorkflow ? "run" : "skip"}`);
for (const n of skippedSkills) {
  console.error(
    hasCreatorEvalsOnly(n)
      ? `SKIP skill ${n}: only evals/evals.json (skill-creator format), not runnable in CI`
      : `SKIP skill ${n}: no evals`,
  );
}
if (skippedAgents.length) console.error(`SKIP agents (no evals): ${skippedAgents.join(", ")}`);
