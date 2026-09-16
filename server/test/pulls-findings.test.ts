/**
 * PR-list FINDINGS/SCORE rollup (`modules/pulls/findings.ts`) — both describe the
 * PR's latest review ROUND (one `agent_runs.batch_id`), not its newest review row.
 */
import { describe, it, expect } from 'vitest';
import {
  latestRoundReviewIds,
  roundScoreByPr,
  severityByPr,
  type ReviewRow,
  type RunRow,
} from '../src/modules/pulls/findings.js';
import { latestBatchByPr } from '../src/modules/pulls/cost.js';

/** The real incident: one Run Review click, three agents, newest one found nothing. */
const RUNS: RunRow[] = [
  { prId: 'pr1', id: 'run-perf', batchId: 'b2' },
  { prId: 'pr1', id: 'run-sec', batchId: 'b2' },
  { prId: 'pr1', id: 'run-gen', batchId: 'b2' },
  { prId: 'pr1', id: 'run-old', batchId: 'b1' },
];
const REVIEWS: ReviewRow[] = [
  { prId: 'pr1', id: 'rv-perf', runId: 'run-perf' },
  { prId: 'pr1', id: 'rv-sec', runId: 'run-sec' },
  { prId: 'pr1', id: 'rv-gen', runId: 'run-gen' },
  { prId: 'pr1', id: 'rv-old', runId: 'run-old' },
];

describe('latestRoundReviewIds', () => {
  it('takes every review of the latest batch, not just the newest one', () => {
    const round = latestRoundReviewIds(REVIEWS, RUNS, latestBatchByPr(RUNS));
    expect(round.get('pr1')).toEqual(['rv-perf', 'rv-sec', 'rv-gen']);
  });

  it('falls back to the newest review when the PR has no batched run', () => {
    const reviews: ReviewRow[] = [
      { prId: 'pr9', id: 'rv-new', runId: null },
      { prId: 'pr9', id: 'rv-old', runId: null },
    ];
    const round = latestRoundReviewIds(reviews, [], new Map());
    expect(round.get('pr9')).toEqual(['rv-new']);
  });

  it('keeps PRs independent', () => {
    const runs: RunRow[] = [...RUNS, { prId: 'pr2', id: 'run-x', batchId: 'c1' }];
    const reviews: ReviewRow[] = [...REVIEWS, { prId: 'pr2', id: 'rv-x', runId: 'run-x' }];
    const round = latestRoundReviewIds(reviews, runs, latestBatchByPr(runs));
    expect(round.get('pr2')).toEqual(['rv-x']);
    expect(round.get('pr1')).toHaveLength(3);
  });
});

describe('severityByPr', () => {
  it('sums the whole round — a clean agent does not hide a rejecting one', () => {
    const round = latestRoundReviewIds(REVIEWS, RUNS, latestBatchByPr(RUNS));
    const counts = severityByPr(round, [
      { reviewId: 'rv-gen', severity: 'CRITICAL' },
      { reviewId: 'rv-gen', severity: 'WARNING' },
      { reviewId: 'rv-gen', severity: 'WARNING' },
      { reviewId: 'rv-gen', severity: 'SUGGESTION' },
      { reviewId: 'rv-sec', severity: 'SUGGESTION' },
      { reviewId: 'rv-old', severity: 'CRITICAL' }, // previous round — ignored
    ]);
    expect(counts.get('pr1')).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 2 });
  });

  it('gives a round that found nothing all-zero counts, not absence', () => {
    const counts = severityByPr(new Map([['pr1', ['rv-perf']]]), []);
    expect(counts.get('pr1')).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });

  it('omits PRs that were never reviewed', () => {
    expect(severityByPr(new Map(), [{ reviewId: 'rv1', severity: 'CRITICAL' }]).size).toBe(0);
  });

  it('ignores severities outside the contract enum', () => {
    const counts = severityByPr(new Map([['pr1', ['rv1']]]), [
      { reviewId: 'rv1', severity: 'INFO' },
      { reviewId: 'rv1', severity: 'CRITICAL' },
    ]);
    expect(counts.get('pr1')).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
  });
});

describe('roundScoreByPr', () => {
  it('reports the worst score of the round', () => {
    const round = latestRoundReviewIds(REVIEWS, RUNS, latestBatchByPr(RUNS));
    const scores = roundScoreByPr(
      round,
      new Map([
        ['rv-perf', 100],
        ['rv-sec', 97],
        ['rv-gen', 38],
        ['rv-old', 12],
      ]),
    );
    expect(scores.get('pr1')).toBe(38);
  });

  it('is null when no review in the round scored', () => {
    const scores = roundScoreByPr(new Map([['pr1', ['rv-perf']]]), new Map([['rv-perf', null]]));
    expect(scores.get('pr1')).toBeNull();
  });
});
