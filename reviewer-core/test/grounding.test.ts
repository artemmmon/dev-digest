import { describe, it, expect } from 'vitest';
import type { Finding, UnifiedDiff } from '@devdigest/shared';
import { groundFindings } from '../src/grounding.js';

/**
 * The grounding gate takes `file` and `start_line`/`end_line` straight from the
 * model, so it must tolerate path noise and never loop over a model-sized range.
 */

const diff: UnifiedDiff = {
  raw: '',
  files: [
    {
      path: 'server/src/modules/pulls/cost.ts',
      additions: 2,
      deletions: 0,
      hunks: [
        {
          file: 'server/src/modules/pulls/cost.ts',
          oldStart: 10,
          oldLines: 0,
          newStart: 10,
          newLines: 2,
          newLineNumbers: [10, 11],
        },
      ],
    },
    { path: 'a/index.ts', additions: 1, deletions: 0, hunks: [] },
    { path: 'b/index.ts', additions: 1, deletions: 0, hunks: [] },
  ],
};

function finding(over: Partial<Finding>): Finding {
  return {
    id: 'f1',
    severity: 'WARNING',
    category: 'bug',
    title: 'something',
    file: 'server/src/modules/pulls/cost.ts',
    start_line: 10,
    end_line: 10,
    rationale: 'r',
    confidence: 0.9,
    kind: 'finding',
    ...over,
  } as Finding;
}

describe('groundFindings — paths', () => {
  it.each([
    './server/src/modules/pulls/cost.ts',
    '/server/src/modules/pulls/cost.ts',
    'b/server/src/modules/pulls/cost.ts',
    'server\\src\\modules\\pulls\\cost.ts',
    'pulls/cost.ts',
    'cost.ts',
    'repo/server/src/modules/pulls/cost.ts',
  ])('maps %s onto the diff path and keeps the finding', (file) => {
    const res = groundFindings([finding({ file })], diff);
    expect(res.dropped).toEqual([]);
    expect(res.kept[0]!.file).toBe('server/src/modules/pulls/cost.ts');
    expect(res.remapped).toEqual([
      { from: file, to: 'server/src/modules/pulls/cost.ts', title: 'something' },
    ]);
  });

  it('does not guess between two files with the same suffix', () => {
    const res = groundFindings([finding({ file: 'index.ts', kind: 'hook' })], diff);
    expect(res.kept).toEqual([]);
    expect(res.dropped[0]!.reason).toMatch(/not present in diff/);
  });

  it('does not match a partial file name', () => {
    const res = groundFindings([finding({ file: 'st.ts' })], diff);
    expect(res.dropped[0]!.reason).toMatch(/not present in diff/);
  });

  it('still applies the line check after remapping', () => {
    const res = groundFindings([finding({ file: 'cost.ts', start_line: 500, end_line: 500 })], diff);
    expect(res.kept).toEqual([]);
    expect(res.dropped[0]!.reason).toMatch(/do not intersect/);
    expect(res.remapped).toEqual([]);
  });

  it('leaves an exact path untouched', () => {
    const res = groundFindings([finding({})], diff);
    expect(res.kept).toHaveLength(1);
    expect(res.remapped).toEqual([]);
  });
});

describe('groundFindings — line ranges', () => {
  it('keeps a huge range that covers a hunk, without walking it', () => {
    const started = Date.now();
    const res = groundFindings([finding({ start_line: 1, end_line: 1e9 })], diff);
    expect(res.kept).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(100);
  });

  it('accepts a reversed range', () => {
    const res = groundFindings([finding({ start_line: 12, end_line: 11 })], diff);
    expect(res.kept).toHaveLength(1);
  });

  it('drops a range next to the hunk', () => {
    const res = groundFindings([finding({ start_line: 12, end_line: 40 })], diff);
    expect(res.kept).toEqual([]);
  });
});
