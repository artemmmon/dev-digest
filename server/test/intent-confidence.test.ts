import { describe, it, expect } from 'vitest';
import { computeConfidence, substantiveBodyChars } from '../src/modules/intent/confidence.js';

describe('substantiveBodyChars', () => {
  it('counts non-heading, non-whitespace characters', () => {
    expect(substantiveBodyChars('# Heading\nSome real content here')).toBe(
      'Somerealcontenthere'.length,
    );
  });

  it('returns 0 for empty/null/undefined', () => {
    expect(substantiveBodyChars('')).toBe(0);
    expect(substantiveBodyChars(null)).toBe(0);
    expect(substantiveBodyChars(undefined)).toBe(0);
  });
});

describe('computeConfidence — tier matrix (D3)', () => {
  it('documented + all linked used → high, no missing context', () => {
    const body = 'x'.repeat(100);
    const res = computeConfidence(body, [{ status: 'used' }, { status: 'used' }]);
    expect(res).toEqual({ basis: 'documented', tier: 'high', missingContext: false });
  });

  it('documented via a used linked source even with an empty body', () => {
    const res = computeConfidence('', [{ status: 'used' }]);
    expect(res.basis).toBe('documented');
    expect(res.tier).toBe('high');
  });

  it('inferred (empty body, no linked sources) → low, missing context', () => {
    const res = computeConfidence('', []);
    expect(res).toEqual({ basis: 'inferred', tier: 'low', missingContext: true });
  });

  it('documented but one linked source unreachable → medium, missing context', () => {
    const body = 'x'.repeat(100);
    const res = computeConfidence(body, [{ status: 'used' }, { status: 'unreachable' }]);
    expect(res.basis).toBe('documented');
    expect(res.tier).toBe('medium');
    expect(res.missingContext).toBe(true);
  });

  it('documented with two non-used linked sources floors at low, not negative', () => {
    const body = 'x'.repeat(100);
    const res = computeConfidence(body, [
      { status: 'not_found' },
      { status: 'too_large' },
      { status: 'unreachable' },
    ]);
    expect(res.tier).toBe('low');
    expect(res.missingContext).toBe(true);
  });

  it('a body just under the substantive threshold with no linked sources is inferred', () => {
    const res = computeConfidence('x'.repeat(79), []);
    expect(res.basis).toBe('inferred');
  });

  it('a body at the substantive threshold is documented', () => {
    const res = computeConfidence('x'.repeat(80), []);
    expect(res.basis).toBe('documented');
    expect(res.tier).toBe('high');
  });
});
