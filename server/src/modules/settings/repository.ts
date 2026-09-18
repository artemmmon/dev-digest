import { eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SettingsRow, SettingsStore } from './ports.js';

/** Drizzle implementation of the settings module's SettingsStore port. */
export class SettingsRepository implements SettingsStore {
  constructor(private db: DbOrTx) {}

  async list(workspaceId: string): Promise<SettingsRow[]> {
    return this.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
  }

  async upsert(workspaceId: string, userId: string, entries: SettingsRow[]): Promise<void> {
    if (entries.length === 0) return;
    await this.db
      .insert(t.settings)
      .values(entries.map(({ key, value }) => ({ workspaceId, userId, key, value })))
      .onConflictDoUpdate({
        target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
        set: { value: sql`excluded.value` },
      });
  }
}
