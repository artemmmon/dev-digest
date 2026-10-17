import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import {
  CiFailureReason,
  Verdict,
  type CiRun,
  type CiRunPage,
  type CiRunsQuery,
  type RunTrace,
} from '@devdigest/shared';
import type { DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { AppError, ValidationError } from '../../platform/errors.js';
import { REFRESH_SKIP_MS } from './constants.js';
import type {
  CiInstallationRecord,
  CiInstallationWithLastRun,
  CiStore,
  NewCiAgentRun,
  NewCiInstallation,
  NewCiRun,
} from './ports.js';

/**
 * CI data-access (Drizzle implementation of CiStore): installations (`ci_installations`),
 * runs (`ci_runs`) and, for a verified run, the `agent_runs` + `run_traces` rows it owns.
 * Every query that starts from a workspace is filtered by `workspace_id`; the methods that
 * take an installation id (`claimIngest`, `setRepositoryId`) receive ids that an earlier
 * workspace-scoped read returned. All SQL goes through Drizzle's builders and `sql` values.
 */

const UNIQUE_VIOLATION = '23505';
const PERIOD_DAYS = { '7d': 7, '30d': 30 } as const;
/** The source stored on a run ingested from GitHub Actions. */
const RUN_SOURCE = 'gha';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type InstallationRow = typeof t.ciInstallations.$inferSelect;

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  return e?.code === UNIQUE_VIOLATION || e?.cause?.code === UNIQUE_VIOLATION;
}

function toInstallation(row: InstallationRow): CiInstallationRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    repoId: row.repoId,
    repo: row.repo,
    repositoryId: row.repositoryId,
    method: row.method,
    agentVersion: row.agentVersion,
    runnerVersion: row.runnerVersion,
    manifestSha256: row.manifestSha256,
    triggers: row.triggers,
    postAs: row.postAs,
    prUrl: row.prUrl,
    installedAt: row.installedAt,
    endedAt: row.endedAt,
    lastIngestedAt: row.lastIngestedAt,
  };
}

/** The keyset cursor is `<ran_at ISO>|<run uuid>`; anything else is a client error. */
function parseCursor(cursor: string): { ranAt: Date; id: string } {
  const [iso, id, ...rest] = cursor.split('|');
  const ranAt = new Date(iso ?? '');
  if (rest.length > 0 || !id || !UUID.test(id) || Number.isNaN(ranAt.getTime())) {
    throw new ValidationError('The cursor is not valid');
  }
  return { ranAt, id };
}

export class CiRepository implements CiStore {
  constructor(private db: DbOrTx) {}

  async activeInstallationForRepo(
    workspaceId: string,
    repo: string,
  ): Promise<CiInstallationRecord | undefined> {
    const i = t.ciInstallations;
    const [row] = await this.db
      .select()
      .from(i)
      .where(and(eq(i.workspaceId, workspaceId), eq(i.repo, repo), isNull(i.endedAt)));
    return row && toInstallation(row);
  }

  async listInstallations(workspaceId: string, agentId: string): Promise<CiInstallationWithLastRun[]> {
    const i = t.ciInstallations;
    const r = t.ciRuns;
    const rows = await this.db
      .select()
      .from(i)
      .where(and(eq(i.workspaceId, workspaceId), eq(i.agentId, agentId)))
      .orderBy(desc(i.installedAt), desc(i.id));
    if (rows.length === 0) return [];
    const latest = await this.db
      .selectDistinctOn([r.ciInstallationId], {
        installationId: r.ciInstallationId,
        status: r.status,
        ranAt: r.ranAt,
      })
      .from(r)
      .where(
        and(
          eq(r.workspaceId, workspaceId),
          inArray(
            r.ciInstallationId,
            rows.map((x) => x.id),
          ),
        ),
      )
      .orderBy(r.ciInstallationId, desc(r.ranAt), desc(r.id));
    const byInstallation = new Map(latest.map((x) => [x.installationId, x]));
    return rows.map((row) => {
      const last = byInstallation.get(row.id);
      return { ...toInstallation(row), lastRunStatus: last?.status ?? null, lastRunAt: last?.ranAt ?? null };
    });
  }

