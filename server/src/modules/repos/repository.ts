import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { RepoStack } from '@devdigest/shared';
import type { DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { NewRepo, RepoRecord, RepoStore } from './ports.js';

/**
 * F1 — repos data-access layer (Drizzle implementation of RepoStore). The ONLY
 * place that touches the `repos` table; it hands out RepoRecords, never rows.
 * Every query is scoped by `workspaceId` (tenancy guard).
 */

type RepoRow = typeof t.repos.$inferSelect;

/**
 * `stack` is a plain jsonb column (no `$type<>`), so a row from BEFORE this shape
 * existed, or one hand-edited, must not break `GET /repos` — `safeParse` degrades
 * anything unexpected to `null` instead of throwing out of response serialization.
 */
function parseStack(raw: unknown): RepoStack | null {
  if (raw == null) return null;
  const parsed = RepoStack.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function toRecord(r: RepoRow): RepoRecord {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    owner: r.owner,
    name: r.name,
    fullName: r.fullName,
    defaultBranch: r.defaultBranch,
    clonePath: r.clonePath,
    lastPolledAt: r.lastPolledAt,
    createdBy: r.createdBy,
    stack: parseStack(r.stack),
  };
}

export class RepoRepository implements RepoStore {
  constructor(private db: DbOrTx) {}

  /** Find a repo in a workspace by its `owner/name` full name (dedupe on add). */
  async findByFullName(workspaceId: string, fullName: string): Promise<RepoRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, fullName)));
    return row && toRecord(row);
  }

  async list(workspaceId: string): Promise<RepoRecord[]> {
    const rows = await this.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
    return rows.map(toRecord);
  }

  async getById(workspaceId: string, id: string): Promise<RepoRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)));
    return row && toRecord(row);
  }

  async insert(values: NewRepo): Promise<RepoRecord> {
    const [row] = await this.db
      .insert(t.repos)
      .values({
        workspaceId: values.workspaceId,
        owner: values.owner,
        name: values.name,
        fullName: values.fullName,
        createdBy: values.createdBy,
      })
      .returning();
    return toRecord(row!);
  }

  async workspaceIdFor(repoId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ workspaceId: t.repos.workspaceId })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row?.workspaceId ?? null;
  }

  async updateClonePath(repoId: string, clonePath: string): Promise<void> {
    await this.db
      .update(t.repos)
      .set({ clonePath, lastPolledAt: new Date() })
      .where(eq(t.repos.id, repoId));
  }

  async updateStack(repoId: string, stack: RepoStack): Promise<void> {
    await this.db.update(t.repos).set({ stack }).where(eq(t.repos.id, repoId));
  }

  async listUnstacked(): Promise<RepoRecord[]> {
    const rows = await this.db
      .select()
      .from(t.repos)
      .where(and(isNotNull(t.repos.clonePath), isNull(t.repos.stack)));
    return rows.map(toRecord);
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)))
      .returning({ id: t.repos.id });
    return deleted.length > 0;
  }
}
