import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  InsertSkill,
  SkillRecord,
  SkillStore,
  SkillVersionRecord,
  UpdateSkill,
} from './ports.js';

/**
 * Skills data-access (Drizzle implementation of SkillStore). Owns `skills` and
 * `skill_versions`; the agent side of `agent_skills` belongs to the agents module.
 * Workspace-scoped throughout; hands out records, never Drizzle rows.
 */

type SkillRow = typeof t.skills.$inferSelect;

const INITIAL_SKILL_VERSION = 1;

function toRecord(r: SkillRow): SkillRecord {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    name: r.name,
    description: r.description,
    type: r.type,
    source: r.source,
    body: r.body,
    enabled: r.enabled,
    version: r.version,
    evidenceFiles: r.evidenceFiles,
    appliesTo: r.appliesTo,
    createdAt: r.createdAt,
  };
}

export class SkillsRepository implements SkillStore {
  constructor(private db: DbOrTx) {}

  private inTransaction<T>(work: (repo: SkillsRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new SkillsRepository(tx)));
  }

  async list(workspaceId: string): Promise<SkillRecord[]> {
    const rows = await this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
    return rows.map(toRecord);
  }

  async getById(workspaceId: string, id: string): Promise<SkillRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row && toRecord(row);
  }

  /** One unit, so a skill never exists without its version-1 body. */
  async insert(values: InsertSkill): Promise<SkillRecord> {
    return this.inTransaction(async (repo) => {
      const [row] = await repo.db
        .insert(t.skills)
        .values({ ...values, version: INITIAL_SKILL_VERSION })
        .returning();
      await repo.db
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: INITIAL_SKILL_VERSION, body: row!.body });
      return toRecord(row!);
    });
  }

  /**
   * Read → bump → store is one unit; the row lock serialises concurrent saves
   * (same reason as `AgentsRepository.update`). Only a changed body bumps the
   * version: name / description / type edits do not.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<SkillRecord | undefined> {
    return this.inTransaction(async (repo) => {
      const [existing] = await repo.db
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .for('update');
      if (!existing) return undefined;

      const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
      const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

      const [row] = await repo.db
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.evidenceFiles !== undefined ? { evidenceFiles: patch.evidenceFiles } : {}),
          ...(patch.appliesTo !== undefined ? { appliesTo: patch.appliesTo } : {}),
          ...(bodyChanged ? { version: nextVersion } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();

      if (bodyChanged && row) {
        await repo.db
          .insert(t.skillVersions)
          .values({
            skillId: id,
            version: nextVersion,
            body: row.body,
            message: patch.message?.trim() || null,
          })
          .onConflictDoNothing();
      }
      if (row && patch.context) {
        await repo.replaceContextDocs(id, patch.context.repoId, patch.context.paths);
      }
      return row && toRecord(row);
    });
  }

  /** Delete + insert the skill's list for one repo, position = index. Caller holds the skill row lock. */
  private async replaceContextDocs(skillId: string, repoId: string, paths: string[]): Promise<void> {
    await this.db
      .delete(t.skillContextDocs)
      .where(and(eq(t.skillContextDocs.skillId, skillId), eq(t.skillContextDocs.repoId, repoId)));
    if (paths.length > 0) {
      await this.db
        .insert(t.skillContextDocs)
        .values(paths.map((path, position) => ({ skillId, repoId, path, position })));
    }
  }

  async contextPaths(skillId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(and(eq(t.skillContextDocs.skillId, skillId), eq(t.skillContextDocs.repoId, repoId)))
      .orderBy(asc(t.skillContextDocs.position));
    return rows.map((r) => r.path);
  }

  async contextPathsFor(skillIds: string[], repoId: string): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (skillIds.length === 0) return out;
    const rows = await this.db
      .select({ skillId: t.skillContextDocs.skillId, path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(and(inArray(t.skillContextDocs.skillId, skillIds), eq(t.skillContextDocs.repoId, repoId)))
      .orderBy(asc(t.skillContextDocs.skillId), asc(t.skillContextDocs.position));
    for (const r of rows) out.set(r.skillId, [...(out.get(r.skillId) ?? []), r.path]);
    return out;
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersionRecord[] | undefined> {
    if (!(await this.getById(workspaceId, id))) return undefined;
    const rows = await this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, id))
      .orderBy(desc(t.skillVersions.version));
    return rows.map((r) => ({
      version: r.version,
      body: r.body,
      message: r.message,
      createdAt: r.createdAt,
    }));
  }

  async setEnabled(
    workspaceId: string,
    id: string,
    enabled: boolean,
  ): Promise<SkillRecord | undefined> {
    const [row] = await this.db
      .update(t.skills)
      .set({ enabled, updatedAt: new Date() })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();
    return row && toRecord(row);
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }
}
