/**
 * Shared gitignore-like glob matcher (`modules/_shared/glob.ts`) — used by the review
 * diff filter (`modules/reviews/diff-filter.ts`, `applicability.ts`) and the Smart Diff
 * classifier (`modules/smart-diff/classify.ts`).
 */
import { describe, it, expect } from 'vitest';
import { matchesAny } from '../src/modules/_shared/glob.js';

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
