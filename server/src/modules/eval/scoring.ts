import type { EvalCaseResult, EvalExpectation, EvalRunStatus } from '@devdigest/shared';

/**
 * Deterministic scoring of eval runs (AC-29 to AC-36). Pure: contracts only, no model call, no
 * I/O (NFR-1). Line ranges are compared by their bounds, never walked.
 */

/** The part of a kept finding the scorer needs. */
export interface ScoredFinding {
  file: string;
  start_line: number;
  end_line: number;
}

/** Does a kept finding match an expectation? Same file, ranges intersect, bounds inclusive (AC-29). */
export function matches(finding: ScoredFinding, expectation: EvalExpectation): boolean {
  const lo = Math.min(finding.start_line, finding.end_line);
  const hi = Math.max(finding.start_line, finding.end_line);
  return (
    finding.file === expectation.file && lo <= expectation.end_line && expectation.start_line <= hi
  );
}

/** What one completed case contributes to a run. */
export interface CaseScore {
  status: 'pass' | 'fail';
  /** 1 for `must_find`, 0 for `must_not_flag` (AC-16). */
  expected_count: number;
  /** Kept findings matching the expectation. */
  matched_count: number;
  kept: number;
  dropped: number;
}

/** AC-30: `must_find` passes with one or more matches, `must_not_flag` with none. */
export function scoreCase(
  expectation: EvalExpectation,
  kept: ScoredFinding[],
  droppedCount: number,
): CaseScore {
  const matched = kept.filter((f) => matches(f, expectation)).length;
  const mustFind = expectation.type === 'must_find';
  const pass = mustFind ? matched >= 1 : matched === 0;
  return {
    status: pass ? 'pass' : 'fail',
    expected_count: mustFind ? 1 : 0,
    matched_count: matched,
    kept: kept.length,
    dropped: droppedCount,
  };
}

/** The run-level numbers computed from the completed cases of a run. */
export interface RunAggregate {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  unlabelled_findings: number;
  cost_usd: number | null;
  cases_passed: number;
  cases_completed: number;
  cases_errored: number;
}

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);

/**
 * Metrics over the results of one run. `error` results are counted but never feed a metric.
 * A `must_find` case has `expected_count` 1, a `must_not_flag` case 0, so TP and FP come from
 * `matched_count` of the matching kind (AC-31 to AC-36). A zero denominator is null (AC-34).
 */
export function aggregate(results: EvalCaseResult[]): RunAggregate {
  const completed = results.filter((r) => r.status !== 'error');
  const mustFind = completed.filter((r) => r.expected_count === 1);
  const passedMustFind = mustFind.filter((r) => r.status === 'pass').length;
  const tp = mustFind.reduce((n, r) => n + r.matched_count, 0);
  const fp = completed
    .filter((r) => r.expected_count === 0)
    .reduce((n, r) => n + r.matched_count, 0);
  const kept = completed.reduce((n, r) => n + r.kept, 0);
  const dropped = completed.reduce((n, r) => n + r.dropped, 0);
  const unlabelled = completed.reduce((n, r) => n + Math.max(0, r.kept - r.matched_count), 0);

  const allPriced = completed.length > 0 && completed.every((r) => r.cost_usd !== null);
  const cost = allPriced
    ? Number(completed.reduce((n, r) => n + (r.cost_usd as number), 0).toFixed(8))
    : null;

  return {
    recall: ratio(passedMustFind, mustFind.length),
    precision: ratio(tp, tp + fp),
    citation_accuracy: ratio(kept, kept + dropped),
    unlabelled_findings: unlabelled,
    cost_usd: cost,
    cases_passed: completed.filter((r) => r.status === 'pass').length,
    cases_completed: completed.length,
    cases_errored: results.length - completed.length,
  };
}

/** AC-27: `done` without an errored case, `failed` when none completed, else `partial`. */
export function runStatus(completed: number, errored: number): Exclude<EvalRunStatus, 'running'> {
  if (errored === 0) return 'done';
  if (completed === 0) return 'failed';
  return 'partial';
}
