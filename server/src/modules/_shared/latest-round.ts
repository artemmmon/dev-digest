/**
 * "The PR's latest review round" rule (server INSIGHTS.md `:77`): one click on Run
 * Review starts every enabled agent under one `agent_runs.batch_id`, so the round a
 * PR-level summary must use is every review in that batch, not the newest review row.
 * Pure — no DB. Shared by the PR list (`pulls/cost.ts`, `pulls/findings.ts`) and Smart
 * Diff (`smart-diff/service.ts`) so the two features never disagree about which round
 * is "latest" for a PR.
 */

export interface ReviewRow {
  prId: string;
  id: string;
  runId: string | null;
}

export interface RunRow {
  prId: string | null;
  id: string;
  batchId: string | null;
}

/**
 * The batch id of each PR's newest run. `rows` MUST be newest-first. This is what
 * "the PR's latest review" means everywhere on the list — one click on Run Review
 * starts several agents, so the newest single run (or review) is an arbitrary one
 * of them, not the round.
 */
export function latestBatchByPr(rows: { prId: string | null; batchId: string | null }[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const r of rows) {
    if (!r.prId || !r.batchId) continue;
    if (!latest.has(r.prId)) latest.set(r.prId, r.batchId);
  }
  return latest;
}

/**
 * Review ids making up each PR's latest round. Both row sets MUST be newest-first;
 * `latestBatch` comes from `latestBatchByPr`.
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
