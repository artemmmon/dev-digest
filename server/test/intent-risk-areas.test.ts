import { describe, it, expect } from 'vitest';
import type { RiskArea } from '@devdigest/shared';
import { deriveRuleRiskAreas, mergeRiskAreas } from '../src/modules/intent/risk-areas.js';

describe('deriveRuleRiskAreas', () => {
  it('flags an auth-surface path', () => {
    const areas = deriveRuleRiskAreas([{ path: 'server/src/modules/auth/service.ts' }]);
    expect(areas).toContainEqual(
      expect.objectContaining({ kind: 'auth', origin: 'rule' }),
    );
  });

  it('flags a DB migration path', () => {
    const areas = deriveRuleRiskAreas([{ path: 'server/src/db/migrations/0018_x.sql' }]);
    expect(areas.some((a) => a.kind === 'migration')).toBe(true);
  });

  it('flags a CI/deploy config path', () => {
    const areas = deriveRuleRiskAreas([{ path: '.github/workflows/server-unit.yml' }]);
    expect(areas.some((a) => a.kind === 'ci_config')).toBe(true);
  });

  it('flags an env/secrets config path', () => {
    const areas = deriveRuleRiskAreas([{ path: 'server/.env.example' }]);
    expect(areas.some((a) => a.kind === 'secrets_config')).toBe(true);
  });

  it('flags a newly added dependency, not a version bump', () => {
    const added = {
      path: 'package.json',
      patch: '@@ -10,2 +10,3 @@\n   "dependencies": {\n+    "left-pad": "^1.3.0",\n     "zod": "^3.0.0"',
    };
    const bumped = {
      path: 'client/package.json',
      patch: '@@ -1,1 +1,1 @@\n-  "next": "15.4.0",\n+  "next": "15.5.0",',
    };
    const areas = deriveRuleRiskAreas([added, bumped]);
    const labels = areas.filter((a) => a.kind === 'dependency').map((a) => a.label);
    expect(labels).toContain('new dependency left-pad');
    expect(labels.some((l) => l.includes('next'))).toBe(false);
  });

  it('caps at 5 total rule chips', () => {
    const files = [
      { path: 'server/src/modules/auth/service.ts' },
      { path: 'server/src/db/migrations/0018_x.sql' },
      { path: '.github/workflows/x.yml' },
      { path: 'server/.env.example' },
      {
        path: 'package.json',
        patch: '@@ -1,1 +1,2 @@\n+    "a": "1.0.0",\n+    "b": "1.0.0",\n+    "c": "1.0.0",',
      },
    ];
    const areas = deriveRuleRiskAreas(files);
    expect(areas.length).toBeLessThanOrEqual(5);
  });

  it('returns [] for an unrelated change', () => {
    expect(deriveRuleRiskAreas([{ path: 'src/components/Button.tsx' }])).toEqual([]);
  });
});

describe('mergeRiskAreas', () => {
  it('puts rule chips first and dedupes by kind + normalised label', () => {
    const rule: RiskArea[] = [{ kind: 'dependency', label: 'new dependency redis', origin: 'rule' }];
    const model: RiskArea[] = [
      { kind: 'dependency', label: 'New Dependency Redis', origin: 'model' }, // dup, different case
      { kind: 'performance', label: 'Adds Redis round-trip per request', origin: 'model' },
    ];
    const merged = mergeRiskAreas(rule, model);
    expect(merged).toEqual([
      { kind: 'dependency', label: 'new dependency redis', origin: 'rule' },
      { kind: 'performance', label: 'Adds Redis round-trip per request', origin: 'model' },
    ]);
  });

  it('caps at 6 total', () => {
    const rule: RiskArea[] = Array.from({ length: 5 }, (_, i) => ({
      kind: 'other' as const,
      label: `rule ${i}`,
      origin: 'rule' as const,
    }));
    const model: RiskArea[] = Array.from({ length: 3 }, (_, i) => ({
      kind: 'other' as const,
      label: `model ${i}`,
      origin: 'model' as const,
    }));
    const merged = mergeRiskAreas(rule, model);
    expect(merged).toHaveLength(6);
    // rule chips all present before any model chip is included
    expect(merged.slice(0, 5).every((a) => a.origin === 'rule')).toBe(true);
  });
});

describe('deriveRuleRiskAreas — pubspec.yaml (Flutter/Dart)', () => {
  it('flags a newly added versioned dependency, not sdk/flutter or nested keys', () => {
    const patch = [
      '@@ -10,6 +10,7 @@ dependencies:',
      '   flutter:',
      '     sdk: flutter',
      '+  crypto: ^3.0.3',
      '+  sdk: ">=3.0.0 <4.0.0"',
      '+    path: ../local_pkg',
    ].join('\n');
    const areas = deriveRuleRiskAreas([{ path: 'pubspec.yaml', patch }]);
    expect(areas).toContainEqual({ kind: 'dependency', label: 'new dependency crypto', origin: 'rule' });
    expect(areas.filter((a) => a.kind === 'dependency')).toHaveLength(1);
  });

  it('does not flag a version bump (removed and re-added)', () => {
    const patch = ['@@ -10,1 +10,1 @@', '-  http: ^1.1.0', '+  http: ^1.2.0'].join('\n');
    expect(deriveRuleRiskAreas([{ path: 'pubspec.yaml', patch }])).toEqual([]);
  });
});
