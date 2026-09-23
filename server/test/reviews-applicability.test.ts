/**
 * `applies_to` gating (`modules/reviews/applicability.ts`) — pure, no DB.
 */
import { describe, it, expect } from 'vitest';
import { effectivePaths, matchesAppliesTo, partitionSkills } from '../src/modules/reviews/applicability.js';

describe('matchesAppliesTo', () => {
  it('null/empty applies_to always matches', () => {
    expect(matchesAppliesTo(null, ['src/config.ts'])).toBe(true);
    expect(matchesAppliesTo([], ['src/config.ts'])).toBe(true);
    expect(matchesAppliesTo(undefined, [])).toBe(true);
  });

  it('matches when a changed path fits a glob', () => {
    expect(matchesAppliesTo(['*.dart'], ['lib/main.dart', 'lib/other.ts'])).toBe(true);
    expect(matchesAppliesTo(['*.dart'], ['lib/main.ts'])).toBe(false);
  });

  it('fails open when there are no paths to judge against', () => {
    expect(matchesAppliesTo(['*.dart'], [])).toBe(true);
  });
});

describe('effectivePaths', () => {
  it('drops the default review-excluded paths before gating sees them', () => {
    expect(effectivePaths(['pnpm-lock.yaml', 'src/config.ts'])).toEqual(['src/config.ts']);
  });
});

describe('partitionSkills', () => {
  const dartSkill = { id: 's1', appliesTo: ['*.dart'] };
  const alwaysSkill = { id: 's2', appliesTo: null };

  it('splits applicable vs. skipped by applies_to against the changed files', () => {
    const { applicable, skipped } = partitionSkills([dartSkill, alwaysSkill], ['src/config.ts']);
    expect(applicable).toEqual([alwaysSkill]);
    expect(skipped).toEqual([dartSkill]);
  });

  it('a scoped skill is applicable when a changed file matches', () => {
    const { applicable, skipped } = partitionSkills([dartSkill], ['lib/main.dart']);
    expect(applicable).toEqual([dartSkill]);
    expect(skipped).toEqual([]);
  });

  it('fails open (applicable) when every changed path was excluded from review', () => {
    const { applicable, skipped } = partitionSkills([dartSkill], ['pnpm-lock.yaml']);
    expect(applicable).toEqual([dartSkill]);
    expect(skipped).toEqual([]);
  });
});
