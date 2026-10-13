/**
 * Case types + the runners that turn a data array into vitest tests. This module owns the ONE
 * true measure → (log) → assert body, so case authors never rewrite it — which is exactly what
 * keeps the "assert before record" bug from recurring once record() lands (T2 slots into the
 * marked spot below, in this one file).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "vitest";
import {
  DEFAULT_THRESHOLD,
  WORKFLOW_ALLOWED_TOOLS,
  WORKFLOW_CONTROL,
  WORKFLOW_DISALLOWED_TOOLS,
} from "../config.js";
import { skillTask, agentTask, workflowTask } from "../tasks.js";
import { runClaude, type Result, type RunOptions } from "../runtime/run-claude.js";
import { patternMatch } from "../scoring/pattern-match.js";
import { llmJudge, type Verdict } from "../scoring/llm-judge.js";
import { logTrace, logVerdict } from "../logging/log.js";
import { record } from "../records/record.js";

// --- Case shapes ------------------------------------------------------------

/** A judge-and-grounding case. Same shape for skills and agents; only the task differs. */
export interface QualityCase {
  name: string;
  kind?: "quality" | "grounding";
  prompt: string;
  /** Practices the judge scores (quality). Omit for a pure grounding case. */
  practices?: string[];
  /** Substrings that must ALL appear before the judge runs (cheap-tier gate). */
  grounding?: string[];
  /** Judge score gate (default 0.6). */
  threshold?: number;
  maxTurns?: number;
}
export type SkillCase = QualityCase;
export type AgentCase = QualityCase;

/** A trace-asserted workflow case — a discriminated union routed by `kind`. */
export type WorkflowCase =
  | { kind: "dispatch"; name: string; prompt: string; expectSubagent: string; maxTurns?: number }
  | {
      kind: "activation";
      name: string;
      prompt: string;
      skill: string;
      shouldActivate: boolean;
      maxTurns?: number;
    }
  | {
      kind: "contrast";
      name: string;
      prompt: string;
      expectFileRead: string;
      tools?: string[];
      maxTurns?: number;
    }
  | {
      // A single-session composite: run ONE workflowTask and assert several trace facets at once.
      // Cheaper than separate dispatch/activation/contrast cases (one session, not N) at the cost
      // of coarser diagnostics and no control run — use contrast when you must isolate CLAUDE.md's
      // contribution. Every provided expectation must hold; omitted fields are not checked.
      //
      // A prompt may carry several independent numbered tasks, so one session covers a whole group
      // of rules. All misses are collected and reported together, so a failing group says which
      // expectations broke instead of stopping at the first one.
      kind: "trace";
      name: string;
      prompt: string;
      expectSubagents?: string[];
      expectSkills?: string[];
      /** Substring of a path the session must have read. */
      expectFilesRead?: string[];
      /** Subagents that must NOT be launched. Decided at dispatch, so it does not hold up an early stop. */
      expectNoSubagents?: string[];
      /** Skills that must NOT engage. Needs the whole session, so it turns early stop off. */
      expectNoSkills?: string[];
      /** Substrings of paths that must NOT be read. Needs the whole session, like expectNoSkills. */
      expectNoFilesRead?: string[];
      /**
       * Practices a judge scores on the final answer (one judge call, `threshold` default from
       * config). For rules a read or a skill call cannot show: what the agent says it would do.
       * Needs the final text, so it turns early stop off.
       */
      practices?: string[];
      threshold?: number;
      /**
       * With `practices`: also run the same prompt as a control (empty folder, no CLAUDE.md, skills
       * or agents) when EVAL_CONTROL is set, and record its verdict as `<name> [control]`. The
       * control is never asserted; it shows which practices the harness actually contributes.
       */
      control?: boolean;
      maxTurns?: number;
    };

/** Did a skill engage? Either an explicit Skill tool-call, or reading its SKILL.md. */
export function activated(result: Pick<Result, "skillsInvoked" | "filesRead">, skill: string): boolean {
  const bySkill = result.skillsInvoked.some((s) => s === skill || s.endsWith(`:${skill}`));
  const byRead = result.filesRead.some((f) => f.includes(`skills/${skill}/SKILL.md`));
  return bySkill || byRead;
}

type TraceCase = Extract<WorkflowCase, { kind: "trace" }>;
type Trace = Pick<Result, "subagents" | "skillsInvoked" | "filesRead" | "isError">;

