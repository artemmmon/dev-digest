import { and, asc, desc, eq, inArray, notExists, sql } from 'drizzle-orm';
import {
  EvalCaseMeta,
  EvalExpectation,
  EvalSkillVersion,
  type EvalCaseRecord,
  type EvalCaseResult,
  type EvalRunStatus,
  type EvalRunSummary,
  type EvalTrendPoint,
} from '@devdigest/shared';
import type { DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { COUNTED_STATUSES } from './constants.js';
import type {
  ClaimRun,
  DeleteCaseResult,
  EvalCaseChanges,
  EvalStore,
  InsertCaseFailure,
  NewEvalCase,
  RunCaseResult,
  RunMetrics,
} from './ports.js';

/**
 * Eval data-access (Drizzle implementation of EvalStore): cases (`eval_cases`), runs
 * (`eval_runs`) and per-case results (`eval_case_results`). Every query that starts from a
 * workspace is filtered by `workspace_id`; reads by run or case id take ids that an earlier
 * workspace-scoped read returned.
 */

const COUNTED = [...COUNTED_STATUSES];
const UNIQUE_VIOLATION = '23505';

type CaseRow = typeof t.evalCases.$inferSelect;
type RunRow = typeof t.evalRuns.$inferSelect;
type ResultRow = typeof t.evalCaseResults.$inferSelect;

/** postgres-js puts the SQLSTATE on the error (or on its `cause` when a layer wraps it). */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  return e?.code === UNIQUE_VIOLATION || e?.cause?.code === UNIQUE_VIOLATION;
}

const toNumber = (v: string | null): number | null => (v === null ? null : Number(v));
const toMoney = (v: number | null): string | null => (v === null ? null : v.toFixed(8));

function toSummary(row: RunRow): EvalRunSummary {
  const skills = EvalSkillVersion.array().safeParse(row.skillVersions);
  return {
    id: row.id,
    agent_id: row.agentId,
    agent_version: row.agentVersion,
    skill_versions: skills.success ? skills.data : [],
    status: row.status,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
    cases_total: row.casesTotal,
    cases_completed: row.casesCompleted,
    cases_errored: row.casesErrored,
    cases_passed: row.casesPassed,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    unlabelled_findings: row.unlabelledFindings,
    cost_usd: toNumber(row.costUsd),
  };
}

function toResult(row: ResultRow): EvalCaseResult {
  return {
    case_id: row.caseId,
    status: row.status,
    expected_count: row.expectedCount,
    matched_count: row.matchedCount,
    kept: row.kept,
    dropped: row.dropped,
    findings: (row.findings as EvalCaseResult['findings']) ?? [],
    duration_ms: row.durationMs,
    cost_usd: toNumber(row.costUsd),
  };
}

/** A stored case as the wire record; null when its jsonb no longer parses (the row is skipped). */
function toCaseRecord(row: CaseRow, latest: EvalCaseRecord['latest']): EvalCaseRecord | null {
  const expected = EvalExpectation.safeParse(row.expectedOutput);
  const meta = EvalCaseMeta.safeParse(row.inputMeta);
  if (!expected.success || !meta.success) return null;
  return {
    id: row.id,
    owner_kind: row.ownerKind,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_meta: meta.data,
    expected_output: expected.data,
    source_finding_id: row.sourceFindingId,
    notes: row.notes,
    created_at: row.createdAt.toISOString(),
    latest,
  };
}

const expectedCountOf = (e: EvalExpectation): number => (e.type === 'must_find' ? 1 : 0);

export class EvalRepository implements EvalStore {
  constructor(private db: DbOrTx) {}

  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseRecord[]> {
    const c = t.evalCases;
    const rows = await this.db
      .select()
      .from(c)
      .where(and(eq(c.workspaceId, workspaceId), eq(c.agentId, agentId)))
      .orderBy(asc(c.createdAt), asc(c.id));
    if (rows.length === 0) return [];

    const latestByCase = await this.latestOutcomes(rows.map((x) => x.id));

    const out: EvalCaseRecord[] = [];
    for (const row of rows) {
      const expected = EvalExpectation.safeParse(row.expectedOutput);
      if (!expected.success) continue;
      const last = latestByCase.get(row.id);
      const record = toCaseRecord(row, {
        status: last ? last.status : 'never_run',
        expected_count: expectedCountOf(expected.data),
        matched_count: last && last.status !== 'error' ? last.matched : null,
      });
      if (record) out.push(record);
    }
    return out;
  }

