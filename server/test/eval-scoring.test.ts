import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EvalCaseResult, EvalExpectation } from '@devdigest/shared';
import { aggregate, matches, runStatus, scoreCase } from '../src/modules/eval/scoring.js';

/**
 * SPEC-13 scoring (AC-27, AC-29 to AC-36, EC-12 to EC-16, NFR-1): pure functions over data,
 * no model, no store. Metrics are checked by hand-computed numbers.
 */

const mustFind = (file = 'src/a.ts', start = 10, end = 12): EvalExpectation => ({
  type: 'must_find',
  file,
  start_line: start,
  end_line: end,
});
const mustNotFlag = (file = 'src/a.ts', start = 10, end = 12): EvalExpectation => ({
  type: 'must_not_flag',
  file,
  start_line: start,
  end_line: end,
});
const at = (file: string, start: number, end = start) => ({ file, start_line: start, end_line: end });

function result(over: Partial<EvalCaseResult> & { case_id: string }): EvalCaseResult {
  return {
    status: 'pass',
    expected_count: 1,
    matched_count: 1,
    kept: 1,
    dropped: 0,
    findings: [],
    duration_ms: 5,
    cost_usd: 0.25,
    ...over,
  };
}

describe('matches — AC-29', () => {
  it('AC-29: a kept finding matches when the file is equal and the ranges intersect, bounds inclusive', () => {
    const x = mustFind('src/a.ts', 10, 12);
    expect(matches(at('src/a.ts', 11), x)).toBe(true); // inside
    expect(matches(at('src/a.ts', 12, 20), x)).toBe(true); // touches the end bound
    expect(matches(at('src/a.ts', 1, 10), x)).toBe(true); // touches the start bound
    expect(matches(at('src/a.ts', 1, 100), x)).toBe(true); // encloses it
  });

  it('AC-29: no slack — one line outside the range, or another file, does not match', () => {
    const x = mustFind('src/a.ts', 10, 12);
    expect(matches(at('src/a.ts', 13, 15), x)).toBe(false);
    expect(matches(at('src/a.ts', 5, 9), x)).toBe(false);
    expect(matches(at('src/b.ts', 11), x)).toBe(false);
  });

  it('AC-29: a reversed model range is read as [min, max], and a huge range is a comparison, not a loop', () => {
    const x = mustFind('src/a.ts', 10, 12);
    expect(matches({ file: 'src/a.ts', start_line: 12, end_line: 10 }, x)).toBe(true);
    const started = Date.now();
    expect(matches(at('src/a.ts', 13, 2_000_000_000), x)).toBe(false);
    expect(matches(at('src/a.ts', 1, 2_000_000_000), x)).toBe(true);
    expect(Date.now() - started).toBeLessThan(50);
  });

  it('EC-14: a finding cited with the diff full path matches; the bare file name does not', () => {
    // grounding resolves `auth.ts` to `src/sub/auth.ts` BEFORE scoring; the scorer compares paths exactly
    const x = mustFind('src/sub/auth.ts', 10, 12);
    expect(matches(at('src/sub/auth.ts', 11), x)).toBe(true);
    expect(matches(at('auth.ts', 11), x)).toBe(false);
  });

  it('EC-15: a full-file finding kept whatever its lines matches only when its own range intersects', () => {
    const x = mustFind('src/a.ts', 10, 12);
    expect(matches(at('src/a.ts', 1, 1), x)).toBe(false); // kept by grounding, off the expectation
    expect(matches(at('src/a.ts', 11, 11), x)).toBe(true);
  });
});

