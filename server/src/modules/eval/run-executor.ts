import { reviewPullRequest } from '@devdigest/reviewer-core';
import type { EvalCaseResult, LLMProvider } from '@devdigest/shared';
import { REVIEW_STRATEGY, reviewRulesText, skillBlockText } from '../reviews/index.js';
import { appliedSkills, prepareCaseDiff } from './case-rules.js';
import {
  EVAL_CASE_TIMEOUT_MS,
  FINDING_TITLE_MAX_CHARS,
  RESULT_FINDINGS_MAX,
  TASK_PREFIX,
} from './constants.js';
import type { CapturedCase, EvalLogger, EvalStore, RunCapture } from './ports.js';
import { aggregate, runStatus, scoreCase } from './scoring.js';

/**
 * Runs the cases of one captured eval run, one after the other. Each case is reviewed by the
 * same engine and the same deterministic pre-processing as a pull request, but is given
 * nothing else: no intent, scope, callers, repo map, context documents or memory (AC-20).
 * A throw, an invalid output or a time-out records that case as `error` and the run goes on.
 * Only counts and ids are logged, never prompt or finding text; a provider's own message is
 * neither logged nor stored.
 */

class DeadlineError extends Error {}

/** Rejects with `DeadlineError` when `work` has not settled in `ms`; the timer never outlives the race. */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError()), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/**
 * `ReviewInput` has no transport slot, so the engine cannot ask for "exactly one HTTP request".
 * Wrap the provider: every structured call gets `transportRetries: 0`, `maxRetries: 0` and the
 * case's deadline as its request timeout.
 */
function singleRequest(llm: LLMProvider, timeoutMs: number): LLMProvider {
  return {
    id: llm.id,
    listModels: () => llm.listModels(),
    complete: (req) => llm.complete(req),
    embed: (texts) => llm.embed(texts),
    completeStructured: (req) =>
      llm.completeStructured({ ...req, maxRetries: 0, transportRetries: 0, timeoutMs }),
  };
}

/** The case's PR title is carried as one bounded line inside the fenced PR description. */
function oneLine(text: string, max: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

export interface RunExecutorDeps {
  store: EvalStore;
  logger?: EvalLogger;
  now?: () => number;
}

export class EvalRunExecutor {
  constructor(private deps: RunExecutorDeps) {}

  /**
   * Process every captured case, then aggregate and finish the run. Never throws for a case;
   * a store failure at any point ends the run as `failed`.
   */
  async run(capture: RunCapture): Promise<void> {
    const { store, logger } = this.deps;
    const llm = singleRequest(capture.llm, EVAL_CASE_TIMEOUT_MS);
    const counts = { pass: 0, fail: 0, error: 0 };
    try {
      for (const c of capture.cases) {
        const result = await this.runCase(capture, llm, c);
        counts[result.status] += 1;
        const stored = await store.recordCaseResult(capture.runId, result);
        // The run was ended or reaped under us: nothing more may be written to it.
        if (!stored) return;
      }

      const rows = await store.caseResults([capture.runId]);
      const agg = aggregate(rows.map((r) => r.result));
      const status = runStatus(agg.cases_completed, agg.cases_errored);
      await store.finishRun(capture.runId, status, {
        recall: agg.recall,
        precision: agg.precision,
        citationAccuracy: agg.citation_accuracy,
        unlabelledFindings: agg.unlabelled_findings,
        costUsd: agg.cost_usd,
      });
      logger?.info(
        {
          runId: capture.runId,
          outcome: status,
          casesPassed: counts.pass,
          casesFailed: counts.fail,
          casesErrored: counts.error,
        },
        'eval run finished',
      );
    } catch (err) {
      // A store failure anywhere (a case result, the aggregate, the final write) must still release
      // the agent's `running` claim, or `eval_runs_one_running_uq` answers 409 until the next boot.
      logger?.warn(
        { runId: capture.runId, outcome: 'store_error', error: err instanceof Error ? err.name : 'unknown' },
        'eval run could not be stored',
      );
      await this.finishFailed(capture.runId);
    }
  }

  private async finishFailed(runId: string): Promise<void> {
    try {
      await this.deps.store.finishRun(runId, 'failed', {
        recall: null,
        precision: null,
        citationAccuracy: null,
        unlabelledFindings: 0,
        costUsd: null,
      });
    } catch {
      // the store is unreachable; the boot reaper ends the run
    }
  }

  /** One case: prepare → review → score. Any failure becomes an `error` result. */
  private async runCase(
    capture: RunCapture,
    llm: LLMProvider,
    c: CapturedCase,
  ): Promise<EvalCaseResult> {
    const now = this.deps.now ?? Date.now;
    const t0 = now();
    const expectedCount = c.expectedOutput.type === 'must_find' ? 1 : 0;
    try {
      const { diff, paths } = prepareCaseDiff(c.inputDiff);
      const skills = appliedSkills(capture.skills, paths).map((s) => skillBlockText(s.name, s.body));
      // PR-author text (title and body) goes only into `prDescription`, which the engine fences as
      // untrusted; the task line carries no author text.
      const title = oneLine(c.inputMeta.pr_title, 200);
      const body = c.inputMeta.pr_body?.trim() ? `\n\n${c.inputMeta.pr_body}` : '';
      const outcome = await withDeadline(
        reviewPullRequest({
          systemPrompt: capture.agent.systemPrompt,
          model: capture.agent.model,
          diff,
          llm,
          strategy: capture.agent.strategy ?? REVIEW_STRATEGY,
          ...(skills.length > 0 ? { skills } : {}),
          prDescription: `Title: ${title}${body}`,
          task: `${TASK_PREFIX}. ${reviewRulesText()}`,
          maxRetries: 0,
          sessionId: `eval:${capture.runId}:${c.id}`,
        }),
        EVAL_CASE_TIMEOUT_MS,
      );
      const kept = outcome.review.findings;
      const score = scoreCase(c.expectedOutput, kept, outcome.dropped.length);
      this.deps.logger?.info(
        { runId: capture.runId, caseId: c.id, outcome: score.status, kept: score.kept, dropped: score.dropped },
        'eval case finished',
      );
      return {
        case_id: c.id,
        status: score.status,
        expected_count: score.expected_count,
        matched_count: score.matched_count,
        kept: score.kept,
        dropped: score.dropped,
        findings: kept.slice(0, RESULT_FINDINGS_MAX).map((f) => ({
          file: f.file,
          start_line: f.start_line,
          end_line: f.end_line,
          title: f.title.slice(0, FINDING_TITLE_MAX_CHARS),
        })),
        duration_ms: Math.max(0, now() - t0),
        cost_usd: outcome.costUsd,
      };
    } catch (err) {
      this.deps.logger?.info(
        {
          runId: capture.runId,
          caseId: c.id,
          outcome: err instanceof DeadlineError ? 'timeout' : 'error',
          error: err instanceof Error ? err.name : 'unknown',
        },
        'eval case finished',
      );
      return {
        case_id: c.id,
        status: 'error',
        expected_count: expectedCount,
        matched_count: 0,
        kept: 0,
        dropped: 0,
        findings: [],
        duration_ms: Math.max(0, now() - t0),
        cost_usd: null,
      };
    }
  }
}
