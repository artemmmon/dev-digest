import { describe, expect, it } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { type ExpectedChange, LINE_SLACK, matches, scoreRun } from './score.js';

const finding = (over: Partial<Finding>): Finding => ({
  id: 'f1',
  severity: 'CRITICAL',
  category: 'bug',
  title: 'Breaking change',
  file: 'src/contracts/lineup.ts',
  start_line: 11,
  end_line: 11,
  rationale: '',
  suggestion: null,
  confidence: 0.9,
  ...over,
});

const AUTHOR: ExpectedChange = {
  id: 'author-nullable',
  label: 'author becomes nullable',
  skill: 'response-schema',
  keywords: ['author'],
  locations: [{ file: 'src/contracts/lineup.ts', lines: [11, 11] }],
};
const ARCHIVED: ExpectedChange = {
  id: 'status-archived',
  label: 'status gains archived',
  skill: 'breaking-change',
  keywords: ['archived'],
  locations: [{ file: 'src/contracts/lineup.ts', lines: [4, 4] }],
};

describe('matches', () => {
  it('counts a finding on the planted line that names the change', () => {
    expect(matches(finding({ title: '`author` is now nullable' }), AUTHOR)).toBe(true);
  });

  it('matches keywords case-insensitively, in the rationale too', () => {
    expect(matches(finding({ rationale: 'Clients read AUTHOR.name' }), AUTHOR)).toBe(true);
  });

  it('rejects a finding that cites the line but does not name the change', () => {
    expect(matches(finding({ title: 'Field became nullable' }), AUTHOR)).toBe(false);
  });

  it('rejects a finding in another file', () => {
    expect(matches(finding({ title: 'author', file: 'src/routes/lineups.ts' }), AUTHOR)).toBe(false);
  });

  it('accepts a range within the slack and rejects one just outside it', () => {
    const near = finding({ title: 'author', start_line: 11 + LINE_SLACK, end_line: 20 });
    const far = finding({ title: 'author', start_line: 12 + LINE_SLACK, end_line: 20 });
    expect(matches(near, AUTHOR)).toBe(true);
    expect(matches(far, AUTHOR)).toBe(false);
  });

  it('accepts a wide range that covers the planted line', () => {
    expect(matches(finding({ title: 'author', start_line: 1, end_line: 14 }), AUTHOR)).toBe(true);
  });
});

describe('scoreRun', () => {
  it('reports caught changes, full detection and noise', () => {
    const run = scoreRun(
      [
        finding({ title: '`author` is now nullable' }),
        finding({ title: 'toWire could be memoised', file: 'src/routes/lineups.ts', start_line: 6, end_line: 6 }),
      ],
      [AUTHOR, ARCHIVED],
    );
    expect(run.caught).toEqual({ 'author-nullable': true, 'status-archived': false });
    expect(run.full).toBe(false);
    expect(run.extra).toBe(1);
  });

  it('lets one finding cover several changes', () => {
    const f = finding({ title: '`archived` added and `author` nullable', start_line: 4, end_line: 11 });
    const run = scoreRun([f], [AUTHOR, ARCHIVED]);
    expect(run.full).toBe(true);
    expect(run.extra).toBe(0);
  });

  it('counts deprecation and semver mentions', () => {
    const run = scoreRun(
      [
        finding({ title: 'author', rationale: 'Removed without deprecation' }),
        finding({ title: 'Needs a major version bump (2.0.0)' }),
        finding({ title: 'author', rationale: 'Plain break' }),
      ],
      [AUTHOR],
    );
    expect(run.policyMentions).toBe(2);
  });

  it('with no findings catches nothing', () => {
    expect(scoreRun([], [AUTHOR])).toEqual({
      caught: { 'author-nullable': false },
      full: false,
      extra: 0,
      policyMentions: 0,
    });
  });
});
