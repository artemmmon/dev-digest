import { and, eq, ne } from 'drizzle-orm';
import { Tour } from '@devdigest/shared';
import type { DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { GenerationRecord, TourStore } from './ports.js';

/**
 * Onboarding tour data-access (Drizzle implementation of TourStore): the stored tour
 * (`onboarding`) and the generation state (`onboarding_generations`), one row each per repo.
 * Rows are keyed by repo only — the service checks the repo's workspace before every call.
 */
export class OnboardingRepository implements TourStore {
  constructor(private db: DbOrTx) {}

  async getTour(repoId: string): Promise<Tour | null> {
    const [row] = await this.db
      .select({ json: t.onboarding.json })
      .from(t.onboarding)
      .where(eq(t.onboarding.repoId, repoId));
    if (!row) return null;
    const parsed = Tour.safeParse(row.json);
    return parsed.success ? parsed.data : null;
  }

  async getGeneration(repoId: string): Promise<GenerationRecord | null> {
    const [row] = await this.db
      .select()
      .from(t.onboardingGenerations)
      .where(eq(t.onboardingGenerations.repoId, repoId));
    return row ? { status: row.status, startedAt: row.startedAt, error: row.error } : null;
  }

  /** One statement: insert, or take over a row that is not `running`; no row back = already running. */
  async claim(repoId: string, now: Date): Promise<Date | null> {
    const g = t.onboardingGenerations;
    const [row] = await this.db
      .insert(g)
      .values({ repoId, status: 'running', startedAt: now, error: null, updatedAt: now })
      .onConflictDoUpdate({
        target: g.repoId,
        set: { status: 'running', startedAt: now, error: null, updatedAt: now },
        setWhere: ne(g.status, 'running'),
      })
      .returning({ startedAt: g.startedAt });
    return row?.startedAt ?? null;
  }

  async complete(repoId: string, startedAt: Date, tour: Tour): Promise<boolean> {
    const g = t.onboardingGenerations;
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(g)
        .set({ status: 'idle', error: null, updatedAt: new Date() })
        .where(and(eq(g.repoId, repoId), eq(g.startedAt, startedAt), eq(g.status, 'running')))
        .returning({ repoId: g.repoId });
      if (updated.length === 0) return false;
      const generatedAt = new Date(tour.generated_at);
      await tx
        .insert(t.onboarding)
        .values({ repoId, json: tour, generatedAt })
        .onConflictDoUpdate({ target: t.onboarding.repoId, set: { json: tour, generatedAt } });
      return true;
    });
  }

  async fail(repoId: string, startedAt: Date, message: string): Promise<void> {
    const g = t.onboardingGenerations;
    await this.db
      .update(g)
      .set({ status: 'failed', error: message, updatedAt: new Date() })
      .where(and(eq(g.repoId, repoId), eq(g.startedAt, startedAt), eq(g.status, 'running')));
  }

  async reapRunning(message: string): Promise<number> {
    const g = t.onboardingGenerations;
    const rows = await this.db
      .update(g)
      .set({ status: 'failed', error: message, updatedAt: new Date() })
      .where(eq(g.status, 'running'))
      .returning({ repoId: g.repoId });
    return rows.length;
  }
}
