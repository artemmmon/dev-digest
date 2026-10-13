/**
 * Which eval suites a change selects — scripts/ci-detect.mjs on hand-made file lists, no model.
 *   pnpm eval:static
 *
 * A change the detector does not map runs nothing, and CI stays green for a harness edit that
 * was never evaluated. These cases pin the mappings the PR workflow relies on.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "ci-detect.mjs");

function detect(changed: string[], env: Record<string, string> = {}) {
  const r = spawnSync("node", [SCRIPT], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", CHANGED_FILES: changed.join("\n"), ...env },
  });
  expect(r.status, r.stderr).toBe(0);
  const out: Record<string, string> = {};
  for (const line of r.stdout.split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return {
    skills: JSON.parse(out.skills ?? "[]") as string[],
    agents: JSON.parse(out.agents ?? "[]") as string[],
    workflow: out.run_workflow === "true",
    stderr: r.stderr,
  };
}

describe("ci-detect", () => {
  test("a skill with vitest evals selects its own suite", () => {
    const r = detect([".claude/skills/dependency-checker/references/severity.md"]);
    expect(r.skills).toEqual(["dependency-checker"]);
    expect(r.workflow).toBe(false);
  });

  test("an agent with evals selects its suite and the workflow tier", () => {
    const r = detect([".claude/agents/architecture-reviewer.md"]);
    expect(r.agents).toEqual(["architecture-reviewer"]);
    expect(r.workflow).toBe(true);
  });

  test("a shared eval input selects the eval that imports it; the agent file alone does not", () => {
    // architecture-reviewer-lite runs the cases and fixtures kept under evals/agents/architecture-reviewer/.
    const shared = detect(["evals/agents/architecture-reviewer/fixtures/discounts-service.diff"]);
    expect(shared.agents).toEqual(["architecture-reviewer", "architecture-reviewer-lite"]);
    const own = detect([".claude/agents/architecture-reviewer.md"]);
    expect(own.agents).toEqual(["architecture-reviewer"]);
  });

  test("the agents catalogue is not an agent", () => {
    const r = detect([".claude/agents/README.md"]);
    expect(r.agents).toEqual([]);
    expect(r.stderr).not.toContain("README");
    expect(r.workflow).toBe(false);
  });

  test.each(["CLAUDE.md", "AGENTS.md", "server/AGENTS.md", "client/AGENTS.md", "reviewer-core/CLAUDE.md"])(
    "%s selects the workflow tier",
    (file) => {
      expect(detect([file]).workflow).toBe(true);
    },
  );

  test("a SKILL.md selects the workflow tier; the rest of a skill folder does not", () => {
    expect(detect([".claude/skills/engineering-insights/SKILL.md"]).workflow).toBe(true);
    expect(detect([".claude/skills/engineering-insights/references/x.md"]).workflow).toBe(false);
  });

  test("a skill that has only skill-creator evals is skipped by name, not failed", () => {
    const r = detect([".claude/skills/security/SKILL.md"]);
    expect(r.skills).toEqual([]);
    expect(r.stderr).toContain("skill security");
    expect(r.stderr).toContain("evals.json");
  });

  test("an unrelated change selects nothing", () => {
    const r = detect(["server/src/app.ts", "docs/0001-x.md"]);
    expect(r).toMatchObject({ skills: [], agents: [], workflow: false });
  });

  test("EVAL_ALL=1 selects every suite regardless of the diff", () => {
    const r = detect([], { EVAL_ALL: "1" });
    expect(r.skills).toContain("dependency-checker");
    expect(r.agents).toContain("architecture-reviewer");
    expect(r.workflow).toBe(true);
  });
});
