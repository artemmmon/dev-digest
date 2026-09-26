import { describe, it, expect } from 'vitest';
import type { UnifiedDiff } from '@devdigest/shared';
import { extractHunkHeaders, hunksFromFiles, hunksFromRawDiff } from '../src/modules/intent/hunks.js';

describe('extractHunkHeaders', () => {
  it('extracts only @@ … @@ lines, never diff body lines', () => {
    const patch =
      '@@ -1,3 +1,4 @@ function foo() {\n-old line\n+new line\n context\n@@ -20,2 +21,2 @@ class Bar\n more';
    const headers = extractHunkHeaders(patch);
    expect(headers).toEqual(['@@ -1,3 +1,4 @@ function foo() {', '@@ -20,2 +21,2 @@ class Bar']);
    expect(headers.join('')).not.toContain('old line');
    expect(headers.join('')).not.toContain('new line');
  });

  it('caps at 5 headers per file and 120 chars each', () => {
    const lines = Array.from({ length: 8 }, (_, i) => `@@ -${i},1 +${i},1 @@ ${'x'.repeat(200)}`);
    const headers = extractHunkHeaders(lines.join('\n'));
    expect(headers).toHaveLength(5);
    expect(headers.every((h) => h.length <= 120)).toBe(true);
  });
});

describe('hunksFromFiles', () => {
  it('maps pr_files rows to path + headers, capped at 100 files', () => {
    const files = [{ path: 'a.ts', patch: '@@ -1,1 +1,1 @@ ctx' }, { path: 'b.ts', patch: null }];
    const result = hunksFromFiles(files);
    expect(result).toEqual([
      { path: 'a.ts', headers: ['@@ -1,1 +1,1 @@ ctx'] },
      { path: 'b.ts', headers: [] },
    ]);
  });

  it('caps at 100 files', () => {
    const files = Array.from({ length: 150 }, (_, i) => ({ path: `f${i}.ts`, patch: null }));
    expect(hunksFromFiles(files)).toHaveLength(100);
  });
});

describe('hunksFromRawDiff', () => {
  it('extracts headers per file from a raw unified diff', () => {
    const diff: UnifiedDiff = {
      raw:
        'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1,1 +1,2 @@ ctx1\n+added\n' +
        'diff --git a/y.ts b/y.ts\n--- a/y.ts\n+++ b/y.ts\n@@ -5,1 +6,2 @@ ctx2\n+added2',
      files: [],
    };
    const result = hunksFromRawDiff(diff);
    expect(result).toEqual([
      { path: 'x.ts', headers: ['@@ -1,1 +1,2 @@ ctx1'] },
      { path: 'y.ts', headers: ['@@ -5,1 +6,2 @@ ctx2'] },
    ]);
  });

  it('never includes an added/removed content line as a header', () => {
    const diff: UnifiedDiff = {
      raw: 'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1,1 +1,2 @@\n+const secret = "sk_live_xxx";',
      files: [],
    };
    const result = hunksFromRawDiff(diff);
    expect(result[0]!.headers).toEqual(['@@ -1,1 +1,2 @@']);
    expect(JSON.stringify(result)).not.toContain('sk_live');
  });

  it('never takes an in-hunk "+++ …" / "--- …" body line as a file header', () => {
    // Removed line "-- old" and added line "++ SECRET" render as "--- old" / "+++ SECRET".
    const diff: UnifiedDiff = {
      raw:
        'diff --git a/x.md b/x.md\n--- a/x.md\n+++ b/x.md\n@@ -1,2 +1,2 @@ intro\n' +
        '--- old\n+++ SECRET body text\n ctx\n@@ -10,1 +10,1 @@ later\n-a\n+b',
      files: [],
    };
    const result = hunksFromRawDiff(diff);
    expect(result).toEqual([
      { path: 'x.md', headers: ['@@ -1,2 +1,2 @@ intro', '@@ -10,1 +10,1 @@ later'] },
    ]);
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
});
