/* components/eval/helpers.ts — pure rules shared by the eval screens (Evals tab, dashboard, compare).
   The "counted run" rule (AC-66) lives here on the client; the server keeps its own copy. */
import type { EvalRunStatus, EvalRunSummary } from "@devdigest/shared";

/** The three scored metrics of a run, in display order. */
export const EVAL_METRICS = ["recall", "precision", "citation_accuracy"] as const;
export type EvalMetricKey = (typeof EVAL_METRICS)[number];

/** Smallest drop, in whole points, that raises a regression alert (AC-40). */
export const REGRESSION_MIN_POINTS = 1;

/** Shown in place of a metric or cost that has no value (AC-34, AC-36). */
export const NO_VALUE = "—";

const COUNTED: readonly EvalRunStatus[] = ["done", "partial"];

/** A run counts for outcomes, cards, deltas, alerts, dashboard rows and trend points only when it is `done` or `partial` (AC-66). */
export function isCounted(run: Pick<EvalRunSummary, "status">): boolean {
  return COUNTED.includes(run.status);
}

/** The newest two counted runs (latest first), whatever order `runs` arrives in; a missing one is null. */
export function latestTwoCounted(runs: readonly EvalRunSummary[]): {
  latest: EvalRunSummary | null;
  previous: EvalRunSummary | null;
} {
  const counted = runs
    .filter(isCounted)
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  return { latest: counted[0] ?? null, previous: counted[1] ?? null };
}

/** A 0..1 metric as a whole percentage, or null when there is no value. */
export function pct(value: number | null | undefined): number | null {
  return value == null ? null : Math.round(value * 100);
}

/** `42%`, or `—` when the metric has no value. */
export function formatMetric(value: number | null | undefined): string {
  const p = pct(value);
  return p == null ? NO_VALUE : `${p}%`;
}

/** Change of a metric in whole points (positive = improved); null when either side has no value. */
export function deltaPoints(
  latest: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  const a = pct(latest);
  const b = pct(previous);
  return a == null || b == null ? null : a - b;
}

export interface Regression {
  metric: EvalMetricKey;
  /** How far the metric fell, in whole points (≥ 1). */
  drop: number;
}

/** Metrics where `latest` is lower than `previous` by at least one whole point (AC-40). */
export function regressions(
  latest: EvalRunSummary | null | undefined,
  previous: EvalRunSummary | null | undefined,
): Regression[] {
  if (!latest || !previous) return [];
  const out: Regression[] = [];
  for (const metric of EVAL_METRICS) {
    const change = deltaPoints(latest[metric], previous[metric]);
    if (change != null && -change >= REGRESSION_MIN_POINTS) out.push({ metric, drop: -change });
  }
  return out;
}

/** i18n key (under `eval.metricCards`) of each scored metric. */
export const METRIC_LABEL_KEY: Record<EvalMetricKey, string> = {
  recall: "recall",
  precision: "precision",
  citation_accuracy: "citationAccuracy",
};

/** Cases a run has finished so far, passed or errored: the `k` of `k / n cases` (AC-22). */
export function runProgress(run: Pick<EvalRunSummary, "cases_completed" | "cases_errored">): number {
  return run.cases_completed + run.cases_errored;
}

/** `passed / completed` cases of a run (AC-37, AC-38). */
export function passedOfCompleted(run: Pick<EvalRunSummary, "cases_passed" | "cases_completed">): string {
  return `${run.cases_passed} / ${run.cases_completed}`;
}
