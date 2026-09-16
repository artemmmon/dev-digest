/**
 * PR-list FINDINGS rollup (`modules/pulls/findings.ts`) — severity breakdown of each
 * PR's latest review; unit coverage independent of the route's queries.
 */
import { describe, it, expect } from 'vitest';
import { latestReviewIdByPr, severityByPr } from '../src/modules/pulls/findings.js';

describe('latestReviewIdByPr', () => {
  it('keeps the first row per PR (rows newest first)', () => {
    const latest = latestReviewIdByPr([
      { prId: 'pr1', id: 'rv2' },
      { prId: 'pr1', id: 'rv1' },
      { prId: 'pr2', id: 'rv9' },
    ]);
    expect(latest.get('pr1')).toBe('rv2');
    expect(latest.get('pr2')).toBe('rv9');
    expect(latest.has('pr3')).toBe(false);
  });
});

describe('severityByPr', () => {
  it('tallies only the findings of each PR latest review', () => {
    const latest = new Map([
      ['pr1', 'rv2'],
      ['pr2', 'rv9'],
    ]);
    const counts = severityByPr(latest, [
      { reviewId: 'rv2', severity: 'CRITICAL' },
      { reviewId: 'rv2', severity: 'WARNING' },
      { reviewId: 'rv2', severity: 'WARNING' },
      { reviewId: 'rv1', severity: 'CRITICAL' }, // older review — ignored
      { reviewId: 'rv9', severity: 'SUGGESTION' },
    ]);
    expect(counts.get('pr1')).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 0 });
    expect(counts.get('pr2')).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 1 });
  });

  it('gives a reviewed PR with no findings all-zero counts, not absence', () => {
    const counts = severityByPr(new Map([['pr1', 'rv1']]), []);
    expect(counts.get('pr1')).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });

  it('omits PRs that were never reviewed', () => {
    const counts = severityByPr(new Map(), [{ reviewId: 'rv1', severity: 'CRITICAL' }]);
    expect(counts.size).toBe(0);
  });

  it('ignores severities outside the contract enum', () => {
    const counts = severityByPr(new Map([['pr1', 'rv1']]), [
      { reviewId: 'rv1', severity: 'INFO' },
      { reviewId: 'rv1', severity: 'CRITICAL' },
    ]);
    expect(counts.get('pr1')).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
  });
});
