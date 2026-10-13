/**
 * Static checks of the harness the workflow tier runs against. No model, no tokens:
 *   pnpm eval:static
 *
 * A workflow case that expects a file the repo no longer has fails every run for a reason that
 * has nothing to do with the model, and a stale path in an AGENTS.md sends the agent to a file
 * that is not there. Both are cheap to catch before a session is started.
 */

import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { cases } from "../workflow/review-workflow.cases.js";
import { AGENTS_DIR, EVALS_DIR, REPO_ROOT, SKILLS_DIR } from "./artifacts/paths.js";

/** Root AGENTS.md + the AGENTS.md of every top-level package that has one. */
function agentsFiles(): string[] {
  const dirs = [
    "",
    ...readdirSync(REPO_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules")
      .map((d) => d.name),
  ];
  return dirs.filter((d) => existsSync(join(REPO_ROOT, d, "AGENTS.md"))).map((d) => join(d, "AGENTS.md"));
}

const FILES = agentsFiles();

/**
 * Backticked slashes that are not a location in this checkout. Kept as an explicit list so a
 * new entry is a decision, not a silent exception.
 */
const NOT_A_REPO_PATH = new Set([
  // runtime output and the user's git-ignored notes
  "server/clones",
  "temp",
  "test-results",
  "reviewer-core/node_modules",
  // identifiers: a model slug, repository names
  "deepseek/deepseek-v4-flash",
  "acme/payments-api",
  "devdigest-fixtures/tour-sample",
  // examples of a shape, written as prose
  "docs/kebab-case-topic.md",
  "../../other-package",
  "repository",
  "_components",
]);

/**
 * Backticked tokens in an AGENTS.md that name a path inside the repo. Commands, globs,
 * placeholders (`<name>`, `NN-…`), env vars and home-relative paths are skipped, and so is a bare
 * file name (`routes.ts`): that is a naming convention, not a location.
 */
function referencedPaths(markdown: string): string[] {
  const out = new Set<string>();
  for (const m of markdown.matchAll(/`([^`\n]+)`/g)) {
    const token = m[1].trim();
    if (/[\s<>*$~{}()|=:@]/.test(token)) continue;
    if (token.includes("NN")) continue;
    if (!/^(?:\.\.?\/)*[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\/?$/.test(token)) continue;
    if (!token.includes("/")) continue;
    out.add(token.replace(/^\.\//, ""));
  }
  return [...out];
}

describe("AGENTS.md files", () => {
  test("the root and every package have one, and the set is not empty", () => {
    expect(FILES).toContain("AGENTS.md");
    expect(FILES.length).toBeGreaterThan(1);
  });

  test.each(FILES)("%s is at most 100 lines (a map, not documentation)", (file) => {
    const lines = readFileSync(join(REPO_ROOT, file), "utf8").trimEnd().split("\n").length;
    expect(lines, `${file} has ${lines} lines`).toBeLessThanOrEqual(100);
  });

  test.each(FILES)("%s has a CLAUDE.md beside it that is a symlink to it", (file) => {
    const link = join(REPO_ROOT, dirname(file), "CLAUDE.md");
    expect(existsSync(link), `${join(dirname(file), "CLAUDE.md")} is missing`).toBe(true);
    expect(lstatSync(link).isSymbolicLink(), "CLAUDE.md is a copy, not a link").toBe(true);
    expect(readlinkSync(link)).toBe("AGENTS.md");
  });

  test.each(FILES)("%s: every path it names exists", (file) => {
    const base = join(REPO_ROOT, dirname(file));
    // A path may be written from the folder the file lives in (`src/app.ts`, `../TESTING.md`), from
    // the repo root (`server/docs`), or shortened under that package's `src/` (`adapters/mocks.ts`).
    const bases = [base, REPO_ROOT, join(base, "src")];
    const missing = referencedPaths(readFileSync(join(REPO_ROOT, file), "utf8")).filter((p) => {
      if (NOT_A_REPO_PATH.has(p.replace(/\/$/, ""))) return false;
      return !bases.some((b) => existsSync(resolve(b, p)));
    });
    expect(missing, `${file} names paths that do not exist`).toEqual([]);
  });
});

describe("workflow cases", () => {
  const skillExists = (name: string) => existsSync(join(SKILLS_DIR, name, "SKILL.md"));
  const agentExists = (name: string) => existsSync(join(AGENTS_DIR, `${name}.md`));
  const fileExists = (rel: string) => existsSync(join(REPO_ROOT, rel));

  for (const c of cases) {
    test(`${c.name}: every file, skill and subagent it names exists`, () => {
      const missing: string[] = [];
      const files: string[] = [];
      const skills: string[] = [];
      const agents: string[] = [];
      if (c.kind === "dispatch") agents.push(c.expectSubagent);
      else if (c.kind === "activation") skills.push(c.skill);
      else if (c.kind === "contrast") files.push(c.expectFileRead);
      else {
        files.push(...(c.expectFilesRead ?? []), ...(c.expectNoFilesRead ?? []));
        skills.push(...(c.expectSkills ?? []), ...(c.expectNoSkills ?? []));
        agents.push(...(c.expectSubagents ?? []), ...(c.expectNoSubagents ?? []));
      }
      for (const f of files) if (!fileExists(f)) missing.push(`file ${f}`);
      for (const s of skills) if (!skillExists(s)) missing.push(`skill ${s}`);
      for (const a of agents) if (!agentExists(a)) missing.push(`subagent ${a}`);
      expect(missing, "the case expects something the repo does not have").toEqual([]);
    });
  }

  test("a trace case checks something", () => {
    for (const c of cases) {
      if (c.kind !== "trace") continue;
      const checks =
        (c.expectSubagents?.length ?? 0) +
        (c.expectSkills?.length ?? 0) +
        (c.expectFilesRead?.length ?? 0) +
        (c.expectNoSubagents?.length ?? 0) +
        (c.expectNoSkills?.length ?? 0) +
        (c.expectNoFilesRead?.length ?? 0) +
        (c.practices?.length ?? 0);
      expect(checks, `${c.name} has no expectation`).toBeGreaterThan(0);
    }
  });
});

describe("skill and agent cases", () => {
  // evals/skills/<n>/<n>.cases.ts and evals/agents/<n>/<n>.cases.ts
  const caseFiles = ["skills", "agents"].flatMap((tier) => {
    const dir = join(EVALS_DIR, tier);
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .flatMap((d) =>
        readdirSync(join(dir, d.name))
          .filter((f) => f.endsWith(".cases.ts"))
          .map((f) => join(tier, d.name, f)),
      );
  });

  test("there are case files to check", () => {
    expect(caseFiles.length).toBeGreaterThan(0);
  });

  test.each(caseFiles)("%s: every case can fail (it has grounding or practices)", async (rel) => {
    const mod = (await import(pathToFileURL(join(EVALS_DIR, rel)).href)) as {
      cases: Array<{ name: string; grounding?: string[]; practices?: string[] }>;
    };
    const empty = mod.cases.filter((c) => !c.grounding?.length && !c.practices?.length).map((c) => c.name);
    expect(empty, "a case with neither would pass without asserting anything").toEqual([]);
  });
});

describe("CI workflows", () => {
  const dir = join(REPO_ROOT, ".github", "workflows");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)) : [];
  // Comments are not configuration: a file may explain why it avoids pull_request_target.
  const text = (f: string) =>
    readFileSync(join(dir, f), "utf8")
      .split("\n")
      .filter((l) => !/^\s*#/.test(l))
      .join("\n");

  test("there are workflows to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test.each(files)("%s declares its permissions and grants none that write", (f) => {
    const t = text(f);
    expect(t, "no top-level `permissions:`: the token would get the repository default").toMatch(/^permissions:/m);
    const writes = t.split("\n").filter((l) => /^\s+[a-z-]+:\s*write\s*$/.test(l));
    expect(writes, "a write permission needs a reason and an explicit entry here").toEqual([]);
  });

  test.each(files)("%s does not use pull_request_target", (f) => {
    // It runs with the base repository's secrets and write token on a fork's code.
    expect(text(f)).not.toMatch(/pull_request_target/);
  });

  test.each(files)("%s: a job that uses a secret on pull_request refuses a fork's PR", (f) => {
    const t = text(f);
    const usesSecret = /\$\{\{\s*secrets\.(?!GITHUB_TOKEN)/.test(t);
    const onPullRequest = /^\s{2}pull_request:/m.test(t);
    if (!usesSecret || !onPullRequest) return;
    expect(t, "a secret is used on pull_request with no fork guard").toMatch(
      /github\.event\.pull_request\.head\.repo\.full_name\s*==\s*github\.repository/,
    );
  });
});