  /** Latest counted outcome per case: DISTINCT ON (case_id) over results of counted runs. */
  private async latestOutcomes(
    caseIds: string[],
  ): Promise<Map<string, { caseId: string; status: EvalCaseResult['status']; matched: number }>> {
    if (caseIds.length === 0) return new Map();
    const r = t.evalCaseResults;
    const run = t.evalRuns;
    const rows = await this.db
      .selectDistinctOn([r.caseId], { caseId: r.caseId, status: r.status, matched: r.matchedCount })
      .from(r)
      .innerJoin(run, eq(run.id, r.runId))
      .where(and(inArray(r.caseId, caseIds), inArray(run.status, COUNTED)))
      .orderBy(r.caseId, desc(run.startedAt));
    return new Map(rows.map((x) => [x.caseId, x]));
  }

  private async withLatest(row: CaseRow): Promise<EvalCaseRecord | undefined> {
    const expected = EvalExpectation.safeParse(row.expectedOutput);
    if (!expected.success) return undefined;
    const last = (await this.latestOutcomes([row.id])).get(row.id);
    return (
      toCaseRecord(row, {
        status: last ? last.status : 'never_run',
        expected_count: expectedCountOf(expected.data),
        matched_count: last && last.status !== 'error' ? last.matched : null,
      }) ?? undefined
    );
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCaseRecord | undefined> {
    const c = t.evalCases;
    const [row] = await this.db
      .select()
      .from(c)
      .where(and(eq(c.workspaceId, workspaceId), eq(c.id, caseId)));
    return row ? this.withLatest(row) : undefined;
  }

  async updateCase(
    workspaceId: string,
    caseId: string,
    changes: EvalCaseChanges,
  ): Promise<EvalCaseRecord | undefined> {
    const c = t.evalCases;
    const [row] = await this.db
      .update(c)
      .set({
        name: changes.name,
        inputDiff: changes.inputDiff,
        inputMeta: changes.inputMeta,
        expectedOutput: changes.expectedOutput,
      })
      .where(and(eq(c.workspaceId, workspaceId), eq(c.id, caseId)))
      .returning();
    return row ? this.withLatest(row) : undefined;
  }

  /** One DELETE with a NOT EXISTS guard on the agent's running run; no check-then-act. */
  async deleteCaseIfIdle(workspaceId: string, caseId: string): Promise<DeleteCaseResult> {
    const c = t.evalCases;
    const run = t.evalRuns;
    const deleted = await this.db
      .delete(c)
      .where(
        and(
          eq(c.workspaceId, workspaceId),
          eq(c.id, caseId),
          notExists(
            this.db
              .select({ one: sql`1` })
              .from(run)
              .where(and(eq(run.agentId, c.agentId), eq(run.status, 'running'))),
          ),
        ),
      )
      .returning({ id: c.id });
    if (deleted.length > 0) return 'deleted';
    const [still] = await this.db
      .select({ id: c.id })
      .from(c)
      .where(and(eq(c.workspaceId, workspaceId), eq(c.id, caseId)));
    return still ? 'running' : 'not_found';
  }

  async insertCase(values: NewEvalCase, limit: number): Promise<EvalCaseRecord | InsertCaseFailure> {
    const a = t.agents;
    const c = t.evalCases;
    try {
      return await this.db.transaction(async (tx) => {
        // The agent row lock serialises concurrent saves of one agent, so count + insert is atomic.
        const [agent] = await tx
          .select({ id: a.id })
          .from(a)
          .where(and(eq(a.workspaceId, values.workspaceId), eq(a.id, values.agentId)))
          .for('update');
        if (!agent) return 'no_agent' as const;
        const [counted] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(c)
          .where(and(eq(c.workspaceId, values.workspaceId), eq(c.agentId, values.agentId)));
        if ((counted?.n ?? 0) >= limit) return 'limit' as const;
        const [row] = await tx
          .insert(c)
          .values({
            workspaceId: values.workspaceId,
            ownerKind: 'agent',
            ownerId: values.agentId,
            agentId: values.agentId,
            sourceFindingId: values.sourceFindingId,
            name: values.name,
            inputDiff: values.inputDiff,
            inputMeta: values.inputMeta,
            expectedOutput: values.expectedOutput,
          })
          .returning();
        const record = toCaseRecord(row!, {
          status: 'never_run',
          expected_count: expectedCountOf(values.expectedOutput),
          matched_count: null,
        });
        // The row was written from validated values, so it always parses back.
        return record!;
      });
    } catch (err) {
      if (isUniqueViolation(err)) return 'duplicate';
      throw err;
    }
  }

  /** One insert; the partial unique index on `(agent_id) WHERE status='running'` is the claim. */
  async claimRun(values: ClaimRun): Promise<EvalRunSummary | null> {
    try {
      const [row] = await this.db
        .insert(t.evalRuns)
        .values({
          workspaceId: values.workspaceId,
          agentId: values.agentId,
          agentVersion: values.agentVersion,
          skillVersions: values.skillVersions,
          caseIds: values.caseIds,
          status: 'running',
          casesTotal: values.caseIds.length,
        })
        .returning();
      return toSummary(row!);
    } catch (err) {
      if (isUniqueViolation(err)) return null;
      throw err;
    }
  }

  async recordCaseResult(runId: string, result: EvalCaseResult): Promise<boolean> {
    const run = t.evalRuns;
    const passed = result.status === 'pass';
    const errored = result.status === 'error';
    return this.db.transaction(async (tx) => {
      const [bumped] = await tx
        .update(run)
        .set({
          casesCompleted: errored ? run.casesCompleted : sql`${run.casesCompleted} + 1`,
          casesErrored: errored ? sql`${run.casesErrored} + 1` : run.casesErrored,
          casesPassed: passed ? sql`${run.casesPassed} + 1` : run.casesPassed,
        })
        .where(and(eq(run.id, runId), eq(run.status, 'running')))
        .returning({ id: run.id });
      if (!bumped) return false;
      await tx.insert(t.evalCaseResults).values({
        runId,
        caseId: result.case_id,
        status: result.status,
        expectedCount: result.expected_count,
        matchedCount: result.matched_count,
        kept: result.kept,
        dropped: result.dropped,
        findings: result.findings,
        durationMs: result.duration_ms,
        costUsd: toMoney(result.cost_usd),
      });
      return true;
    });
  }

  async finishRun(
    runId: string,
    status: Exclude<EvalRunStatus, 'running'>,
    metrics: RunMetrics,
  ): Promise<boolean> {
    const run = t.evalRuns;
    const rows = await this.db
      .update(run)
      .set({
        status,
        finishedAt: new Date(),
        recall: metrics.recall,
        precision: metrics.precision,
        citationAccuracy: metrics.citationAccuracy,
        unlabelledFindings: metrics.unlabelledFindings,
        costUsd: toMoney(metrics.costUsd),
      })
      .where(and(eq(run.id, runId), eq(run.status, 'running')))
      .returning({ id: run.id });
    return rows.length > 0;
  }

  async listRuns(workspaceId: string, agentId: string, limit: number): Promise<EvalRunSummary[]> {
    const run = t.evalRuns;
    const rows = await this.db
      .select()
      .from(run)
      .where(and(eq(run.workspaceId, workspaceId), eq(run.agentId, agentId)))
      .orderBy(desc(run.startedAt), desc(run.id))
      .limit(limit);
    return rows.map(toSummary);
  }

  async latestCounted(workspaceId: string, agentId: string, n: number): Promise<EvalRunSummary[]> {
    const run = t.evalRuns;
    const rows = await this.db
      .select()
      .from(run)
      .where(
        and(eq(run.workspaceId, workspaceId), eq(run.agentId, agentId), inArray(run.status, COUNTED)),
      )
      .orderBy(desc(run.startedAt), desc(run.id))
      .limit(n);
    return rows.map(toSummary);
  }

  async getRuns(workspaceId: string, runIds: string[]): Promise<EvalRunSummary[]> {
    if (runIds.length === 0) return [];
    const run = t.evalRuns;
    const rows = await this.db
      .select()
      .from(run)
      .where(and(eq(run.workspaceId, workspaceId), inArray(run.id, runIds)));
    return rows.map(toSummary);
  }

  async caseIdsOfRuns(runIds: string[]): Promise<Map<string, string[]>> {
    if (runIds.length === 0) return new Map();
    const run = t.evalRuns;
    const rows = await this.db
      .select({ id: run.id, caseIds: run.caseIds })
      .from(run)
      .where(inArray(run.id, runIds));
    return new Map(rows.map((r) => [r.id, r.caseIds]));
  }

  async caseResults(runIds: string[]): Promise<RunCaseResult[]> {
    if (runIds.length === 0) return [];
    const r = t.evalCaseResults;
    const rows = await this.db.select().from(r).where(inArray(r.runId, runIds));
    return rows.map((row) => ({ runId: row.runId, result: toResult(row) }));
  }

  async caseNames(workspaceId: string, caseIds: string[]): Promise<Map<string, string>> {
    if (caseIds.length === 0) return new Map();
    const c = t.evalCases;
    const rows = await this.db
      .select({ id: c.id, name: c.name })
      .from(c)
      .where(and(eq(c.workspaceId, workspaceId), inArray(c.id, caseIds)));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async latestCountedByAgent(workspaceId: string): Promise<Map<string, EvalRunSummary>> {
    const run = t.evalRuns;
    const rows = await this.db
      .selectDistinctOn([run.agentId])
      .from(run)
      .where(and(eq(run.workspaceId, workspaceId), inArray(run.status, COUNTED)))
      .orderBy(run.agentId, desc(run.startedAt), desc(run.id));
    return new Map(rows.map((row) => [row.agentId, toSummary(row)]));
  }

  async recentCounted(workspaceId: string, n: number): Promise<EvalRunSummary[]> {
    const run = t.evalRuns;
    const rows = await this.db
      .select()
      .from(run)
      .where(and(eq(run.workspaceId, workspaceId), inArray(run.status, COUNTED)))
      .orderBy(desc(run.startedAt), desc(run.id))
      .limit(n);
    return rows.map(toSummary);
  }

  async trend(workspaceId: string, agentId: string): Promise<EvalTrendPoint[]> {
    const run = t.evalRuns;
    const rows = await this.db
      .select({
        id: run.id,
        startedAt: run.startedAt,
        agentVersion: run.agentVersion,
        recall: run.recall,
        precision: run.precision,
        citationAccuracy: run.citationAccuracy,
        costUsd: run.costUsd,
      })
      .from(run)
      .where(
        and(eq(run.workspaceId, workspaceId), eq(run.agentId, agentId), inArray(run.status, COUNTED)),
      )
      .orderBy(asc(run.startedAt), asc(run.id));
    return rows.map((row) => ({
      run_id: row.id,
      started_at: row.startedAt.toISOString(),
      agent_version: row.agentVersion,
      recall: row.recall,
      precision: row.precision,
      citation_accuracy: row.citationAccuracy,
      cost_usd: toNumber(row.costUsd),
    }));
  }

  async reapRunning(): Promise<number> {
    const run = t.evalRuns;
    const rows = await this.db
      .update(run)
      .set({ status: 'failed', finishedAt: new Date() })
      .where(eq(run.status, 'running'))
      .returning({ id: run.id });
    return rows.length;
  }

  async caseIdsBySourceFinding(
    workspaceId: string,
    findingIds: string[],
  ): Promise<Map<string, string>> {
    if (findingIds.length === 0) return new Map();
    const c = t.evalCases;
    const rows = await this.db
      .select({ id: c.id, findingId: c.sourceFindingId })
      .from(c)
      .where(and(eq(c.workspaceId, workspaceId), inArray(c.sourceFindingId, findingIds)));
    const out = new Map<string, string>();
    for (const row of rows) if (row.findingId) out.set(row.findingId, row.id);
    return out;
  }
}
