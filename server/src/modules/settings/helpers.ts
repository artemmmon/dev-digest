import type { Settings } from '@devdigest/shared';
import type { SettingsRow } from './ports.js';

/** Collapse key/value setting rows into a flat `Settings` object. */
export function rowsToSettings(rows: SettingsRow[]): Settings {
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  return out as Settings;
}