describe('scoreCase — AC-30', () => {
  it('AC-30: a must_find case passes with at least one matching kept finding, else fails', () => {
    const x = mustFind();
    expect(scoreCase(x, [at('src/a.ts', 11)], 0)).toMatchObject({
      status: 'pass',
      expected_count: 1,
      matched_count: 1,
    });
    expect(scoreCase(x, [at('src/a.ts', 11), at('src/a.ts', 12)], 0)).toMatchObject({
      status: 'pass',
      matched_count: 2,
    });
    expect(scoreCase(x, [at('src/a.ts', 40)], 0)).toMatchObject({ status: 'fail', matched_count: 0 });
    expect(scoreCase(x, [], 0)).toMatchObject({ status: 'fail', matched_count: 0 });
  });

  it('AC-30: a must_not_flag case passes with no matching kept finding, else fails', () => {
    const x = mustNotFlag();
    expect(scoreCase(x, [], 0)).toMatchObject({ status: 'pass', expected_count: 0, matched_count: 0 });
    expect(scoreCase(x, [at('src/a.ts', 40)], 0)).toMatchObject({ status: 'pass', matched_count: 0 });
    expect(scoreCase(x, [at('src/a.ts', 10)], 0)).toMatchObject({ status: 'fail', matched_count: 1 });
  });

  it('AC-33: the case carries its kept and dropped counts', () => {
    expect(scoreCase(mustFind(), [at('src/a.ts', 11)], 3)).toMatchObject({ kept: 1, dropped: 3 });
  });
});

describe('aggregate — AC-31 to AC-36', () => {
  it('AC-31: recall is passed must_find cases over completed must_find cases', () => {
    const agg = aggregate([
      result({ case_id: 'a', status: 'pass' }),
      result({ case_id: 'b', status: 'pass' }),
      result({ case_id: 'c', status: 'fail', matched_count: 0 }),
      result({ case_id: 'd', status: 'fail', matched_count: 0 }),
      // must_not_flag cases and errored cases are not in the denominator
      result({ case_id: 'e', status: 'pass', expected_count: 0, matched_count: 0 }),
      result({ case_id: 'f', status: 'error', matched_count: 0, kept: 0 }),
    ]);
    expect(agg.recall).toBeCloseTo(2 / 4);
  });

  it('AC-32: precision is TP / (TP + FP): matches of must_find over matches of both kinds', () => {
    const agg = aggregate([
      result({ case_id: 'a', status: 'pass', matched_count: 2, kept: 2 }), // TP 2
      result({ case_id: 'b', status: 'fail', matched_count: 0, kept: 1 }), // not a TP, not an FP
      result({ case_id: 'c', status: 'fail', expected_count: 0, matched_count: 1, kept: 1 }), // FP 1
      result({ case_id: 'd', status: 'pass', expected_count: 0, matched_count: 0, kept: 0 }),
    ]);
    expect(agg.precision).toBeCloseTo(2 / 3);
  });

  it('AC-33: citation_accuracy is kept over kept plus dropped, completed cases only', () => {
    const agg = aggregate([
      result({ case_id: 'a', kept: 3, dropped: 1 }),
      result({ case_id: 'b', kept: 1, dropped: 3 }),
      result({ case_id: 'c', status: 'error', kept: 0, dropped: 9, matched_count: 0 }), // ignored
    ]);
    expect(agg.citation_accuracy).toBeCloseTo(4 / 8);
  });

  it('AC-34: a metric whose denominator is 0 is null, not 0', () => {
    const agg = aggregate([]);
    expect(agg).toMatchObject({
      recall: null,
      precision: null,
      citation_accuracy: null,
      cost_usd: null,
      cases_completed: 0,
      cases_errored: 0,
    });
  });

  it('EC-12: a set of only must_not_flag cases has recall null while precision and citation still compute', () => {
    const agg = aggregate([
      result({ case_id: 'a', status: 'pass', expected_count: 0, matched_count: 0, kept: 1, dropped: 0 }),
      result({ case_id: 'b', status: 'fail', expected_count: 0, matched_count: 1, kept: 1, dropped: 1 }),
    ]);
    expect(agg.recall).toBeNull();
    expect(agg.precision).toBeCloseTo(0); // TP 0, FP 1
    expect(agg.citation_accuracy).toBeCloseTo(2 / 3);
  });

  it('EC-13, AC-35: no kept finding on a labelled location → precision null and every kept finding unlabelled', () => {
    const agg = aggregate([
      result({ case_id: 'a', status: 'fail', matched_count: 0, kept: 2 }),
      result({ case_id: 'b', status: 'pass', expected_count: 0, matched_count: 0, kept: 1 }),
    ]);
    expect(agg.precision).toBeNull();
    expect(agg.unlabelled_findings).toBe(3);
  });

  it('AC-35: unlabelled findings are the kept ones that match no expectation, outside every metric', () => {
    const agg = aggregate([
      result({ case_id: 'a', status: 'pass', matched_count: 1, kept: 3 }), // 2 unlabelled
      result({ case_id: 'b', status: 'fail', expected_count: 0, matched_count: 1, kept: 1 }), // 0
    ]);
    expect(agg.unlabelled_findings).toBe(2);
    expect(agg.precision).toBeCloseTo(1 / 2);
  });

  it('AC-36: cost is the sum of the completed cases when each has one', () => {
    const agg = aggregate([
      result({ case_id: 'a', cost_usd: 0.1 }),
      result({ case_id: 'b', cost_usd: 0.2 }),
      result({ case_id: 'c', status: 'error', cost_usd: null, matched_count: 0, kept: 0 }), // errored: not summed
    ]);
    expect(agg.cost_usd).toBeCloseTo(0.3);
  });

  it('EC-16, AC-36: one completed case with no cost makes the run cost null', () => {
    const agg = aggregate([
      result({ case_id: 'a', cost_usd: 0.1 }),
      result({ case_id: 'b', cost_usd: null }),
    ]);
    expect(agg.cost_usd).toBeNull();
  });

  it('AC-27: the counters split errored from completed and count passes', () => {
    const agg = aggregate([
      result({ case_id: 'a', status: 'pass' }),
      result({ case_id: 'b', status: 'fail', matched_count: 0 }),
      result({ case_id: 'c', status: 'error', matched_count: 0, kept: 0 }),
    ]);
    expect(agg).toMatchObject({ cases_passed: 1, cases_completed: 2, cases_errored: 1 });
  });
});