  async listActiveInstallations(workspaceId: string): Promise<CiInstallationRecord[]> {
    const i = t.ciInstallations;
    const rows = await this.db
      .select()
      .from(i)
      .where(and(eq(i.workspaceId, workspaceId), isNull(i.endedAt)))
      .orderBy(i.installedAt, i.id);
    return rows.map(toInstallation);
  }

  /** One transaction: ending the old installations and inserting the new one succeed or fail together. */
  async replaceInstallation(next: NewCiInstallation, endIds: string[]): Promise<CiInstallationRecord> {
    const i = t.ciInstallations;
    try {
      return await this.db.transaction(async (tx) => {
        if (endIds.length > 0) {
          await tx
            .update(i)
            .set({ endedAt: sql`now()` })
            .where(and(eq(i.workspaceId, next.workspaceId), inArray(i.id, endIds), isNull(i.endedAt)));
        }
        const [row] = await tx
          .insert(i)
          .values({
            workspaceId: next.workspaceId,
            agentId: next.agentId,
            repoId: next.repoId,
            repo: next.repo,
            repositoryId: next.repositoryId,
            targetType: 'gha',
            method: next.method,
            agentVersion: next.agentVersion,
            runnerVersion: next.runnerVersion,
            manifestSha256: next.manifestSha256,
            triggers: next.triggers,
            postAs: next.postAs,
            prUrl: next.prUrl,
            installedAt: next.installedAt,
          })
          .returning();
        return toInstallation(row!);
      });
    } catch (err) {
      // Two exports into one repository raced: the partial unique index let only one through.
      if (isUniqueViolation(err)) {
        throw new AppError('ci_install_conflict', 'Another export into this repository just finished', 409);
      }
      throw err;
    }
  }

  /** One conditional UPDATE: the winner of a concurrent refresh is the one that gets a row back. */
  async claimIngest(installationId: string, force: boolean): Promise<boolean> {
    const i = t.ciInstallations;
    const stale = or(
      isNull(i.lastIngestedAt),
      sql`${i.lastIngestedAt} < now() - (${REFRESH_SKIP_MS}::int * interval '1 millisecond')`,
    );
    const claimed = await this.db
      .update(i)
      .set({ lastIngestedAt: sql`now()` })
      .where(and(eq(i.id, installationId), isNull(i.endedAt), force ? undefined : stale))
      .returning({ id: i.id });
    return claimed.length > 0;
  }

  async setRepositoryId(installationId: string, repositoryId: number): Promise<void> {
    const i = t.ciInstallations;
    await this.db
      .update(i)
      .set({ repositoryId })
      .where(and(eq(i.id, installationId), isNull(i.repositoryId)));
  }

  async knownRunIds(workspaceId: string, githubRunIds: number[]): Promise<Set<number>> {
    if (githubRunIds.length === 0) return new Set();
    const r = t.ciRuns;
    const rows = await this.db
      .select({ id: r.githubRunId })
      .from(r)
      .where(and(eq(r.workspaceId, workspaceId), inArray(r.githubRunId, githubRunIds)));
    return new Set(rows.map((x) => x.id));
  }

  /**
   * The CI run is inserted with `ON CONFLICT DO NOTHING`; only the caller that got a row back
   * writes the agent run and its trace, so a double refresh never double-counts a run.
   */
  async storeRun(run: NewCiRun, agentRun: NewCiAgentRun | null, trace: RunTrace | null): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const r = t.ciRuns;
      const result = run.result;
      const [inserted] = await tx
        .insert(r)
        .values({
          workspaceId: run.workspaceId,
          ciInstallationId: run.installationId,
          agentId: run.agentId,
          agentName: run.agentName,
          repo: run.repo,
          prNumber: run.prNumber,
          prTitle: run.prTitle,
          githubRunId: run.githubRunId,
          commitSha: run.commitSha,
          ranAt: run.ranAt ?? new Date(),
          durationMs: result?.duration_ms ?? null,
          status: run.status,
          failureReason: run.failureReason,
          findingsCount: result?.findings_count ?? null,
          critical: result?.critical ?? null,
          warning: result?.warning ?? null,
          suggestion: result?.suggestion ?? null,
          verdict: result?.verdict ?? null,
          costUsd: result?.cost_usd ?? null,
          githubUrl: run.jobUrl,
          source: RUN_SOURCE,
          manifestVersion: result?.manifest_version ?? null,
          agentVersion: result?.agent_version ?? null,
          runnerVersion: result?.runner_version ?? null,
          model: result?.model ?? null,
        })
        .onConflictDoNothing({ target: [r.workspaceId, r.githubRunId] })
        .returning({ id: r.id });
      if (!inserted) return false;
      if (!agentRun) return true;

