import type { FindingsBySeverity } from '@devdigest/shared';
import { rollupSeverities } from './status.js';

/**
 * PR-list FINDINGS rollup (pure — no DB, unit-tests cleanly).
 *
 * The list summarises each PR's latest review ROUND, not its newest review row:
 * one click on Run Review starts every enabled agent, so the newest single review
 * is an arbitrary agent out of that round (the one that happened to finish last —
 * often a clean Performance pass next to a General run with four findings).
 * A round is the set of runs sharing an `agent_runs.batch_id`, exactly what the
 * COST column already sums.
 *
 * Reviews older than the batch feature have no `run_id`/`batch_id`; for those the
 * newest review alone is the round.
 */

import type { FindingSeverityRow, ReviewRow, RunRow } from './ports.js';
export type { FindingSeverityRow, ReviewRow, RunRow };

/**
 * Review ids making up each PR's latest round. Both row sets MUST be newest-first;
 * `latestBatch` comes from `latestBatchByPr` in `./cost.ts`.
 */
export function latestRoundReviewIds(
  reviewRows: ReviewRow[],
  runRows: RunRow[],
  latestBatch: Map<string, string>,
): Map<string, string[]> {
  const batchOfRun = new Map<string, string>();
  for (const run of runRows) if (run.batchId) batchOfRun.set(run.id, run.batchId);

  const byPr = new Map<string, string[]>();
  const newestReview = new Map<string, string>();
  for (const review of reviewRows) {
    if (!newestReview.has(review.prId)) newestReview.set(review.prId, review.id);
    const batch = review.runId ? batchOfRun.get(review.runId) : undefined;
    if (!batch || batch !== latestBatch.get(review.prId)) continue;
    const bucket = byPr.get(review.prId);
    if (bucket) bucket.push(review.id);
    else byPr.set(review.prId, [review.id]);
  }

  // No batched review for this PR (unbatched/seeded data) → the newest review is the round.
  for (const [prId, reviewId] of newestReview) {
    if (!byPr.has(prId)) byPr.set(prId, [reviewId]);
  }
  return byPr;
}

/**
 * Severity tally per PR over its round. A round that found nothing maps to
 * all-zero counts; PRs absent from `roundByPr` are absent from the result (the
 * route serialises them as `null` — "never reviewed").
 */
export function severityByPr(
  roundByPr: Map<string, string[]>,
  findingRows: FindingSeverityRow[],
): Map<string, FindingsBySeverity> {
  const byReview = new Map<string, FindingSeverityRow[]>();
  for (const f of findingRows) {
    const bucket = byReview.get(f.reviewId);
    if (bucket) bucket.push(f);
    else byReview.set(f.reviewId, [f]);
  }
  const out = new Map<string, FindingsBySeverity>();
  for (const [prId, reviewIds] of roundByPr) {
    const rows = reviewIds.flatMap((id) => byReview.get(id) ?? []);
    const c = rollupSeverities(rows);
    out.set(prId, { CRITICAL: c.critical, WARNING: c.warning, SUGGESTION: c.suggestion });
  }
  return out;
}

/**
 * Score shown for a PR = the WORST score of its round. Same reason as the tally:
 * a clean agent must not hide a rejecting one. `null` when no review in the round
 * produced a score.
 */
export function roundScoreByPr(
  roundByPr: Map<string, string[]>,
  scoreByReview: Map<string, number | null>,
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const [prId, reviewIds] of roundByPr) {
    const scores = reviewIds
      .map((id) => scoreByReview.get(id))
      .filter((s): s is number => typeof s === 'number');
    out.set(prId, scores.length > 0 ? Math.min(...scores) : null);
  }
  return out;
}
