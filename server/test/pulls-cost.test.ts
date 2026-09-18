/**
 * PR-list COST rollup (`modules/pulls/cost.ts`) — sums the latest review batch
 * per PR; unit coverage independent of the route's query.
 */
import { describe, it, expect } from 'vitest';
import { latestBatchCostByPr } from '../src/modules/pulls/cost.js';

describe('latestBatchCostByPr', () => {
  it('sums only the latest batch (rows newest first)', () => {
    const cost = latestBatchCostByPr([
      { prId: 'pr1', batchId: 'b2', costUsd: 0.01 },
      { prId: 'pr1', batchId: 'b2', costUsd: 0.004 },
      { prId: 'pr1', batchId: 'b1', costUsd: 1 },
    ]);
    expect(cost.get('pr1')).toBeCloseTo(0.014, 10);
  });

  it('skips runs without cost inside the latest batch', () => {
    const cost = latestBatchCostByPr([
      { prId: 'pr1', batchId: 'b2', costUsd: null },
      { prId: 'pr1', batchId: 'b2', costUsd: 0.002 },
    ]);
    expect(cost.get('pr1')).toBe(0.002);
  });

  it('is null when the latest batch has no priced run, even if an older one does', () => {
    const cost = latestBatchCostByPr([
      { prId: 'pr1', batchId: 'b2', costUsd: null },
      { prId: 'pr1', batchId: 'b1', costUsd: 0.5 },
    ]);
    expect(cost.has('pr1')).toBe(true);
    expect(cost.get('pr1')).toBeNull();
  });

  it('keeps PRs independent and ignores rows without PR or batch', () => {
    const cost = latestBatchCostByPr([
      { prId: 'pr1', batchId: null, costUsd: 9 },
      { prId: null, batchId: 'bx', costUsd: 9 },
      { prId: 'pr2', batchId: 'c1', costUsd: 0.003 },
      { prId: 'pr1', batchId: 'b1', costUsd: 0.001 },
    ]);
    expect(cost.get('pr1')).toBe(0.001);
    expect(cost.get('pr2')).toBe(0.003);
    expect(cost.has('pr3')).toBe(false);
  });
});