/** Every trace expectation the session did not meet, as readable lines. Empty means the trace passes. */
export function traceMisses(c: TraceCase, r: Trace): string[] {
  const misses: string[] = [];
  const reads = r.filesRead.join(", ") || "none";
  for (const s of c.expectSubagents ?? []) {
    if (!r.subagents.includes(s)) misses.push(`subagent not launched: ${s} (launched: ${r.subagents.join(", ") || "none"})`);
  }
  for (const s of c.expectSkills ?? []) {
    if (!activated(r, s)) misses.push(`skill not engaged: ${s} (skills: ${r.skillsInvoked.join(", ") || "none"})`);
  }
  for (const f of c.expectFilesRead ?? []) {
    if (!r.filesRead.some((p) => p.includes(f))) misses.push(`file not read: ${f} (reads: ${reads})`);
  }
  for (const s of c.expectNoSubagents ?? []) {
    if (r.subagents.includes(s)) misses.push(`subagent launched but must not be: ${s}`);
  }
  for (const s of c.expectNoSkills ?? []) {
    if (activated(r, s)) misses.push(`skill engaged but must not be: ${s}`);
  }
  for (const f of c.expectNoFilesRead ?? []) {
    const hit = r.filesRead.find((p) => p.includes(f));
    if (hit) misses.push(`file read but must not be: ${f} (read ${hit})`);
  }
  if (r.isError) misses.push("session ended in error (max turns or SDK failure)");
  return misses;
}

// --- Runners ----------------------------------------------------------------

type Task = (prompt: string, artifact: string, opts?: RunOptions) => Promise<Result>;

function runQualityCases(artifact: string, cases: QualityCase[], task: Task): void {
  for (const c of cases) {
    // Both are optional in the type; a case with neither runs a paid session and asserts nothing.
    if (!c.grounding?.length && !c.practices?.length) {
      throw new Error(`quality case "${c.name}" has neither grounding nor practices: it could not fail`);
    }
    test(c.name, async () => {
      const threshold = c.threshold ?? DEFAULT_THRESHOLD;
      const result = await task(c.prompt, artifact, { maxTurns: c.maxTurns });
      logTrace(c.name, result);

      // measure → record → assert. Everything measurable runs in the try; record() fires in the
      // finally with whatever accumulated; the asserts happen strictly after. A failing config
      // (e.g. baseline: grounding gate fails, judge skipped) still leaves a record.
      let grounded: number | undefined;
      let verdict: Verdict | undefined;
      try {
        // Cheap deterministic tier first — the grounding gate. When it fails the judge is skipped.
        if (c.grounding?.length) grounded = patternMatch(result.text, c.grounding);
        if (c.practices?.length && (grounded === undefined || grounded === 1)) {
          verdict = await llmJudge(result.text, c.practices);
          logVerdict(c.name, verdict);
        }
      } finally {
        // A judge that threw leaves no verdict: that is a fail, not "the session did not crash".
        // (A gate failure leaves no verdict either, but record() already scores it as a fail.)
        const judgeFailed = !!c.practices?.length && verdict === undefined && (grounded === undefined || grounded === 1);
        record(c.name, { result, verdict, grounded, threshold, passed: judgeFailed ? false : undefined });
      }

      if (grounded !== undefined) {
        expect(grounded, `missing concrete evidence; output:\n${result.text}`).toBe(1);
      }
      if (verdict) {
        expect(verdict.score, JSON.stringify(verdict.results)).toBeGreaterThanOrEqual(threshold);
      }
    });
  }
}

export const runSkillCases = (skill: string, cases: SkillCase[]) => runQualityCases(skill, cases, skillTask);
export const runAgentCases = (agent: string, cases: AgentCase[]) => runQualityCases(agent, cases, agentTask);

/** The same prompt with no harness: an empty folder, no on-disk config. Recorded, never asserted. */
async function runControl(c: TraceCase): Promise<void> {
  const emptyCwd = mkdtempSync(join(tmpdir(), "eval-control-"));
  let result: Result;
  try {
    result = await runClaude(c.prompt, {
      allowedTools: WORKFLOW_ALLOWED_TOOLS,
      disallowedTools: WORKFLOW_DISALLOWED_TOOLS,
      maxTurns: c.maxTurns,
      cwd: emptyCwd,
      settingSources: [],
    });
  } finally {
    rmSync(emptyCwd, { recursive: true, force: true });
  }
  const label = `${c.name} [control]`;
  logTrace(label, result);
  const threshold = c.threshold ?? DEFAULT_THRESHOLD;
  let verdict: Verdict | undefined;
  try {
    if (c.practices?.length && result.text) {
      verdict = await llmJudge(result.text, c.practices);
      logVerdict(label, verdict);
    }
  } finally {
    record(label, {
      result,
      verdict,
      threshold: verdict ? threshold : undefined,
      passed: verdict ? verdict.score >= threshold : false,
      extra: { control: true },
    });
  }
}

