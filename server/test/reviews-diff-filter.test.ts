/**
 * Review diff filter (`modules/reviews/diff-filter.ts`) — generated/fixture files
 * must leave BOTH `files` and `raw`, since the prompt is built from `raw`.
 */
import { describe, it, expect } from 'vitest';
import type { UnifiedDiff } from '@devdigest/shared';
import { excludeFromReview, matchesAny } from '../src/modules/reviews/diff-filter.js';
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

describe('matchesAny', () => {
  it('matches a `dir/**` prefix but not a sibling directory', () => {
    expect(matchesAny('client/docs/design/src/data.jsx', ['client/docs/design/**'])).toBe(true);
    expect(matchesAny('client/docs/architecture.md', ['client/docs/design/**'])).toBe(false);
  });

  it('matches an extension pattern and an exact path', () => {
    expect(matchesAny('server/pnpm-lock.yaml', ['*.yaml'])).toBe(true);
    expect(matchesAny('pnpm-lock.yaml', ['pnpm-lock.yaml'])).toBe(true);
    expect(matchesAny('client/pnpm-lock.yaml', ['pnpm-lock.yaml'])).toBe(false);
  });

  it('matches a `**/name` basename at any depth, root included', () => {
    expect(matchesAny('e2e/package-lock.json', ['**/package-lock.json'])).toBe(true);
    expect(matchesAny('package-lock.json', ['**/package-lock.json'])).toBe(true);
    expect(matchesAny('src/my-package-lock.json', ['**/package-lock.json'])).toBe(false);
  });

  it('matches a multi-dot extension anywhere, not just the last segment', () => {
    expect(matchesAny('lib/models/user.g.dart', ['*.g.dart'])).toBe(true);
    expect(matchesAny('lib/user.dart', ['*.g.dart'])).toBe(false);
  });

  it('matches `**/dir/**` — a directory anywhere in the tree, not a same-named prefix', () => {
    expect(matchesAny('lib/l10n/generated/app_en.arb', ['**/generated/**'])).toBe(true);
    expect(matchesAny('generated/foo.dart', ['**/generated/**'])).toBe(true);
    expect(matchesAny('lib/generated_helpers/foo.dart', ['**/generated/**'])).toBe(false);
  });

  it('matches a wildcard filename nested under a fixed directory, anywhere', () => {
    expect(
      matchesAny('lib/l10n/app_localizations_en.dart', ['**/l10n/app_localizations*.dart']),
    ).toBe(true);
    expect(matchesAny('lib/l10n/messages.dart', ['**/l10n/app_localizations*.dart'])).toBe(false);
  });

  it('matches a basename with a wildcard extension, at any depth', () => {
    expect(matchesAny('android/app/GeneratedPluginRegistrant.java', ['**/GeneratedPluginRegistrant.*'])).toBe(
      true,
    );
    expect(matchesAny('ios/Runner/GeneratedPluginRegistrant.m', ['**/GeneratedPluginRegistrant.*'])).toBe(
      true,
    );
  });

  it('matches a two-segment directory anywhere in the tree', () => {
    expect(matchesAny('ios/Flutter/ephemeral/Flutter.podspec', ['**/Flutter/ephemeral/**'])).toBe(true);
    expect(matchesAny('ios/Flutter/AppFrameworkInfo.plist', ['**/Flutter/ephemeral/**'])).toBe(false);
  });
});

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
