import { describe, expect, it } from 'vitest';
import { formatRoundDuration, formatRunDuration } from '../src/modules/_shared/run-duration.js';

describe('formatRunDuration', () => {
  it('shows "running" while the run has no duration yet', () => {
    expect(formatRunDuration(null)).toBe('running');
  });

  it('formats zero', () => {
    expect(formatRunDuration(0)).toBe('0ms');
  });
});

describe('formatRoundDuration', () => {
  it('treats unfinished runs as zero', () => {
    expect(formatRoundDuration([null, null])).toBe('0ms');
  });
});
