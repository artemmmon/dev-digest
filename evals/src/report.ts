/**
 * Green/red checklist of the newest eval runs, from results/records.jsonl. No model calls.
 *
 *   pnpm eval:report                 # the last 2 runs of every case
 *   pnpm eval:report --runs 1
 *   pnpm eval:report --only group    # labels containing "group"
 *
 * Prints markdown to stdout and, when GITHUB_STEP_SUMMARY is set (a GitHub Actions step), appends
 * the same text to the job summary. A workflow case is shown check by check (each file it had to
 * read, each skill and subagent, each judged practice); any other record shows its judged practices.
 */

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RESULTS_DIR } from "./artifacts/paths.js";
import { cases } from "../workflow/review-workflow.cases.js";
import type { WorkflowCase } from "./index.js";

const GREEN = "🟢";
const RED = "🔴";

interface Row {
  label: string;
  outcome: boolean;
  num_turns: number;
  metrics?: { durationMs?: number };
  practices?: Array<{ practice: string; passed: boolean; evidence?: string }>;
  trace?: { reads: string[]; subagents: string[]; skills: string[] };
  score?: number;
  threshold?: number;
  grounded?: number;
  control?: boolean;
  git_sha?: string;
  config?: string;
}

type Check = { text: string; ok: boolean; evidence?: string };

const mark = (ok: boolean) => (ok ? GREEN : RED);
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function loadRows(): Row[] {
  const file = join(RESULTS_DIR, "records.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Row);
}

/** A skill counts as engaged when the Skill tool named it, or when its SKILL.md was read. */
function engaged(name: string, row: Row): boolean {
  const t = row.trace;
  if (!t) return false;
  return (
    t.skills.some((s) => s === name || s.endsWith(`:${name}`)) ||
    t.reads.some((f) => f.includes(`skills/${name}/SKILL.md`))
  );
}

/** Every individual expectation of one record, as a flat list. */
function checks(row: Row, c: WorkflowCase | undefined): Check[] {
  const out: Check[] = [];
  const t = row.trace;
  if (c && c.kind === "trace" && t) {
    for (const f of c.expectFilesRead ?? []) out.push({ text: `read \`${f}\``, ok: t.reads.some((p) => p.includes(f)) });
    for (const s of c.expectSkills ?? []) out.push({ text: `skill \`${s}\` engaged`, ok: engaged(s, row) });
    for (const a of c.expectSubagents ?? []) out.push({ text: `subagent \`${a}\` launched`, ok: t.subagents.includes(a) });
    for (const a of c.expectNoSubagents ?? []) out.push({ text: `subagent \`${a}\` not launched`, ok: !t.subagents.includes(a) });
    for (const s of c.expectNoSkills ?? []) out.push({ text: `skill \`${s}\` not engaged`, ok: !engaged(s, row) });
    for (const f of c.expectNoFilesRead ?? []) out.push({ text: `did not read \`${f}\``, ok: !t.reads.some((p) => p.includes(f)) });
  }
  for (const p of row.practices ?? []) out.push({ text: p.practice, ok: !!p.passed, evidence: p.evidence });
  if (out.length === 0) out.push({ text: "case passed", ok: row.outcome });
  return out;
}

function main(): void {
  const argv = process.argv.slice(2);
  let runs = 2;
  let only = "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--runs") runs = Math.max(1, Number(argv[++i]) || 2);
    else if (argv[i] === "--only") only = argv[++i] ?? "";
  }

  const rows = loadRows().filter((r) => !r.control && r.label.includes(only));
  if (rows.length === 0) {
    console.log("No records in results/records.jsonl.");
    return;
  }

  const byLabel = new Map<string, Row[]>();
  for (const r of rows) byLabel.set(r.label, [...(byLabel.get(r.label) ?? []), r]);
  const byName = new Map<string, WorkflowCase>(cases.map((c) => [c.name, c]));

  const last = rows[rows.length - 1];
  const out: string[] = [
    `## Evals report`,
    "",
    `model \`${process.env.EVAL_MODEL ?? "default"}\` · judge \`${process.env.EVAL_JUDGE_MODEL ?? "default"}\` · commit \`${last.git_sha ?? "?"}\``,
    "",
  ];

  let green = 0;
  let total = 0;
  const detail: string[] = [];

  for (const [label, all] of byLabel) {
    const picked = all.slice(-runs);
    const lists = picked.map((r) => checks(r, byName.get(label)));
    const caseOk = picked.every((r, i) => r.outcome && lists[i].every((c) => c.ok));
    const anyOk = picked.some((r, i) => r.outcome && lists[i].every((c) => c.ok));
    const head = caseOk ? GREEN : anyOk ? "🟡" : RED;
    const secs = picked.map((r) => ((r.metrics?.durationMs ?? 0) / 1000).toFixed(0)).join(" / ");
    const turns = picked.map((r) => r.num_turns).join(" / ");

    detail.push(`### ${head} ${cell(label)}`, "", `turns ${turns} · seconds ${secs}`, "");
    const header = ["check", ...picked.map((_, i) => `run ${i + 1}`)];
    detail.push(`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`);
    const keys = lists[0].map((c) => c.text);
    keys.forEach((text, idx) => {
      const marks = lists.map((l) => (l[idx] ? mark(l[idx].ok) : "⚪"));
      detail.push(`| ${cell(short(text, 150))} | ${marks.join(" | ")} |`);
      // Totals follow the newest run, so the headline is one number per check, not per run.
      total++;
      if (lists[lists.length - 1][idx]?.ok) green++;
    });
    const misses = lists.flatMap((l, run) =>
      l.filter((c) => !c.ok && c.evidence).map((c) => `- run ${run + 1}: ${cell(short(c.text, 100))} — judge: «${cell(short(c.evidence ?? "", 160))}»`),
    );
    if (misses.length) detail.push("", ...misses);
    detail.push("");
  }

  out.push(`**${GREEN} ${green} of ${total} checks in the newest run, ${RED} ${total - green}.**`, "", ...detail);
  const text = out.join("\n");
  console.log(text);

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, `${text}\n`);
}

main();
