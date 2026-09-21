import { describe, it, expect } from 'vitest';
import type { UnifiedDiff } from '@devdigest/shared';
import { sliceDiff } from '../src/review/reduce.js';

/** Each map-reduce chunk gets exactly its own file's slice of the diff. */

const raw = [
  'diff --git a/src/foo.ts b/src/foo.ts',
  '--- a/src/foo.ts',
  '+++ b/src/foo.ts',
  '@@ -1,1 +1,1 @@',
  '-old foo',
  '+new foo',
  'diff --git a/src/foo.ts.bak b/src/foo.ts.bak',
  '--- a/src/foo.ts.bak',
  '+++ b/src/foo.ts.bak',
  '@@ -1,1 +1,1 @@',
  '-old bak',
  '+new bak',
].join('\n');

const diff: UnifiedDiff = {
  raw,
  files: [
    { path: 'src/foo.ts', additions: 1, deletions: 1, hunks: [] },
    { path: 'src/foo.ts.bak', additions: 1, deletions: 1, hunks: [] },
  ],
};

describe('sliceDiff', () => {
  it('returns only the requested file, not a file whose name extends it', () => {
    const slice = sliceDiff(diff, 'src/foo.ts');
    expect(slice).toContain('+new foo');
    expect(slice).not.toContain('bak');
  });

  it('returns the longer-named file on its own', () => {
    const slice = sliceDiff(diff, 'src/foo.ts.bak');
    expect(slice).toContain('+new bak');
    expect(slice).not.toContain('+new foo');
  });

  it('matches a --no-prefix header', () => {
    const noPrefix: UnifiedDiff = {
      raw: 'diff --git src/foo.ts src/foo.ts\n--- src/foo.ts\n+++ src/foo.ts\n+x',
      files: [{ path: 'src/foo.ts', additions: 1, deletions: 0, hunks: [] }],
    };
    expect(sliceDiff(noPrefix, 'src/foo.ts')).toContain('+x');
  });
});
