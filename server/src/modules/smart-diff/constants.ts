import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff classification (spec 09): the order files are grouped into, and the
 * patterns that decide a file's role. Everything about "order" lives in this one
 * file, on purpose — the display order (`SMART_DIFF_ROLE_ORDER`) and the check
 * order (`CLASSIFY_RULES`) are two different orders and easy to conflate.
 *
 * Pattern dialect: `../_shared/glob.js`'s `matchesAny` (gitignore-like; a bare
 * literal with no `/` and no wildcard is an EXACT full-path match — prefix a bare
 * file name with `**` + slash so it matches at any depth, e.g. `**` + slash +
 * `pnpm-lock.yaml`).
 */

/** Display order of the 5 groups: core (business logic) first, boilerplate last. */
export const SMART_DIFF_ROLE_ORDER: readonly SmartDiffRole[] = [
  'core',
  'tests',
  'wiring',
  'docs',
  'boilerplate',
];

/**
 * Classification check order: the FIRST matching rule wins. Boilerplate is
 * checked before tests (a snapshot file inside `__tests__/` is boilerplate, not
 * tests); wiring is checked before docs (`.claude/**` markdown configures agent
 * behaviour, it isn't documentation, so it must win over `**` + slash + `*.md`).
 * A path matching none of these falls back to `FALLBACK_ROLE`.
 */
export const CLASSIFY_RULES: readonly { role: SmartDiffRole; patterns: readonly string[] }[] = [
  {
    role: 'boilerplate',
    patterns: [
      '*.lock',
      '**/pnpm-lock.yaml',
      '**/package-lock.json',
      '**/yarn.lock',
      '**/dist/**',
      '**/build/**',
      '**/__snapshots__/**',
      '*.snap',
      '*.generated.*',
      '*.min.js',
      '*.g.dart',
      '*.freezed.dart',
      '*.gr.dart',
      '*.mocks.dart',
      '*.gen.dart',
      '**/generated/**',
    ],
  },
  {
    role: 'tests',
    patterns: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.it.test.ts',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/*_test.dart',
      '**/test/**',
      '**/tests/**',
      '**/__tests__/**',
      '**/integration_test/**',
      'e2e/**',
    ],
  },
  {
    role: 'wiring',
    patterns: [
      '**/index.ts',
      '**/index.js',
      '*.config.*',
      'tsconfig*.json',
      '.eslintrc*',
      '.env*',
      'docker-compose*.yml',
      '.github/**',
      '.claude/**',
      // Dependency manifests declare what the project depends on — wiring, not
      // the substance of the change. Their lock files stay boilerplate: the
      // boilerplate rule (`*.lock`, `**/pnpm-lock.yaml`, …) is checked first
      // and already wins for them (user decision 2026-09-26).
      '**/package.json',
      '**/pubspec.yaml',
    ],
  },
  {
    role: 'docs',
    patterns: ['**/*.md', '**/docs/**', 'README*', 'CHANGELOG*', 'LICENSE*'],
  },
];

/** A path matching none of `CLASSIFY_RULES` is the substance of the change. */
export const FALLBACK_ROLE: SmartDiffRole = 'core';
