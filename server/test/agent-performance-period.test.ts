/** SPEC-16 — AC-6: the window each period resolves to. Rolling 1d / 30d end at `now`; custom is as sent. */
import { describe, expect, it } from 'vitest';
import { StatsPeriodQuery } from '@devdigest/shared';
import { resolveWindow } from '../src/modules/agent-performance/period.js';
import { ValidationError } from '../src/platform/errors.js';

const NOW = new Date('2026-10-21T12:00:00.000Z');
const HOUR = 3_600_000;

describe('resolveWindow', () => {
  it('AC-6: 1d is the 24 hours that end now', () => {
    const w = resolveWindow({ period: '1d' }, NOW);
    expect(w.to).toEqual(NOW);
    expect(NOW.getTime() - w.from.getTime()).toBe(24 * HOUR);
  });

  it('AC-6: 30d is the 30 x 24 hours that end now', () => {
    const w = resolveWindow({ period: '30d' }, NOW);
    expect(w.to).toEqual(NOW);
    expect(NOW.getTime() - w.from.getTime()).toBe(30 * 24 * HOUR);
  });

  it('AC-6: custom is exactly the instants the client sent, later than now included', () => {
    const w = resolveWindow(
      { period: 'custom', from: '2026-10-01T00:00:00.000+03:00', to: '2026-10-25T23:59:59.999+03:00' },
      NOW,
    );
    expect(w.from.toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-10-25T20:59:59.999Z');
  });

  it('AC-6: the window does not depend on the machine time zone (instants in, instants out)', () => {
    const q = StatsPeriodQuery.parse({ period: 'custom', from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' });
    expect(resolveWindow(q, NOW).from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('a custom query that skipped the schema is a validation error, not an invalid date', () => {
    expect(() => resolveWindow({ period: 'custom' }, NOW)).toThrow(ValidationError);
  });
});
