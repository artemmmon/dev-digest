import type { StatsPeriodQuery } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { MS_PER_HOUR, WINDOW_HOURS } from './constants.js';
import type { StatsWindow } from './ports.js';

/**
 * The window of a read. 1d and 30d are rolling windows that end at `now`; a custom range runs
 * from `from` to `to` (full instants the client computed from local dates, so no time zone here).
 */
export function resolveWindow(query: StatsPeriodQuery, now: Date): StatsWindow {
  if (query.period === 'custom') {
    // The query schema already requires both; guard anyway so a bypassed schema is a 422, not NaN.
    if (query.from === undefined || query.to === undefined) {
      throw new ValidationError('from and to are required for a custom period');
    }
    return { from: new Date(query.from), to: new Date(query.to) };
  }
  return { from: new Date(now.getTime() - WINDOW_HOURS[query.period] * MS_PER_HOUR), to: now };
}
