import { describe, it, expect } from 'vitest';
import { INTENT_LIMITS } from '@devdigest/shared';
import { buildIntentPrompt, type ClassifierSource } from '../src/modules/intent/prompt.js';
import type { FileHunkHeaders } from '../src/modules/intent/hunks.js';

const files: FileHunkHeaders[] = [{ path: 'a.ts', headers: ['@@ -1,1 +1,2 @@ ctx'] }];

describe('buildIntentPrompt', () => {
  it('fences every used source and shows unreachable sources only in the header', () => {
    const sources: ClassifierSource[] = [
      { id: 's1', kind: 'title', ref: 'title', status: 'used', text: 'Add rate limiting' },
      { id: 's2', kind: 'body', ref: 'body', status: 'used', text: 'Closes #12' },
      { id: 's3', kind: 'ticket', ref: 'PROJ-42', status: 'unreachable' },
      { id: 's4', kind: 'doc', ref: 'notion.so/x', status: 'unreachable' },
    ];
    const result = buildIntentPrompt(sources, files);
    expect(result.user).toContain('<untrusted source="S1:title">');
    expect(result.user).toContain('Add rate limiting');
    expect(result.user).toContain('<untrusted source="S2:body">');
    expect(result.user).toContain('Closes #12');
    // header lists every source, including unreachable ones
    expect(result.user).toContain('S3: ticket · PROJ-42 · unreachable');
    expect(result.user).toContain('S4: doc · notion.so/x · unreachable');
    // but no fenced block exists for them
    expect(result.user).not.toContain('S3:ticket');
    expect(result.user).not.toContain('S4:doc');
  });

  it('includes the files section (hunk headers only) and never a diff body line', () => {
    const sources: ClassifierSource[] = [
      { id: 's1', kind: 'title', ref: 'title', status: 'used', text: 't' },
    ];
    const withSecret: FileHunkHeaders[] = [
      { path: 'config.ts', headers: ['@@ -1,1 +1,2 @@ ctx'] },
    ];
    const result = buildIntentPrompt(sources, withSecret);
    expect(result.user).toContain('## files');
    expect(result.user).toContain('@@ -1,1 +1,2 @@ ctx');
    expect(result.user).not.toContain('sk_live');
    expect(result.user).not.toMatch(/^\+/m); // no raw added-line diff content
  });

  it('omits the files section entirely when there are no headers', () => {
    const sources: ClassifierSource[] = [
      { id: 's1', kind: 'title', ref: 'title', status: 'used', text: 't' },
    ];
    const result = buildIntentPrompt(sources, []);
    expect(result.user).not.toContain('## files');
  });

  it('trims the least important content first when over the total cap', () => {
    const bigDoc = 'd'.repeat(15_000);
    const bigIssue = 'i'.repeat(15_000);
    const manyHeaders: FileHunkHeaders[] = Array.from({ length: 50 }, (_, i) => ({
      path: `f${i}.ts`,
      headers: [`@@ -${i},1 +${i},1 @@ ${'x'.repeat(100)}`],
    }));
    const sources: ClassifierSource[] = [
      { id: 's1', kind: 'title', ref: 'title', status: 'used', text: 'title text' },
      { id: 's2', kind: 'body', ref: 'body', status: 'used', text: 'body text' },
      { id: 's3', kind: 'doc', ref: 'docs/x.md', status: 'used', text: bigDoc },
      { id: 's4', kind: 'issue', ref: '#1', status: 'used', text: bigIssue },
    ];
    const result = buildIntentPrompt(sources, manyHeaders);
    expect(result.user.length).toBeLessThanOrEqual(INTENT_LIMITS.promptTotalChars + 2000);
    // title/body are never dropped
    expect(result.user).toContain('title text');
    expect(result.user).toContain('body text');
  });
});

describe('buildIntentPrompt — hunk ids', () => {
  it('numbers every hunk header globally and returns an index the classifier can cite', () => {
    const sources: ClassifierSource[] = [
      { id: 's1', kind: 'title', ref: 'title', status: 'used', text: 't' },
    ];
    const hunkFiles: FileHunkHeaders[] = [
      { path: 'a.dart', headers: ['@@ -1,1 +1,2 @@ one', '@@ -9,1 +10,2 @@ two'] },
      { path: 'b.dart', headers: ['@@ -3,1 +3,4 @@ three'] },
    ];
    const result = buildIntentPrompt(sources, hunkFiles);
    expect(result.user).toContain('  H1 @@ -1,1 +1,2 @@ one');
    expect(result.user).toContain('  H3 @@ -3,1 +3,4 @@ three');
    expect([...result.hunks.keys()]).toEqual(['H1', 'H2', 'H3']);
    expect(result.hunks.get('H3')).toEqual({ id: 'H3', path: 'b.dart', header: '@@ -3,1 +3,4 @@ three' });
  });
});
