import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../src/diff.js';

/** The parser feeds grounding: it must know exactly which new-side lines each hunk covers. */

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 111..222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,3 +1,4 @@',
  ' keep',
  '-removed',
  '+added one',
  '+added two',
  ' tail',
  '@@ -20 +21,2 @@',
  ' ctx',
  '+more',
  'diff --git a/src/b.ts b/src/b.ts',
  '--- /dev/null',
  '+++ b/src/b.ts',
  '@@ -0,0 +1,2 @@',
  '+x',
  '+y',
].join('\n');

describe('parseUnifiedDiff', () => {
  const diff = parseUnifiedDiff(DIFF);

  it('keeps the raw text and one entry per file', () => {
    expect(diff.raw).toBe(DIFF);
    expect(diff.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('counts additions and deletions per file', () => {
    expect(diff.files[0]).toMatchObject({ additions: 3, deletions: 1 });
    expect(diff.files[1]).toMatchObject({ additions: 2, deletions: 0 });
  });

  it('lists the new-side lines a hunk covers, context included, deletions not', () => {
    const [first, second] = diff.files[0]!.hunks;
    expect(first!.newLineNumbers).toEqual([1, 2, 3, 4]);
    expect(second!.newLineNumbers).toEqual([21, 22]);
    expect(second).toMatchObject({ oldStart: 20, oldLines: 1, newStart: 21, newLines: 2 });
  });

  it('handles a new file (--- /dev/null)', () => {
    expect(diff.files[1]!.hunks[0]!.newLineNumbers).toEqual([1, 2]);
  });

  it('returns no files for text without a diff', () => {
    expect(parseUnifiedDiff('').files).toEqual([]);
    expect(parseUnifiedDiff('not a diff').files).toEqual([]);
  });
});
