/**
 * PR-list COST rollup (pure — no DB, unit-tests cleanly).
 *
 * A "batch" is every agent run started by one review request (`agent_runs.batch_id`).
 * The list shows the cost of each PR's LATEST batch: the batch of its newest run.
 */

export interface BatchCostRow {
  prId: string | null;
  batchId: string | null;
  costUsd: number | null;
}

/**
 * Sum of known `costUsd` in each PR's latest batch. `rows` MUST be newest-first.
 * A batch with no priced run yet (still running, all failed) maps to `null` —
 * the UI shows "—", not "$0.00". Rows without a PR or batch are ignored.
 */
export function latestBatchCostByPr(rows: BatchCostRow[]): Map<string, number | null> {
  const latestBatch = latestBatchByPr(rows);
  const cost = new Map<string, number | null>();
  for (const prId of latestBatch.keys()) cost.set(prId, null);
  for (const r of rows) {
    if (!r.prId || !r.batchId) continue;
    if (latestBatch.get(r.prId) !== r.batchId || r.costUsd == null) continue;
    cost.set(r.prId, (cost.get(r.prId) ?? 0) + r.costUsd);
  }
  return cost;
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
