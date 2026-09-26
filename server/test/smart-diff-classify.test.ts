/**
 * Smart Diff classifier (`modules/smart-diff/classify.ts`) — table test, path →
 * role. Order matters more than any single pattern: write the table, then the
 * implementation (spec 09).
 */
import { describe, it, expect } from 'vitest';
import { SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from '../src/modules/smart-diff/classify.js';
import { SMART_DIFF_ROLE_ORDER } from '../src/modules/smart-diff/constants.js';

describe('classifyFile', () => {
  it.each([
    // The three contested cases (hw3-task.md): rule order decides them, not the file name alone.
    ['src/__tests__/__snapshots__/x.snap', 'boilerplate'], // the snapshot rule outranks the tests rule
    ['.claude/skills/security/SKILL.md', 'wiring'], // agent-behaviour markdown outranks docs
    ['e2e/README.md', 'tests'], // course decision: tests outranks docs even for a README

    // boilerplate
    ['server/pnpm-lock.yaml', 'boilerplate'],
    ['pubspec.lock', 'boilerplate'],
    ['lib/models/user.g.dart', 'boilerplate'],
    ['client/dist/app.js', 'boilerplate'],

    // tests
    ['server/test/pulls-service.test.ts', 'tests'],
    ['client/src/lib/api.test.ts', 'tests'],
    ['server/test/intent.it.test.ts', 'tests'],

    // wiring
    ['client/src/components/diff-viewer/index.ts', 'wiring'],
    ['client/next.config.ts', 'wiring'],
    ['tsconfig.json', 'wiring'],
    ['.github/workflows/ci.yml', 'wiring'],
    ['.env.example', 'wiring'],

    // docs
    ['README.md', 'docs'],
    ['docs/plans/03-smart-diff.md', 'docs'],
    ['LICENSE', 'docs'],

    // core (fallback)
    ['server/src/modules/pulls/service.ts', 'core'],
  ] as const)('%s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it('SMART_DIFF_ROLE_ORDER covers exactly the SmartDiffRole enum values', () => {
    expect(new Set(SMART_DIFF_ROLE_ORDER)).toEqual(new Set(SmartDiffRole.options));
  });
});
