/**
 * Review diff filter (`modules/reviews/diff-filter.ts`) — generated/fixture files
 * must leave BOTH `files` and `raw`, since the prompt is built from `raw`.
 */
import { describe, it, expect } from 'vitest';
import type { UnifiedDiff } from '@devdigest/shared';
import { excludeFromReview } from '../src/modules/reviews/diff-filter.js';
import { matchesAny } from '../src/modules/_shared/glob.js';
import { REVIEW_EXCLUDED_PATHS } from '../src/modules/reviews/constants.js';

function section(path: string, added: string): string {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    '@@ -1,1 +1,2 @@',
    ' context',
    `+${added}`,
  ].join('\n');
}

function file(path: string): UnifiedDiff['files'][number] {
  return {
    path,
    additions: 1,
    deletions: 0,
    hunks: [{ file: path, oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, newLineNumbers: [2] }],
  };
}

function diffOf(paths: string[]): UnifiedDiff {
  return {
    raw: paths.map((p) => section(p, `// ${p}`)).join('\n'),
    files: paths.map(file),
  };
}

describe('excludeFromReview', () => {
  it('drops excluded files from `files` AND from `raw`', () => {
    const diff = diffOf([
      'server/src/modules/pulls/cost.ts',
      'client/docs/design/src/data.jsx',
      'client/src/lib/format-cost.ts',
    ]);
    const { diff: out, excluded } = excludeFromReview(diff);

    expect(excluded).toEqual(['client/docs/design/src/data.jsx']);
    expect(out.files.map((f) => f.path)).toEqual([
      'server/src/modules/pulls/cost.ts',
      'client/src/lib/format-cost.ts',
    ]);
    expect(out.raw).not.toContain('client/docs/design');
    expect(out.raw).toContain('server/src/modules/pulls/cost.ts');
    expect(out.raw).toContain('client/src/lib/format-cost.ts');
  });

  it('returns the diff untouched when nothing matches', () => {
    const diff = diffOf(['server/src/app.ts']);
    const out = excludeFromReview(diff);
    expect(out.excluded).toEqual([]);
    expect(out.diff).toBe(diff);
  });

  it('keeps the preamble and sections it cannot attribute to a path', () => {
    const diff: UnifiedDiff = {
      raw: ['commit abc123', 'Author: someone', section('client/docs/design/src/data.jsx', 'x')].join('\n'),
      files: [file('client/docs/design/src/data.jsx')],
    };
    const out = excludeFromReview(diff);
    expect(out.diff.raw).toContain('commit abc123');
    expect(out.diff.raw).not.toContain('data.jsx');
    expect(out.diff.files).toEqual([]);
  });

  it('honours an explicit pattern list over the default', () => {
    const diff = diffOf(['client/docs/design/src/data.jsx', 'server/src/app.ts']);
    const out = excludeFromReview(diff, ['server/src/**']);
    expect(out.excluded).toEqual(['server/src/app.ts']);
    expect(out.diff.raw).toContain('data.jsx');
  });

  it('excludes the real offenders from the default list', () => {
    const paths = [
      'client/docs/design/src/data.jsx',
      'server/src/db/migrations/meta/0010_snapshot.json',
      'pnpm-lock.yaml',
      'e2e/package-lock.json',
      'lib/models/user.g.dart',
      'lib/l10n/generated/app_en.arb',
      'ios/Flutter/ephemeral/Flutter.podspec',
      'server/src/modules/reviews/run-executor.ts',
      'client/src/vendor/ui/primitives/Badge.tsx',
      'lib/models/user.dart',
    ];
    const kept = paths.filter((p) => !matchesAny(p, REVIEW_EXCLUDED_PATHS));
    expect(kept).toEqual([
      'server/src/modules/reviews/run-executor.ts',
      'client/src/vendor/ui/primitives/Badge.tsx', // vendored but hand-edited — reviewed
      'lib/models/user.dart', // hand-written Dart, not a codegen output
    ]);
  });
});
