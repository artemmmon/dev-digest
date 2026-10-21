import { and, eq, gt, gte, inArray, isNotNull, lt, lte, or, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { COUNTED_RUN_STATUSES } from './constants.js';
import type { CountedRun, RunStatsStore, StatsWindow } from './ports.js';

type CountedStatus = CountedRun['status'];

const isCountedStatus = (s: string | null): s is CountedStatus =>
  s !== null && (COUNTED_RUN_STATUSES as readonly string[]).includes(s);

/**
 * Read-only access to the counted runs of the performance views (SPEC-16). Every query carries a
 * `workspace_id` predicate, the decisions subquery included. No write, no `source` filter (local
 * and CI runs both count); eval runs live in their own tables, never in `agent_runs`.
 */
export class AgentPerformanceRepository implements RunStatsStore {
  constructor(private readonly db: DbOrTx) {}

  /**
   * Counted runs that started inside the window, each with the number of accepted, dismissed and
   * pending findings of the review it produced (any finding `kind`). One row per run.
   */
  async countedRuns(workspaceId: string, window: StatsWindow, agentId?: string): Promise<CountedRun[]> {
    const decisions = this.db
      .select({
        runId: t.reviews.runId,
        accepted: sql<number>`(count(*) filter (where ${t.findings.acceptedAt} is not null))::int`.as('accepted'),
        dismissed:
          sql<number>`(count(*) filter (where ${t.findings.dismissedAt} is not null and ${t.findings.acceptedAt} is null))::int`.as(
            'dismissed',
          ),
        pending:
          sql<number>`(count(*) filter (where ${t.findings.acceptedAt} is null and ${t.findings.dismissedAt} is null))::int`.as(
            'pending',
          ),
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.reviews.workspaceId, workspaceId), isNotNull(t.reviews.runId)))
      .groupBy(t.reviews.runId)
      .as('decisions');

    const rows = await this.db
      .select({
        agentId: t.agentRuns.agentId,
        model: t.agentRuns.model,
        status: t.agentRuns.status,
        costUsd: t.agentRuns.costUsd,
        durationMs: t.agentRuns.durationMs,
        ranAt: t.agentRuns.ranAt,
        accepted: sql<number>`coalesce(${decisions.accepted}, 0)`,
        dismissed: sql<number>`coalesce(${decisions.dismissed}, 0)`,
        pending: sql<number>`coalesce(${decisions.pending}, 0)`,
      })
      .from(t.agentRuns)
      .leftJoin(decisions, eq(decisions.runId, t.agentRuns.id))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          gte(t.agentRuns.ranAt, window.from),
          lte(t.agentRuns.ranAt, window.to),
          inArray(t.agentRuns.status, [...COUNTED_RUN_STATUSES]),
          agentId === undefined ? undefined : eq(t.agentRuns.agentId, agentId),
        ),
      );

    return rows.flatMap((r) =>
      isCountedStatus(r.status)
        ? [
            {
              agentId: r.agentId,
              model: r.model,
              status: r.status,
              costUsd: r.costUsd,
              durationMs: r.durationMs,
              ranAt: r.ranAt,
              accepted: Number(r.accepted),
              dismissed: Number(r.dismissed),
              pending: Number(r.pending),
            },
          ]
        : [],
    );
  }

  /** Whether the workspace has any counted run that started outside the window. */
  async hasCountedRunsOutside(workspaceId: string, window: StatsWindow): Promise<boolean> {
    const rows = await this.db
      .select({ one: sql<number>`1` })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          inArray(t.agentRuns.status, [...COUNTED_RUN_STATUSES]),
          or(lt(t.agentRuns.ranAt, window.from), gt(t.agentRuns.ranAt, window.to)),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
