import { describe, it, expect } from 'vitest';
import type { PrIntent } from '@devdigest/shared';
import { intentBlockText, shouldFilterScope, taskLine } from '../src/modules/reviews/helpers.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

function intent(over: Partial<PrIntent> = {}): PrIntent {
  return {
    pr_id: 'pr1',
    summary: 'Adds a rate limiter to the public API.',
    in_scope: ['rate limiter middleware'],
    out_of_scope: ['auth changes'],
    confidence_tier: 'high',
    basis: 'documented',
    missing_context: false,
    sources: [],
    risk_areas: [],
    head_sha: 'abc1234def',
    ...over,
  };
}

describe('intentBlockText', () => {
  it('a HIGH-confidence intent: summary, in/out scope bullets, confidence line, no missing-context', () => {
    const block = intentBlockText(intent(), false);
    expect(block).toContain('"Adds a rate limiter to the public API."');
    expect(block).toContain('In scope:');
    expect(block).toContain('- rate limiter middleware');
    expect(block).toContain('Out of scope:');
    expect(block).toContain('- auth changes');
    expect(block).toContain('Confidence: HIGH (documented)');
    expect(block).not.toContain('Missing context');
    expect(block).not.toContain('the PR has changed');
  });

  it('lists incidental changes so agents can tag findings there out_of_scope', () => {
    const block = intentBlockText(
      intent({
        incidental_changes: [
          { path: 'lib/api.dart', start_line: 14, end_line: 23, header: '@@ -14,6 +14,10 @@', reason: 'unrelated error handling' },
        ],
      }),
      false,
    );
    expect(block).toContain('Incidental changes (not part of the stated intent');
    expect(block).toContain('- lib/api.dart:14-23 — unrelated error handling');
  });

  it('a LOW-confidence intent with missing context lists every non-used linked source', () => {
    const low = intent({
      confidence_tier: 'low',
      basis: 'inferred',
      missing_context: true,
      sources: [
        { id: 's1', kind: 'issue', ref: '#12', status: 'unreachable' },
        { id: 's2', kind: 'doc', ref: 'docs/x.md', status: 'not_found' },
        { id: 's3', kind: 'title', ref: 'title', status: 'used' },
      ],
    });
    const block = intentBlockText(low, false);
    expect(block).toContain('Confidence: LOW (inferred)');
    expect(block).toContain('Missing context:');
    expect(block).toContain('- issue #12: unreachable');
    expect(block).toContain('- doc docs/x.md: not_found');
    // a `used` source never appears in the missing-context list
    expect(block).not.toContain('title title: used');
  });

  it('appends a stale note naming the short SHA it was derived for', () => {
    const block = intentBlockText(intent({ head_sha: 'abc1234def' }), true);
    expect(block).toContain('derived for abc1234');
    expect(block).toContain('the PR has changed');
  });
});

describe('shouldFilterScope (D12)', () => {
  it('is on for medium/high tier and a fresh (non-stale) intent', () => {
    expect(shouldFilterScope('medium', false)).toBe(true);
    expect(shouldFilterScope('high', false)).toBe(true);
  });

  it('is off for a low tier, regardless of staleness', () => {
    expect(shouldFilterScope('low', false)).toBe(false);
    expect(shouldFilterScope('low', true)).toBe(false);
  });

  it('is off while stale, even at high tier (D2 — outdated scope must not delete findings)', () => {
    expect(shouldFilterScope('high', true)).toBe(false);
    expect(shouldFilterScope('medium', true)).toBe(false);
  });
});