      const [stored] = await tx
        .insert(t.agentRuns)
        .values({
          workspaceId: agentRun.workspaceId,
          agentId: agentRun.agentId,
          ranAt: agentRun.ranAt ?? new Date(),
          provider: 'openrouter',
          model: agentRun.model,
          durationMs: agentRun.durationMs,
          costUsd: agentRun.costUsd,
          status: 'done',
          source: 'ci',
          findingsCount: agentRun.findingsCount,
        })
        .returning({ id: t.agentRuns.id });
      if (trace) await tx.insert(t.runTraces).values({ runId: stored!.id, trace });
      await tx.update(r).set({ agentRunId: stored!.id }).where(eq(r.id, inserted.id));
      return true;
    });
  }

  async listRuns(workspaceId: string, query: CiRunsQuery): Promise<CiRunPage> {
    const c = t.ciRuns;
    const days = query.period === 'all' ? null : PERIOD_DAYS[query.period];
    const after = query.cursor ? parseCursor(query.cursor) : null;
    const rows = await this.db
      .select({ run: c, prId: t.pullRequests.id })
      .from(c)
      .leftJoin(t.repos, and(eq(t.repos.workspaceId, c.workspaceId), eq(t.repos.fullName, c.repo)))
      .leftJoin(
        t.pullRequests,
        and(eq(t.pullRequests.repoId, t.repos.id), eq(t.pullRequests.number, c.prNumber)),
      )
      .where(
        and(
          eq(c.workspaceId, workspaceId),
          days === null ? undefined : sql`${c.ranAt} >= now() - (${days}::int * interval '1 day')`,
          query.agent_id ? eq(c.agentId, query.agent_id) : undefined,
          query.repo ? eq(c.repo, query.repo) : undefined,
          query.status ? eq(c.status, query.status) : undefined,
          after
            ? or(lt(c.ranAt, after.ranAt), and(eq(c.ranAt, after.ranAt), lt(c.id, after.id)))
            : undefined,
        ),
      )
      .orderBy(desc(c.ranAt), desc(c.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1]?.run;
    const hasMore = rows.length > query.limit;
    return {
      runs: page.map((x) => toRun(x.run, x.prId)),
      next_cursor: hasMore && last?.ranAt ? `${last.ranAt.toISOString()}|${last.id}` : null,
    };
  }

  async memoryFor(workspaceId: string, repoId: string): Promise<Array<{ kind: string; content: string }>> {
    const m = t.memory;
    return this.db
      .select({ kind: m.kind, content: m.content })
      .from(m)
      .where(
        and(
          eq(m.workspaceId, workspaceId),
          or(and(eq(m.scope, 'repo'), eq(m.repoId, repoId)), eq(m.scope, 'global')),
        ),
      )
      .orderBy(m.createdAt, m.id);
  }
}

function toRun(row: typeof t.ciRuns.$inferSelect, prId: string | null): CiRun {
  const verdict = Verdict.safeParse(row.verdict);
  const reason = CiFailureReason.safeParse(row.failureReason);
  return {
    id: row.id,
    repo: row.repo,
    pr_number: row.prNumber,
    pr_title: row.prTitle,
    pr_id: prId,
    agent_id: row.agentId,
    agent_name: row.agentName,
    source: row.source,
    ran_at: row.ranAt?.toISOString() ?? null,
    duration_ms: row.durationMs,
    critical: row.critical,
    warning: row.warning,
    suggestion: row.suggestion,
    verdict: verdict.success ? verdict.data : null,
    cost_usd: row.costUsd,
    status: row.status,
    failure_reason: reason.success ? reason.data : null,
    job_url: row.githubUrl,
    commit_sha: row.commitSha,
    manifest_version: row.manifestVersion,
    agent_version: row.agentVersion,
    runner_version: row.runnerVersion,
    model: row.model,
    run_id: row.githubRunId,
  };
}
