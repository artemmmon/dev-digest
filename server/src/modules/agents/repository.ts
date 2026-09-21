import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { DEFAULT_AGENT_DESCRIPTION, INITIAL_AGENT_VERSION } from './constants.js';
import { isConfigChange } from './helpers.js';
import type {
  AgentRecord,
  AgentStore,
  AgentVersionRecord,
  InsertAgent,
  ResolvedSkill,
  SkillBinding,
  SkillLink,
  UpdateAgent,
} from './ports.js';

/**
 * A2 — agents data-access (Drizzle implementation of AgentStore). Owns `agents`,
 * `agent_versions`, and the agent side of the `agent_skills` link table.
 * Workspace-scoped throughout; hands out records, never Drizzle rows.
 */

type AgentRow = typeof t.agents.$inferSelect;
type AgentVersionRow = typeof t.agentVersions.$inferSelect;

function toRecord(r: AgentRow): AgentRecord {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    name: r.name,
    description: r.description,
    provider: r.provider,
    model: r.model,
    systemPrompt: r.systemPrompt,
    outputSchema: r.outputSchema,
    strategy: r.strategy,
    ciFailOn: r.ciFailOn,
    repoIntel: r.repoIntel,
    enabled: r.enabled,
    version: r.version,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  };
}

function toVersionRecord(r: AgentVersionRow): AgentVersionRecord {
  return { agentId: r.agentId, version: r.version, configJson: r.configJson, createdAt: r.createdAt };
}

export class AgentsRepository implements AgentStore {
  constructor(private db: DbOrTx) {}