export function runWorkflowCases(cases: WorkflowCase[]): void {
  for (const c of cases) {
    test(c.name, async () => {
      if (c.kind === "dispatch") {
        // Stop the moment the subagent is launched — no need to wait out its nested session.
        const expect1 = c.expectSubagent;
        const result = await workflowTask(c.prompt, {
          maxTurns: c.maxTurns,
          stopWhen: (p) => p.subagents.includes(expect1),
        });
        logTrace(c.name, result);
        const launched = result.subagents.includes(c.expectSubagent);
        try {
          expect(result.subagents, `subagents: ${result.subagents.join(", ")}`).toContain(c.expectSubagent);
        } finally {
          record(c.name, { result, passed: launched });
        }
      } else if (c.kind === "activation") {
        const result = await workflowTask(c.prompt, { maxTurns: c.maxTurns });
        logTrace(c.name, result);
        const engaged = activated(result, c.skill);
        try {
          expect(
            engaged,
            `skills: ${result.skillsInvoked.join(", ")} | reads: ${result.filesRead.join(", ")}`,
          ).toBe(c.shouldActivate);
        } finally {
          record(c.name, { result, passed: engaged === c.shouldActivate });
        }
      } else if (c.kind === "trace") {
        if (WORKFLOW_CONTROL === "only") {
          // Control only: the treatment already has its runs. Cases without a control do nothing.
          if (c.control && c.practices?.length) await runControl(c);
          return;
        }
        // One session, many asserts — every provided expectation is checked against the same trace.
        // Stop as soon as ALL positive expectations are satisfied (e.g. doc read + subagent
        // launched), so a dispatch-bearing trace doesn't pay for the nested subagent's full run.
        // A forbidden subagent ends the session too: that is already a miss.
        // Early stop is off when the case needs the whole session: absence of a read or a skill
        // cannot be shown before the end, and a judge needs the final answer.
        const subs = c.expectSubagents ?? [];
        const skls = c.expectSkills ?? [];
        const files = c.expectFilesRead ?? [];
        const noSubs = c.expectNoSubagents ?? [];
        const wholeSession =
          (c.practices?.length ?? 0) > 0 ||
          (c.expectNoSkills?.length ?? 0) > 0 ||
          (c.expectNoFilesRead?.length ?? 0) > 0 ||
          subs.length + skls.length + files.length === 0;
        const result = await workflowTask(c.prompt, {
          maxTurns: c.maxTurns,
          stopWhen: wholeSession
            ? undefined
            : (p) =>
                noSubs.some((s) => p.subagents.includes(s)) ||
                (subs.every((s) => p.subagents.includes(s)) &&
                  skls.every((s) => activated(p, s)) &&
                  files.every((f) => p.filesRead.some((r) => r.includes(f)))),
        });
        logTrace(c.name, result);

        const threshold = c.threshold ?? DEFAULT_THRESHOLD;
        const misses = traceMisses(c, result);
        let verdict: Verdict | undefined;
        try {
          if (c.practices?.length && result.text) {
            verdict = await llmJudge(result.text, c.practices);
            logVerdict(c.name, verdict);
          }
        } finally {
          // A judged case without a verdict (judge crashed, or the session gave no text) is a fail.
          const judged = c.practices?.length ? (verdict ? verdict.score >= threshold : false) : true;
          record(c.name, {
            result,
            verdict,
            threshold: verdict ? threshold : undefined,
            passed: misses.length === 0 && judged,
          });
        }
        // The control is recorded, never asserted: a failure of the control session itself must
        // not replace the treatment's own result below.
        // Only "1": "only" returned earlier, and "0" / "false" must not start a paid session.
        if (WORKFLOW_CONTROL === "1" && c.control && c.practices?.length) {
          try {
            await runControl(c);
          } catch (e) {
            console.warn(`control session failed for "${c.name}": ${e instanceof Error ? e.message : e}`);
          }
        }
        expect(misses, misses.join("\n")).toEqual([]);
        if (c.practices?.length) {
          expect(verdict, "nothing to judge: the session produced no answer text").toBeDefined();
          expect(verdict!.score, JSON.stringify(verdict!.results)).toBeGreaterThanOrEqual(threshold);
        }
      } else {
        // contrast: treatment (real harness) vs control (empty tmpdir, no on-disk config).
        const tools = c.tools ?? ["Read", "Grep", "Glob"];
        const treatment = await workflowTask(c.prompt, { allowedTools: tools, maxTurns: c.maxTurns });
        const emptyCwd = mkdtempSync(join(tmpdir(), "eval-control-"));
        let control: Result;
        try {
          control = await runClaude(c.prompt, {
            allowedTools: tools,
            maxTurns: c.maxTurns,
            cwd: emptyCwd,
            settingSources: [],
          });
        } finally {
          rmSync(emptyCwd, { recursive: true, force: true });
        }
        logTrace(`${c.name} [treatment]`, treatment);
        logTrace(`${c.name} [control]`, control);
        const treatmentRead = treatment.filesRead.some((f) => f.includes(c.expectFileRead));
        const controlRead = control.filesRead.some((f) => f.includes(c.expectFileRead));
        try {
          expect(treatmentRead, `treatment reads: ${treatment.filesRead.join(", ")}`).toBe(true);
          expect(controlRead, `control reads: ${control.filesRead.join(", ")}`).toBe(false);
        } finally {
          // One verdict for the case: it holds only when the harness made the difference. The control
          // row is tagged, so aggregate() does not pool it into the treatment's pass rate.
          record(`${c.name} [treatment]`, { result: treatment, passed: treatmentRead && !controlRead });
          record(`${c.name} [control]`, { result: control, passed: !controlRead, extra: { control: true } });
        }
      }
    });
  }
}