describe('runStatus — AC-27', () => {
  it('AC-27: done with no errored case, partial with both kinds, failed when none completed', () => {
    expect(runStatus(5, 0)).toBe('done');
    expect(runStatus(3, 2)).toBe('partial');
    expect(runStatus(1, 1)).toBe('partial');
    expect(runStatus(0, 4)).toBe('failed');
  });

  it('EC-11, AC-27: every case in error → failed, and its metrics are null', () => {
    const agg = aggregate([
      result({ case_id: 'a', status: 'error', matched_count: 0, kept: 0, cost_usd: null }),
      result({ case_id: 'b', status: 'error', matched_count: 0, kept: 0, cost_usd: null }),
    ]);
    expect(runStatus(agg.cases_completed, agg.cases_errored)).toBe('failed');
    expect(agg).toMatchObject({ recall: null, precision: null, citation_accuracy: null, cost_usd: null });
  });
});

describe('NFR-1 — scoring makes no model call', () => {
  it('NFR-1: scoring.ts imports contracts only, so it cannot reach a provider', () => {
    const source = readFileSync(new URL('../src/modules/eval/scoring.ts', import.meta.url), 'utf8');
    const imports = [...source.matchAll(/^import .* from '([^']+)';?$/gm)].map((m) => m[1]);
    expect(imports).toEqual(['@devdigest/shared']);
  });

  it('NFR-1: every metric computes from plain data with no provider, store or network in scope', () => {
    const cases = [
      { x: mustFind(), kept: [at('src/a.ts', 11)], dropped: 1 },
      { x: mustNotFlag(), kept: [at('src/a.ts', 11)], dropped: 0 },
    ];
    const results = cases.map(({ x, kept, dropped }, i) => {
      const s = scoreCase(x, kept, dropped);
      return result({ case_id: `c${i}`, ...s, cost_usd: 0.1 });
    });
    const agg = aggregate(results);
    expect(agg.recall).toBe(1);
    expect(agg.precision).toBeCloseTo(1 / 2);
    expect(agg.citation_accuracy).toBeCloseTo(2 / 3);
    expect(agg.unlabelled_findings).toBe(0);
  });
});