  /** Run `work` against a copy of this repository bound to one transaction. */
  private inTransaction<T>(work: (repo: AgentsRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new AgentsRepository(tx)));
  }

  async list(workspaceId: string): Promise<AgentRecord[]> {
    const rows = await this.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
    const counts = await this.activeSkillCounts(workspaceId);
    return rows.map((r) => ({ ...toRecord(r), skillCount: counts.get(r.id) ?? 0 }));
  }

  /** agent id → number of skills that reach its prompt (binding and skill enabled). */
  private async activeSkillCounts(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ agentId: t.agentSkills.agentId, n: sql<number>`count(*)::int` })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(
        and(
          eq(t.skills.workspaceId, workspaceId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
        ),
      )
      .groupBy(t.agentSkills.agentId);
    return new Map(rows.map((r) => [r.agentId, r.n]));
  }

  /** skill id → number of agents with an enabled binding to it (the skills module's usage port). */
  async agentCounts(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ skillId: t.agentSkills.skillId, n: sql<number>`count(*)::int` })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agentSkills.enabled, true)))
      .groupBy(t.agentSkills.skillId);
    return new Map(rows.map((r) => [r.skillId, r.n]));
  }

  async agentsUsing(workspaceId: string, skillId: string): Promise<Array<{ id: string; name: string }>> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.agentSkills.skillId, skillId),
          eq(t.agentSkills.enabled, true),
        ),
      )
      .orderBy(asc(t.agents.name));
  }

  async listEnabled(workspaceId: string): Promise<AgentRecord[]> {
    const rows = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
    return rows.map(toRecord);
  }

  async getById(workspaceId: string, id: string): Promise<AgentRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row && toRecord(row);
  }

  /** The subset of `skillIds` that exist in the workspace. */
  async skillIdsInWorkspace(workspaceId: string, skillIds: string[]): Promise<Set<string>> {
    if (skillIds.length === 0) return new Set();
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, skillIds)));
    return new Set(rows.map((r) => r.id));
  }

  /** id → name for the given agents in the workspace, in one query. */
  async namesByIds(workspaceId: string, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), inArray(t.agents.id, ids)));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /** Delete an agent (scoped to workspace). Versions/skill-links cascade;
   *  agent_runs keep their history with agent_id set null. Returns false if
   *  no such agent existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning({ id: t.agents.id });
    return rows.length > 0;
  }

  /** Insert an agent AND record version 1 in agent_versions (immutable snapshot). */
  async insert(values: InsertAgent): Promise<AgentRecord> {
    // One unit, so an agent never exists without its version-1 snapshot.
    return this.inTransaction((repo) => repo.insertWithSnapshot(values));
  }

  private async insertWithSnapshot(values: InsertAgent): Promise<AgentRecord> {
    const [row] = await this.db
      .insert(t.agents)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? DEFAULT_AGENT_DESCRIPTION,
        provider: values.provider,
        model: values.model,
        systemPrompt: values.systemPrompt,
        outputSchema: (values.outputSchema as object | undefined) ?? null,
        ...(values.strategy !== undefined ? { strategy: values.strategy } : {}),
        ...(values.ciFailOn !== undefined ? { ciFailOn: values.ciFailOn } : {}),
        ...(values.repoIntel !== undefined ? { repoIntel: values.repoIntel } : {}),
        enabled: values.enabled ?? true,
        version: INITIAL_AGENT_VERSION,
        createdBy: values.createdBy ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_AGENT_VERSION);
    return toRecord(row!);
  }

  /**
   * Update an agent. Any config change bumps the version and snapshots the new
   * config into agent_versions (reproducibility for eval).
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgent,
  ): Promise<AgentRecord | undefined> {
    // Read → bump → snapshot is one unit, and the row lock serialises concurrent
    // saves: without it two edits both write version N+1 and one snapshot is
    // silently dropped by onConflictDoNothing.
    return this.inTransaction((repo) => repo.updateLocked(workspaceId, id, patch));
  }

  private async updateLocked(
    workspaceId: string,
    id: string,
    patch: UpdateAgent,
  ): Promise<AgentRecord | undefined> {
    const [existing] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .for('update');
    if (!existing) return undefined;

    // A config-affecting change (anything except just toggling enabled) bumps version.
    const configChanged = isConfigChange(existing, patch);
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.agents)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
        ...(patch.systemPrompt !== undefined ? { systemPrompt: patch.systemPrompt } : {}),
        ...(patch.outputSchema !== undefined
          ? { outputSchema: patch.outputSchema as object }
          : {}),
        ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
        ...(patch.ciFailOn !== undefined ? { ciFailOn: patch.ciFailOn } : {}),
        ...(patch.repoIntel !== undefined ? { repoIntel: patch.repoIntel } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(configChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning();

    if (configChanged && row) await this.snapshotVersion(row, nextVersion);
    return row && toRecord(row);
  }

  private async snapshotVersion(row: AgentRow, version: number): Promise<void> {
    // The snapshot holds the skills that were switched on, in prompt order.
    const skills = (await this.linkedSkills(row.id)).filter((l) => l.enabled).map((l) => l.skillId);
    await this.db
      .insert(t.agentVersions)
      .values({
        agentId: row.id,
        version,
        configJson: {
          provider: row.provider,
          model: row.model,
          system_prompt: row.systemPrompt,
          output_schema: row.outputSchema,
          strategy: row.strategy,
          ci_fail_on: row.ciFailOn,
          repo_intel: row.repoIntel,
          skills,
        },
      })
      .onConflictDoNothing();
  }

  // ---- agent_versions (immutable config snapshots) ------------------------

  /** All config snapshots for an agent, newest version first. */
  async listVersions(agentId: string): Promise<AgentVersionRecord[]> {
    const rows = await this.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId))
      .orderBy(desc(t.agentVersions.version));
    return rows.map(toVersionRecord);
  }

  /** A single config snapshot, or undefined if that version was never recorded. */
  async getVersion(agentId: string, version: number): Promise<AgentVersionRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    return row && toVersionRecord(row);
  }

  // ---- agent_skills link table (A2 owns the agent side) -------------------

  /** Skills linked to an agent, in `order` ascending. */
  async linkedSkills(agentId: string): Promise<SkillLink[]> {
    return this.db
      .select({
        skillId: t.agentSkills.skillId,
        order: t.agentSkills.order,
        enabled: t.agentSkills.enabled,
      })
      .from(t.agentSkills)
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
  }

  /** Link a skill to an agent at a given order (idempotent: upserts order). */
  async linkSkill(agentId: string, skillId: string, order: number): Promise<void> {
    await this.db
      .insert(t.agentSkills)
      .values({ agentId, skillId, order })
      .onConflictDoUpdate({
        target: [t.agentSkills.agentId, t.agentSkills.skillId],
        set: { order },
      });
  }

  /**
   * Replace the full set of bindings for an agent, order = index. Used by the "Skills"
   * editor tab (attach / toggle / reorder); skills not in the list are unlinked.
   * Delete + insert + version bump are one unit under the agent row lock, so a failed
   * insert never leaves the agent without skills and two saves cannot both claim vN+1.
   */
  async setSkills(
    workspaceId: string,
    agentId: string,
    bindings: SkillBinding[],
  ): Promise<boolean> {
    return this.inTransaction((repo) => repo.setSkillsLocked(workspaceId, agentId, bindings));
  }

  private async setSkillsLocked(
    workspaceId: string,
    agentId: string,
    bindings: SkillBinding[],
  ): Promise<boolean> {
    const [agent] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)))
      .for('update');
    if (!agent) return false;

    const before = (await this.linkedSkills(agentId)).filter((l) => l.enabled).map((l) => l.skillId);
    await this.db.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
    if (bindings.length > 0) {
      await this.db.insert(t.agentSkills).values(
        bindings.map((b, i) => ({ agentId, skillId: b.skillId, order: i, enabled: b.enabled })),
      );
    }

    // Only a change to what reaches the prompt is a config change; muting a binding that
    // was already off, or reordering nothing, is not.
    const after = bindings.filter((b) => b.enabled).map((b) => b.skillId);
    if (before.length !== after.length || before.some((id, i) => id !== after[i])) {
      const nextVersion = agent.version + 1;
      const [row] = await this.db
        .update(t.agents)
        .set({ version: nextVersion })
        .where(eq(t.agents.id, agentId))
        .returning();
      await this.snapshotVersion(row!, nextVersion);
    }
    return true;
  }

  /** Skills for the prompt: binding AND skill enabled, in binding order. */
  async resolvedSkills(agentId: string): Promise<ResolvedSkill[]> {
    return this.db
      .select({ id: t.skills.id, name: t.skills.name, body: t.skills.body })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
        ),
      )
      .orderBy(asc(t.agentSkills.order));
  }
}
