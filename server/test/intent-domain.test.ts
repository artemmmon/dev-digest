import { describe, it, expect } from 'vitest';
import { clampText, toIncidentalChanges, type PromptHunk } from '../src/modules/intent/domain.js';

describe('clampText', () => {
  it('keeps short text as is', () => {
    expect(clampText('  Adds a CI job  ', 60)).toBe('Adds a CI job');
  });

  it('cuts on a word boundary and appends an ellipsis, never mid-word', () => {
    const out = clampText('New CI job for dart analyze may fail if not properly configured', 60);
    expect(out).toBe('New CI job for dart analyze may fail if not properly…');
    expect(out.length).toBeLessThanOrEqual(60);
  });
});

describe('toIncidentalChanges', () => {
  const hunks = new Map<string, PromptHunk>([
    ['H1', { id: 'H1', path: 'server/auth.dart', header: '@@ -0,0 +1,26 @@' }],
    ['H2', { id: 'H2', path: 'lib/api.dart', header: '@@ -14,6 +14,10 @@ class LineupsApi' }],
    ['H3', { id: 'H3', path: 'lib/api.dart', header: '@@ -40,3 +44,0 @@ void old()' }],
  ]);

  it('maps cited hunk ids to new-side line ranges', () => {
    const out = toIncidentalChanges(
      { incidental_hunks: [{ hunk: 'h2', reason: 'unrelated error handling' }] },
      hunks,
    );
    expect(out).toEqual([
      {
        path: 'lib/api.dart',
        start_line: 14,
        end_line: 23,
        header: '@@ -14,6 +14,10 @@ class LineupsApi',
        reason: 'unrelated error handling',
      },
    ]);
  });

  it('never marks a dependency manifest or lockfile as incidental', () => {
    const withManifests = new Map<string, PromptHunk>([
      ['H1', { id: 'H1', path: 'pubspec.yaml', header: '@@ -35,6 +35,7 @@ dependencies:' }],
      ['H2', { id: 'H2', path: 'app/pubspec.lock', header: '@@ -41,6 +41,14 @@ packages:' }],
    ]);
    const out = toIncidentalChanges({ incidental_hunks: [{ hunk: 'H1' }, { hunk: 'H2' }] }, withManifests);
    expect(out).toEqual([]);
  });

  it('ignores unknown ids, duplicates and pure-deletion hunks', () => {
    const out = toIncidentalChanges(
      { incidental_hunks: [{ hunk: 'H9' }, { hunk: 'H2' }, { hunk: 'H2' }, { hunk: 'H3' }, { hunk: null }] },
      hunks,
    );
    expect(out.map((c) => c.header)).toEqual(['@@ -14,6 +14,10 @@ class LineupsApi']);
    expect(out[0]!.reason).toBeNull();
  });
});
