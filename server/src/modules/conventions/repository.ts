import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { ConventionCategory } from '@devdigest/shared';
import type { DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  ConventionRecord,
  ConventionStore,
  DecidedRule,
  NewConvention,
} from './ports.js';

/**
 * Conventions data-access (Drizzle implementation of ConventionStore). Every query is scoped
 * by workspace AND repo, so an id from another repo can never be read or changed through this one.
 */

type ConventionRow = typeof t.conventions.$inferSelect;

const KNOWN_CATEGORIES: ReadonlySet<string> = new Set(ConventionCategory.options);

function toRecord(r: ConventionRow): ConventionRecord {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    repoId: r.repoId,
    category: (KNOWN_CATEGORIES.has(r.category) ? r.category : 'other') as ConventionRecord['category'],
    rule: r.rule,
    evidencePath: r.evidencePath ?? '',
    evidenceLine: r.evidenceLine ?? 1,
    evidenceEndLine: r.evidenceEndLine,
    evidenceSnippet: r.evidenceSnippet ?? '',
    confidence: r.confidence ?? 0,
    status: r.status,
    commitSha: r.commitSha,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export class ConventionsRepository implements ConventionStore {
  constructor(private db: DbOrTx) {}

  private inTransaction<T>(work: (repo: ConventionsRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new ConventionsRepository(tx)));
  }

  private scope(workspaceId: string, repoId: string) {
    return and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId));
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionRecord[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(this.scope(workspaceId, repoId))
      .orderBy(desc(t.conventions.createdAt), desc(t.conventions.confidence));
    return rows.map(toRecord);
  }

  async listDecided(workspaceId: string, repoId: string): Promise<DecidedRule[]> {
    const rows = await this.db
      .select({ rule: t.conventions.rule, status: t.conventions.status })
      .from(t.conventions)
      .where(and(this.scope(workspaceId, repoId), ne(t.conventions.status, 'pending')));
    return rows.map((r) => ({ rule: r.rule, status: r.status as DecidedRule['status'] }));
  }

  /** Only pending rows go; accepted and rejected ones are decisions and stay. */
  async replacePending(
    workspaceId: string,
    repoId: string,
    rows: NewConvention[],
  ): Promise<ConventionRecord[]> {
    return this.inTransaction(async (repo) => {
      await repo.db
        .delete(t.conventions)
        .where(and(repo.scope(workspaceId, repoId), eq(t.conventions.status, 'pending')));
      if (rows.length === 0) return [];
      const inserted = await repo.db
        .insert(t.conventions)
        .values(
          rows.map((r) => ({
            workspaceId,
            repoId,
            category: r.category,
            rule: r.rule,
            evidencePath: r.evidencePath,
            evidenceLine: r.evidenceLine,
            evidenceEndLine: r.evidenceEndLine,
            evidenceSnippet: r.evidenceSnippet,
            confidence: r.confidence,
            status: 'pending' as const,
            commitSha: r.commitSha,
          })),
        )
        .returning();
      return inserted.map(toRecord);
    });
  }

  async getById(workspaceId: string, repoId: string, id: string): Promise<ConventionRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(this.scope(workspaceId, repoId), eq(t.conventions.id, id)));
    return row && toRecord(row);
  }

  async getByIds(workspaceId: string, repoId: string, ids: string[]): Promise<ConventionRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(and(this.scope(workspaceId, repoId), inArray(t.conventions.id, ids)));
    return rows.map(toRecord);
  }

  async update(
    workspaceId: string,
    repoId: string,
    id: string,
    patch: { status?: ConventionRecord['status']; rule?: string },
  ): Promise<ConventionRecord | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        updatedAt: new Date(),
      })
      .where(and(this.scope(workspaceId, repoId), eq(t.conventions.id, id)))
      .returning();
    return row && toRecord(row);
  }
}
