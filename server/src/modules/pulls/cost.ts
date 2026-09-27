/**
 * PR-list COST rollup (pure — no DB, unit-tests cleanly).
 *
 * A "batch" is every agent run started by one review request (`agent_runs.batch_id`).
 * The list shows the cost of each PR's LATEST batch: the batch of its newest run.
 */

import type { BatchCostRow } from './ports.js';
export type { BatchCostRow };
import { latestBatchByPr } from '../_shared/latest-round.js';
export { latestBatchByPr };

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
