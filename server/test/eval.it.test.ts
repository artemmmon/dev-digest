/**
 * SPEC-13 eval pipeline against real Postgres (Testcontainers, pattern: `onboarding.it.test.ts`).
 * What only a database can prove: the run claim (one running run per agent under 10 concurrent
 * starts), the case limit and the one-case-per-finding rule under concurrency, the guarded
 * delete, cascades, the guarded result write, the latest-counted outcome and the trend. Route
 * tests go through `buildApp` + `app.inject` with a canned model: no key, no network.
 * Gated on Docker; ephemeral container only, never the dev database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { EvalCaseResult, EvalExpectation } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { cannedLlm, diffFor, expectation, finding, type CannedAnswer } from './helpers/eval.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import { EvalRepository } from '../src/modules/eval/repository.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[eval] Docker not available — skipping integration tests.');
}

const meta = { pr_title: 'Add query', pr_body: 'Body' };

d('eval pipeline (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let store: EvalRepository;
  let seq = 0;
  const apps: FastifyInstance[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    store = new EvalRepository(pg.handle.db);
  });
  afterAll(async () => {
    for (const app of apps) await app.close();
    await pg?.stop();
  });

  // ---------- fixtures ----------

  async function insertAgent(over: { workspaceId?: string; name?: string } = {}) {
    const name = over.name ?? `eval-agent-${seq++}`;
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId: over.workspaceId ?? workspaceId,
        name,
        provider: 'openrouter',
        model: 'canned-model',
        systemPrompt: 'You review code.',
        version: 1,
      })
      .returning();
    await pg.handle.db.insert(t.agentVersions).values({
      agentId: agent!.id,
      version: 1,
      configJson: { system_prompt: 'You review code.', model: 'canned-model' },
    });
    return agent!;
  }

  async function newCase(
    agentId: string,
    over: { file?: string; type?: EvalExpectation['type']; sourceFindingId?: string | null; name?: string } = {},
  ) {
    const file = over.file ?? 'src/a.ts';
    const out = await store.insertCase(
      {
        workspaceId,
        agentId,
        name: over.name ?? `case-${seq++}`,
        inputDiff: diffFor(file),
        inputMeta: meta,
        expectedOutput: expectation(over.type ?? 'must_find', file, 10, 12),
        sourceFindingId: over.sourceFindingId ?? null,
      },
      50,
    );
    if (typeof out === 'string') throw new Error(`insertCase refused: ${out}`);
    return out;
  }

  async function insertRun(
    agentId: string,
    over: {
      status: 'running' | 'done' | 'partial' | 'failed';
      startedAt?: string;
      caseIds?: string[];
      recall?: number | null;
      precision?: number | null;
      citation?: number | null;
      cost?: string | null;
      workspaceId?: string;
    },
  ) {
    const [run] = await pg.handle.db
      .insert(t.evalRuns)
      .values({
        workspaceId: over.workspaceId ?? workspaceId,
        agentId,
        agentVersion: 1,
        caseIds: over.caseIds ?? [],
        status: over.status,
        startedAt: new Date(over.startedAt ?? '2026-10-10T10:00:00.000Z'),
        casesTotal: (over.caseIds ?? []).length,
        recall: over.recall ?? null,
        precision: over.precision ?? null,
        citationAccuracy: over.citation ?? null,
        costUsd: over.cost ?? null,
      })
      .returning();
    return run!;
  }

  async function insertResult(runId: string, caseId: string, status: 'pass' | 'fail' | 'error', matched = 0) {
    await pg.handle.db.insert(t.evalCaseResults).values({
      runId,
      caseId,
      status,
      expectedCount: 1,
      matchedCount: matched,
      kept: matched,
    });
  }

  const resultOf = (caseId: string, status: EvalCaseResult['status'] = 'pass'): EvalCaseResult => ({
    case_id: caseId,
    status,
    expected_count: 1,
    matched_count: status === 'pass' ? 1 : 0,
    kept: status === 'pass' ? 1 : 0,
    dropped: 0,
    findings: [],
    duration_ms: 3,
    cost_usd: 0.25,
  });

  async function runRow(runId: string) {
    return (await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.id, runId)))[0]!;
  }

  async function makeApp(over: { answers?: Record<string, CannedAnswer>; nodeEnv?: 'test' | 'production'; noLlm?: boolean } = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const llm = cannedLlm({ answers: over.answers ?? {} });
    const app = await buildApp({
      config: { ...config, nodeEnv: over.nodeEnv ?? 'test' },
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        ...(over.noLlm ? {} : { llm: { openrouter: llm } }),
        // an empty secrets store: nothing can reach a real provider, however a test is wired
        secrets: new MockSecretsProvider({}),
      },
    });
    apps.push(app);
    return { app, llm };
  }

  async function postAgent(app: FastifyInstance, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openrouter', model: 'canned-model', system_prompt: 'You review code.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; version: number };
  }

  const casePayload = (file = 'src/a.ts', over: Record<string, unknown> = {}) => ({
    name: `case-${seq++}`,
    input_diff: diffFor(file),
    input_meta: meta,
    expected_output: expectation('must_find', file, 10, 12),
    ...over,
  });

  async function waitForRun(runId: string) {
    await vi.waitFor(
      async () => {
        expect((await runRow(runId)).status).not.toBe('running');
      },
      { timeout: 10_000, interval: 25 },
    );
    return runRow(runId);
  }

  // ---------- NFR-3 (first: the repo backfill of a non-test app must find no repos) ----------

  it('NFR-3: the 11th run start of one minute is answered 429', async () => {
    const { app } = await makeApp({ nodeEnv: 'production', answers: { 'src/a.ts': [] } });
    const agent = await postAgent(app, `rate-agent-${seq++}`);
    expect(
      (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: casePayload() })).statusCode,
    ).toBe(201);

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
      statuses.push(res.statusCode);
    }

    expect(statuses[0]).toBe(202);
    // starts 2-10 are 202 or 409 (a run in progress), never 429; the 11th is limited
    expect(statuses.slice(1, 10).every((s) => s === 202 || s === 409)).toBe(true);
    expect(statuses[10]).toBe(429);
    // let the background run end before the container goes away
    await vi.waitFor(
      async () => {
        const rows = await pg.handle.db
          .select()
          .from(t.evalRuns)
          .where(and(eq(t.evalRuns.agentId, agent.id), eq(t.evalRuns.status, 'running')));
        expect(rows).toHaveLength(0);
      },
      { timeout: 10_000, interval: 25 },
    );
  });

  // ---------- the claim ----------

  describe('claim — AC-23, EC-9', () => {
    it('AC-23, EC-9: ten concurrent claims of one agent — exactly one wins, in every round', async () => {
      const agent = await insertAgent();
      for (let round = 0; round < 5; round++) {
        const results = await Promise.all(
          Array.from({ length: 10 }, () =>
            store.claimRun({ workspaceId, agentId: agent.id, agentVersion: 1, skillVersions: [], caseIds: [] }),
          ),
        );
        const winners = results.filter((r) => r !== null);
        expect(winners, `round ${round}`).toHaveLength(1);
        expect(winners[0]).toMatchObject({ status: 'running', agent_id: agent.id });
        // free the agent for the next round
        expect(await store.finishRun(winners[0]!.id, 'done', {
          recall: null,
          precision: null,
          citationAccuracy: null,
          unlabelledFindings: 0,
          costUsd: null,
        })).toBe(true);
      }
    });

    it('AC-23: claims of different agents do not block each other', async () => {
      const a = await insertAgent();
      const b = await insertAgent();
      const [ra, rb] = await Promise.all(
        [a, b].map((x) =>
          store.claimRun({ workspaceId, agentId: x.id, agentVersion: 1, skillVersions: [], caseIds: [] }),
        ),
      );
      expect(ra).not.toBeNull();
      expect(rb).not.toBeNull();
    });

    it('AC-19: a claim stores the version, the skill versions and the captured case ids', async () => {
      const agent = await insertAgent();
      const c = await newCase(agent.id);
      const run = await store.claimRun({
        workspaceId,
        agentId: agent.id,
        agentVersion: 4,
        skillVersions: [{ skill_id: 's1', name: 'TS rules', version: 7 }],
        caseIds: [c.id],
      });
      expect(run).toMatchObject({
        agent_version: 4,
        skill_versions: [{ skill_id: 's1', name: 'TS rules', version: 7 }],
        cases_total: 1,
        status: 'running',
      });
      expect((await runRow(run!.id)).caseIds).toEqual([c.id]);
    });
  });

  describe('reaper — AC-28, EC-18', () => {
    it('AC-28: reapRunning turns every running run into failed with an end time, and leaves ended runs alone', async () => {
      const a = await insertAgent();
      const b = await insertAgent();
      const running = await insertRun(a.id, { status: 'running' });
      const done = await insertRun(b.id, { status: 'done', recall: 1 });

      const reaped = await store.reapRunning();

      expect(reaped).toBeGreaterThanOrEqual(1);
      const after = await runRow(running.id);
      expect(after.status).toBe('failed');
      expect(after.finishedAt).not.toBeNull();
      expect(await runRow(done.id)).toMatchObject({ status: 'done', recall: 1 });
    });

    it('EC-18, AC-28: a run left running by a dead process shows failed after the API restarts', async () => {
      const agent = await insertAgent();
      const stale = await insertRun(agent.id, { status: 'running' });

      await makeApp(); // boot runs the reaper before the app accepts a request

      expect((await runRow(stale.id)).status).toBe('failed');
    });

    it('AC-28: a result written after the reaper ended the run is refused and changes no counter', async () => {
      const agent = await insertAgent();
      const c = await newCase(agent.id);
      const run = await insertRun(agent.id, { status: 'running', caseIds: [c.id] });
      await store.reapRunning();

      expect(await store.recordCaseResult(run.id, resultOf(c.id))).toBe(false);

      expect(await runRow(run.id)).toMatchObject({ status: 'failed', casesCompleted: 0, casesPassed: 0 });
      expect(await pg.handle.db.select().from(t.evalCaseResults).where(eq(t.evalCaseResults.runId, run.id))).toHaveLength(0);
    });
  });

  describe('results — AC-27, AC-36', () => {
    it('AC-27: each recorded result advances the counters in the same transaction; finish stores the metrics once', async () => {
      const agent = await insertAgent();
      const [c1, c2, c3] = [await newCase(agent.id), await newCase(agent.id), await newCase(agent.id)];
      const run = await insertRun(agent.id, { status: 'running', caseIds: [c1.id, c2.id, c3.id] });

      expect(await store.recordCaseResult(run.id, resultOf(c1.id, 'pass'))).toBe(true);
      expect(await store.recordCaseResult(run.id, resultOf(c2.id, 'fail'))).toBe(true);
      expect(await store.recordCaseResult(run.id, { ...resultOf(c3.id, 'error'), cost_usd: null })).toBe(true);

      expect(await runRow(run.id)).toMatchObject({
        casesCompleted: 2,
        casesErrored: 1,
        casesPassed: 1,
        status: 'running',
      });

      const metrics = { recall: 0.5, precision: 1, citationAccuracy: 1, unlabelledFindings: 2, costUsd: 0.12345678 };
      expect(await store.finishRun(run.id, 'partial', metrics)).toBe(true);
      // a second finish (or one after a reap) is refused: the run is no longer running
      expect(await store.finishRun(run.id, 'failed', { ...metrics, recall: null })).toBe(false);

      const row = await runRow(run.id);
      expect(row).toMatchObject({ status: 'partial', recall: 0.5, precision: 1, unlabelledFindings: 2 });
      expect(Number(row.costUsd)).toBeCloseTo(0.12345678, 8); // numeric(14,8), not a float column
      expect(row.finishedAt).not.toBeNull();
    });

    it('AC-27: a case result is unique per run and case', async () => {
      const agent = await insertAgent();
      const c = await newCase(agent.id);
      const run = await insertRun(agent.id, { status: 'running', caseIds: [c.id] });
      await store.recordCaseResult(run.id, resultOf(c.id));
      await expect(store.recordCaseResult(run.id, resultOf(c.id))).rejects.toThrow();
      // the failed insert rolled the counter bump back with it
      expect((await runRow(run.id)).casesCompleted).toBe(1);
    });
  });

  describe('cases — AC-10, AC-12, AC-14, AC-16, AC-56, AC-57, EC-4', () => {
    it('AC-10, EC-4: ten concurrent saves from one finding — exactly one case is stored, nine are duplicates', async () => {
      const agent = await insertAgent();
      const findingId = await insertFinding(agent.id, 'src/a.ts', 11, 12);

      const outcomes = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          store.insertCase(
            {
              workspaceId,
              agentId: agent.id,
              name: `dup-${i}`,
              inputDiff: diffFor('src/a.ts'),
              inputMeta: meta,
              expectedOutput: expectation('must_find', 'src/a.ts', 10, 12),
              sourceFindingId: findingId,
            },
            50,
          ),
        ),
      );

      expect(outcomes.filter((o) => typeof o !== 'string')).toHaveLength(1);
      expect(outcomes.filter((o) => o === 'duplicate')).toHaveLength(9);
      expect(await store.listCases(workspaceId, agent.id)).toHaveLength(1);
    });

    it('AC-10: hand-written cases (no source finding) never collide with each other', async () => {
      const agent = await insertAgent();
      await newCase(agent.id);
      await newCase(agent.id);
      expect(await store.listCases(workspaceId, agent.id)).toHaveLength(2);
    });

    it('AC-12: concurrent saves cannot pass the limit of 50 — 45 stored, ten racing, exactly five land', async () => {
      const agent = await insertAgent();
      await pg.handle.db.insert(t.evalCases).values(
        Array.from({ length: 45 }, (_, i) => ({
          workspaceId,
          ownerKind: 'agent' as const,
          ownerId: agent.id,
          agentId: agent.id,
          name: `bulk-${i}`,
          inputDiff: diffFor('src/a.ts'),
          inputMeta: meta,
          expectedOutput: expectation('must_find', 'src/a.ts', 10, 12),
        })),
      );

      const outcomes = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          store.insertCase(
            {
              workspaceId,
              agentId: agent.id,
              name: `race-${i}`,
              inputDiff: diffFor('src/a.ts'),
              inputMeta: meta,
              expectedOutput: expectation('must_find', 'src/a.ts', 10, 12),
              sourceFindingId: null,
            },
            50,
          ),
        ),
      );

      expect(outcomes.filter((o) => typeof o !== 'string')).toHaveLength(5);
      expect(outcomes.filter((o) => o === 'limit')).toHaveLength(5);
      expect(await store.listCases(workspaceId, agent.id)).toHaveLength(50);
    });

    it('AC-14: deleting an agent deletes its cases, its runs and their results', async () => {
      const agent = await insertAgent();
      const c = await newCase(agent.id);
      const run = await insertRun(agent.id, { status: 'done', caseIds: [c.id] });
      await insertResult(run.id, c.id, 'pass', 1);

      await pg.handle.db.delete(t.agents).where(eq(t.agents.id, agent.id));

      expect(await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.id, c.id))).toHaveLength(0);
      expect(await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.id, run.id))).toHaveLength(0);
      expect(await pg.handle.db.select().from(t.evalCaseResults).where(eq(t.evalCaseResults.runId, run.id))).toHaveLength(0);
    });

    it('AC-16, AC-66: a case shows its outcome in the latest COUNTED run; a newer failed or running run is ignored', async () => {
      const agent = await insertAgent();
      const c = await newCase(agent.id);
      const never = await newCase(agent.id);
      const older = await insertRun(agent.id, { status: 'done', startedAt: '2026-10-10T10:00:00.000Z', caseIds: [c.id] });
      const counted = await insertRun(agent.id, { status: 'partial', startedAt: '2026-10-11T10:00:00.000Z', caseIds: [c.id] });
      const failed = await insertRun(agent.id, { status: 'failed', startedAt: '2026-10-12T10:00:00.000Z', caseIds: [c.id] });
      await insertResult(older.id, c.id, 'fail', 0);
      await insertResult(counted.id, c.id, 'pass', 2);
      await insertResult(failed.id, c.id, 'error', 0);

      const cases = await store.listCases(workspaceId, agent.id);

      expect(cases.find((x) => x.id === c.id)!.latest).toEqual({ status: 'pass', expected_count: 1, matched_count: 2 });
      expect(cases.find((x) => x.id === never.id)!.latest).toMatchObject({ status: 'never_run', matched_count: null });
    });

    it('AC-56, AC-57: the delete is refused while a run of the agent runs, then removes the case and its results only', async () => {
      const agent = await insertAgent();
      const c = await newCase(agent.id);
      const run = await insertRun(agent.id, { status: 'running', caseIds: [c.id] });

      expect(await store.deleteCaseIfIdle(workspaceId, c.id)).toBe('running');
      expect(await store.getCase(workspaceId, c.id)).toBeDefined();

      await insertResult(run.id, c.id, 'pass', 1);
      await pg.handle.db
        .update(t.evalRuns)
        .set({ status: 'done', recall: 1, precision: 0.5, citationAccuracy: 0.9, finishedAt: new Date() })
        .where(eq(t.evalRuns.id, run.id));

      expect(await store.deleteCaseIfIdle(workspaceId, c.id)).toBe('deleted');
      expect(await store.getCase(workspaceId, c.id)).toBeUndefined();
      // AC-56: the run's metrics are unchanged; only the case's result row went with it
      expect(await runRow(run.id)).toMatchObject({ recall: 1, precision: 0.5, citationAccuracy: 0.9, status: 'done' });
      expect(await pg.handle.db.select().from(t.evalCaseResults).where(eq(t.evalCaseResults.runId, run.id))).toHaveLength(0);
    });

    it('AC-57: a delete racing a claim never leaves a deleted case inside a running run (one statement, no check-then-act)', async () => {
      // 8 rounds: a case and a start of its agent race; either the delete wins (case gone) or the
      // claim wins (delete refused with `running`) — never both succeed.
      for (let round = 0; round < 8; round++) {
        const agent = await insertAgent();
        const c = await newCase(agent.id);
        const [deleted, claimed] = await Promise.all([
          store.deleteCaseIfIdle(workspaceId, c.id),
          store.claimRun({ workspaceId, agentId: agent.id, agentVersion: 1, skillVersions: [], caseIds: [c.id] }),
        ]);
        if (deleted === 'deleted') {
          // the delete took effect first; the claim may still have been made, but the case is gone
          expect(await store.getCase(workspaceId, c.id)).toBeUndefined();
        } else {
          expect(deleted).toBe('running');
          expect(claimed).not.toBeNull();
          expect(await store.getCase(workspaceId, c.id)).toBeDefined();
        }
      }
    });

    it('NFR-4: a case of another workspace is invisible to read, update and delete', async () => {
      const [other] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${seq++}` }).returning();
      const agent = await insertAgent({ workspaceId: other!.id });
      const [row] = await pg.handle.db
        .insert(t.evalCases)
        .values({
          workspaceId: other!.id,
          ownerKind: 'agent',
          ownerId: agent.id,
          agentId: agent.id,
          name: 'foreign',
          inputDiff: diffFor('src/a.ts'),
          inputMeta: meta,
          expectedOutput: expectation('must_find', 'src/a.ts', 10, 12),
        })
        .returning();

      expect(await store.getCase(workspaceId, row!.id)).toBeUndefined();
      expect(await store.listCases(workspaceId, agent.id)).toEqual([]);
      expect(
        await store.updateCase(workspaceId, row!.id, {
          name: 'x',
          inputDiff: diffFor('src/a.ts'),
          inputMeta: meta,
          expectedOutput: expectation('must_find', 'src/a.ts', 10, 12),
        }),
      ).toBeUndefined();
      expect(await store.deleteCaseIfIdle(workspaceId, row!.id)).toBe('not_found');
      expect(await store.getCase(other!.id, row!.id)).toBeDefined();
    });
  });

  describe('runs, dashboard and trend — AC-42, AC-43, AC-58, AC-66', () => {
    it('AC-58, AC-66: the trend lists counted runs oldest first with the three metrics, version and numeric cost', async () => {
      const agent = await insertAgent();
      await insertRun(agent.id, { status: 'done', startedAt: '2026-10-12T10:00:00.000Z', recall: 0.8, precision: 0.7, citation: 1, cost: '0.50000000' });
      await insertRun(agent.id, { status: 'failed', startedAt: '2026-10-13T10:00:00.000Z', recall: null });
      await insertRun(agent.id, { status: 'partial', startedAt: '2026-10-10T10:00:00.000Z', recall: 0.5, precision: null, citation: 0.9 });
      await insertRun(agent.id, { status: 'running', startedAt: '2026-10-14T10:00:00.000Z' });

      const points = await store.trend(workspaceId, agent.id);

      expect(points).toHaveLength(2);
      expect(points.map((p) => p.started_at)).toEqual(['2026-10-10T10:00:00.000Z', '2026-10-12T10:00:00.000Z']);
      expect(points[0]).toMatchObject({ recall: 0.5, precision: null, citation_accuracy: 0.9, agent_version: 1, cost_usd: null });
      expect(points[1]).toMatchObject({ recall: 0.8, precision: 0.7, citation_accuracy: 1, cost_usd: 0.5 });
      expect(Object.keys(points[0]!).sort()).toEqual(
        ['agent_version', 'citation_accuracy', 'cost_usd', 'precision', 'recall', 'run_id', 'started_at'],
      );
    });

    it('AC-66: latestCounted and the dashboard reads skip running and failed runs', async () => {
      const agent = await insertAgent();
      const done = await insertRun(agent.id, { status: 'done', startedAt: '2026-10-10T10:00:00.000Z' });
      await insertRun(agent.id, { status: 'failed', startedAt: '2026-10-11T10:00:00.000Z' });
      await insertRun(agent.id, { status: 'running', startedAt: '2026-10-12T10:00:00.000Z' });

      expect((await store.latestCounted(workspaceId, agent.id, 2)).map((r) => r.id)).toEqual([done.id]);
      expect((await store.latestCountedByAgent(workspaceId)).get(agent.id)?.id).toBe(done.id);
      const recent = await store.recentCounted(workspaceId, 500);
      expect(recent.every((r) => r.status === 'done' || r.status === 'partial')).toBe(true);
      expect(recent.some((r) => r.agent_id === agent.id && r.id === done.id)).toBe(true);
    });

    it('AC-43: recentCounted returns at most n runs, newest first', async () => {
      const agent = await insertAgent();
      for (let i = 1; i <= 8; i++) {
        await insertRun(agent.id, { status: 'done', startedAt: `2027-01-0${i}T10:00:00.000Z` });
      }
      const recent = await store.recentCounted(workspaceId, 6);
      expect(recent).toHaveLength(6);
      const starts = recent.map((r) => r.started_at);
      expect(starts).toEqual([...starts].sort().reverse());
      expect(starts[0]).toBe('2027-01-08T10:00:00.000Z');
    });

    it('NFR-4: runs of another workspace are invisible to getRuns, listRuns and the trend', async () => {
      const [other] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${seq++}` }).returning();
      const agent = await insertAgent({ workspaceId: other!.id });
      const run = await insertRun(agent.id, { status: 'done', workspaceId: other!.id });

      expect(await store.getRuns(workspaceId, [run.id])).toEqual([]);
      expect(await store.listRuns(workspaceId, agent.id, 10)).toEqual([]);
      expect(await store.trend(workspaceId, agent.id)).toEqual([]);
      expect(await store.getRuns(other!.id, [run.id])).toHaveLength(1);
    });
  });

  // ---------- findings → markers ----------

  let prId: string | undefined;
  async function ensurePull() {
    if (prId) return prId;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'eval-repo', fullName: 'acme/eval-repo', defaultBranch: 'main' })
      .returning();
    const [pull] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Add query',
        body: 'PR body',
        author: 'dev',
        branch: 'feat',
        base: 'main',
        headSha: 'abc123',
      })
      .returning();
    prId = pull!.id;
    const patch = ['@@ -10,3 +10,4 @@', ' context a', '+added line', ' context b', ' context c', ''].join('\n');
    await pg.handle.db.insert(t.prFiles).values(
      ['src/a.ts', 'src/b.ts', 'yarn.lock'].map((path) => ({ prId: prId!, path, patch })),
    );
    return prId;
  }

  async function insertFinding(agentId: string | null, file: string, start: number, end: number) {
    const pull = await ensurePull();
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pull, agentId, kind: 'review', verdict: 'comment', score: 80, model: 'm' })
      .returning();
    const [f] = await pg.handle.db
      .insert(t.findings)
      .values({
        reviewId: review!.id,
        file,
        startLine: start,
        endLine: end,
        severity: 'WARNING',
        category: 'bug',
        title: 'SQL built from user input',
        rationale: 'why',
        confidence: 0.9,
      })
      .returning();
    return f!.id;
  }

  describe('markers — AC-9, EC-3', () => {
    it('AC-9: caseIdsBySourceFinding maps seeded findings to their case, workspace-scoped, in one query', async () => {
      const agent = await insertAgent();
      const f1 = await insertFinding(agent.id, 'src/a.ts', 11, 12);
      const f2 = await insertFinding(agent.id, 'src/b.ts', 11, 12);
      const c1 = await newCase(agent.id, { sourceFindingId: f1 });

      const map = await store.caseIdsBySourceFinding(workspaceId, [f1, f2]);
      expect([...map.entries()]).toEqual([[f1, c1.id]]);

      const [other] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${seq++}` }).returning();
      expect((await store.caseIdsBySourceFinding(other!.id, [f1])).size).toBe(0);
      expect((await store.caseIdsBySourceFinding(workspaceId, [])).size).toBe(0);
    });

    it('AC-1, AC-8, AC-9, AC-65, EC-3: the PR reviews route marks findings, and "In eval set" survives a decision change', async () => {
      const { app } = await makeApp();
      const agent = await postAgent(app, `marker-agent-${seq++}`);
      const fOk = await insertFinding(agent.id, 'src/a.ts', 11, 12);
      const fSeeded = await insertFinding(agent.id, 'src/b.ts', 11, 12);
      const fOff = await insertFinding(agent.id, 'src/a.ts', 200, 210);
      const fLock = await insertFinding(agent.id, 'yarn.lock', 11, 12);
      const fNoAgent = await insertFinding(null, 'src/a.ts', 11, 12);
      const pull = await ensurePull();

      const markers = async () => {
        const res = await app.inject({ method: 'GET', url: `/pulls/${pull}/reviews` });
        expect(res.statusCode).toBe(200);
        const out = new Map<string, [string | null, string | null]>();
        for (const review of res.json() as Array<{ findings: Array<Record<string, unknown>> }>) {
          for (const f of review.findings) {
            out.set(f.id as string, [(f.eval_case_id as string | null) ?? null, (f.eval_unavailable_reason as string | null) ?? null]);
          }
        }
        return out;
      };

      const before = await markers();
      expect(before.get(fOk)).toEqual([null, null]);
      expect(before.get(fOff)).toEqual([null, 'diff_unavailable']);
      expect(before.get(fLock)).toEqual([null, 'file_excluded']);
      expect(before.get(fNoAgent)).toEqual([null, 'no_agent']);

      const created = await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/eval-cases`,
        payload: casePayload('src/b.ts', { source_finding_id: fSeeded }),
      });
      expect(created.statusCode).toBe(201);
      const caseId = created.json().id as string;

      expect((await markers()).get(fSeeded)).toEqual([caseId, null]);

      // EC-3: the decision changes after the case exists — the finding keeps "In eval set"
      const dismissed = await app.inject({ method: 'POST', url: `/findings/${fSeeded}/dismiss` });
      expect(dismissed.statusCode).toBe(200);
      expect((await markers()).get(fSeeded)).toEqual([caseId, null]);
    });
  });

  // ---------- routes ----------

  describe('routes', () => {
    it('AC-7, AC-10, AC-11, AC-12, AC-63, AC-64, EC-20: create-case statuses and bodies', async () => {
      const { app } = await makeApp();
      const agent = await postAgent(app, `route-agent-${seq++}`);
      const findingId = await insertFinding(agent.id, 'src/a.ts', 11, 12);
      const post = (payload: object) =>
        app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload });

      // AC-7: stored with the POSTED diff and meta
      const ok = await post(casePayload('src/a.ts', { source_finding_id: findingId, input_meta: { pr_title: 'Edited title', pr_body: '' } }));
      expect(ok.statusCode).toBe(201);
      expect(ok.json()).toMatchObject({
        source_finding_id: findingId,
        input_meta: { pr_title: 'Edited title', pr_body: '' },
        latest: { status: 'never_run', expected_count: 1, matched_count: null },
      });
      const [row] = await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.id, ok.json().id));
      expect(row).toMatchObject({ agentId: agent.id, ownerId: agent.id, ownerKind: 'agent' });
      expect(row!.inputDiff).toBe(diffFor('src/a.ts'));

      // AC-10 / EC-4: second case from the same finding
      const dup = await post(casePayload('src/a.ts', { source_finding_id: findingId }));
      expect(dup.statusCode).toBe(409);
      expect(dup.json().error.code).toBe('eval_case_exists');

      // AC-11: the failing field is named
      const reversed = await post(casePayload('src/a.ts', { expected_output: expectation('must_find', 'src/a.ts', 12, 10) }));
      expect(reversed.statusCode).toBe(422);
      expect(JSON.stringify(reversed.json())).toContain('end_line');
      const noHunk = await post(casePayload('src/a.ts', { input_diff: 'plain text, no hunk' }));
      expect(noHunk.statusCode).toBe(422);
      expect(JSON.stringify(noHunk.json())).toContain('input_diff');
      const longName = await post(casePayload('src/a.ts', { name: 'x'.repeat(121) }));
      expect(longName.statusCode).toBe(422);
      expect(JSON.stringify(longName.json())).toContain('name');
      const farRange = await post(casePayload('src/a.ts', { expected_output: expectation('must_find', 'src/a.ts', 400, 410) }));
      expect(farRange.statusCode).toBe(422);
      expect(JSON.stringify(farRange.json())).toContain('expected_output');

      // AC-63 / AC-64 / EC-20: excluded file, seeded or hand-written
      const lockSeeded = await post(
        casePayload('yarn.lock', { source_finding_id: await insertFinding(agent.id, 'yarn.lock', 11, 12) }),
      );
      expect(lockSeeded.statusCode).toBe(422);
      expect(lockSeeded.json().error.message).toBe('This file is excluded from review and can never pass preparation');
      const lockByHand = await post(casePayload('yarn.lock'));
      expect(lockByHand.statusCode).toBe(422);
      expect(lockByHand.json().error.message).toBe('This file is excluded from review and can never pass preparation');

      // nothing but the one valid case was stored
      expect(await store.listCases(workspaceId, agent.id)).toHaveLength(1);
    });

    it('AC-12: the 51st case of an agent is a 422 stating the limit of 50', async () => {
      const { app } = await makeApp();
      const agent = await postAgent(app, `limit-agent-${seq++}`);
      await pg.handle.db.insert(t.evalCases).values(
        Array.from({ length: 50 }, (_, i) => ({
          workspaceId,
          ownerKind: 'agent' as const,
          ownerId: agent.id,
          agentId: agent.id,
          name: `bulk-${i}`,
          inputDiff: diffFor('src/a.ts'),
          inputMeta: meta,
          expectedOutput: expectation('must_find', 'src/a.ts', 10, 12),
        })),
      );
      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: casePayload() });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('eval_case_limit');
      expect(res.json().error.message).toContain('50');
    });

    it('AC-18, AC-25, AC-27, AC-31, AC-32, AC-33: no case → 422; a run answers 202 running, then ends with its metrics', async () => {
      const { app, llm } = await makeApp({
        answers: { 'src/a.ts': [finding('f1', 'src/a.ts', 11)], 'src/b.ts': [] },
      });
      const agent = await postAgent(app, `run-agent-${seq++}`);

      const none = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
      expect(none.statusCode).toBe(422);
      expect(await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toHaveLength(0);

      for (const payload of [
        casePayload('src/a.ts'),
        casePayload('src/b.ts', { expected_output: expectation('must_not_flag', 'src/b.ts', 10, 12) }),
      ]) {
        expect((await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload })).statusCode).toBe(201);
      }

      const start = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
      expect(start.statusCode).toBe(202);
      expect(start.json()).toEqual({ run_id: expect.any(String), status: 'running' });

      const finished = await waitForRun(start.json().run_id);
      expect(finished).toMatchObject({
        status: 'done',
        casesTotal: 2,
        casesCompleted: 2,
        casesErrored: 0,
        casesPassed: 2,
        recall: 1,
        precision: 1,
        citationAccuracy: 1,
        unlabelledFindings: 0,
        agentVersion: 1,
      });
      expect(Number(finished.costUsd)).toBeCloseTo(1, 6);
      expect(llm.requests).toHaveLength(2);

      // AC-37 data / AC-66: the overview names the run as the latest counted one
      const overview = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` })).json();
      expect(overview.latest_counted.id).toBe(start.json().run_id);
      expect(overview.previous_counted).toBeNull();
      expect(overview.runs).toHaveLength(1);

      // AC-16: the case list carries the outcome
      const cases = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json().cases;
      expect(cases.map((c: { latest: { status: string } }) => c.latest.status)).toEqual(['pass', 'pass']);
    });

    it('AC-23, EC-9: a start while the agent has a running run is a 409 with no second row', async () => {
      const { app } = await makeApp();
      const agent = await postAgent(app, `busy-agent-${seq++}`);
      await newCase(agent.id);
      await insertRun(agent.id, { status: 'running' });

      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('eval_run_in_progress');
      expect(await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toHaveLength(1);
    });

    it('AC-24: an agent whose provider has no key is a 4xx naming the provider, and no run row is created', async () => {
      const { app } = await makeApp({ noLlm: true });
      const agent = await postAgent(app, `nokey-agent-${seq++}`);
      await newCase(agent.id);

      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });

      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('provider_not_configured');
      expect(res.json().error.message).toContain('OpenRouter');
      expect(await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toHaveLength(0);
    });

    it('EC-7, AC-19: a skill edit that bumps only the skill version is recorded by the next run; Compare sees both', async () => {
      const { app } = await makeApp({ answers: { 'src/a.ts': [] } });
      const agent = await postAgent(app, `skill-agent-${seq++}`);
      const skillRes = await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: `eval-skill-${seq++}`, description: 'Use when reviewing.', type: 'rubric', body: '# rules\nv1' },
      });
      expect(skillRes.statusCode).toBe(201);
      const skill = skillRes.json() as { id: string; version: number };
      const link = await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_id: skill.id } });
      expect(link.statusCode).toBe(200);
      await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: casePayload() });

      // the agents repository reports the skill's version (AC-19 data source)
      const resolved = await new AgentsRepository(pg.handle.db).resolvedSkills(agent.id);
      expect(resolved).toEqual([expect.objectContaining({ id: skill.id, version: 1 })]);

      const first = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
      const run1 = await waitForRun(first.json().run_id);
      const edit = await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: '# rules\nv2' } });
      expect(edit.json().version).toBe(2);
      const second = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
      const run2 = await waitForRun(second.json().run_id);

      expect(run1.agentVersion).toBe(run2.agentVersion); // the agent itself did not change
      expect((run1.skillVersions as Array<{ version: number }>)[0]!.version).toBe(1);
      expect((run2.skillVersions as Array<{ version: number }>)[0]!.version).toBe(2);

      // AC-48 data: compare carries both runs' skill versions, older first
      const cmp = await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${run2.id}&b=${run1.id}` });
      expect(cmp.statusCode).toBe(200);
      expect(cmp.json().older.run.id).toBe(run1.id);
      expect(cmp.json().older.run.skill_versions[0].version).toBe(1);
      expect(cmp.json().newer.run.skill_versions[0].version).toBe(2);
      expect(cmp.json().older.system_prompt).toBe('You review code.');
    });

    it('AC-46, AC-49, AC-50, EC-11, EC-19: compare returns flipped cases and set differences, and refuses uncounted runs', async () => {
      const { app } = await makeApp();
      const agent = await postAgent(app, `cmp-agent-${seq++}`);
      const c1 = await newCase(agent.id, { name: 'flips' });
      const c2 = await newCase(agent.id, { name: 'stays' });
      const gone = await newCase(agent.id, { name: 'deleted-later' });
      const older = await insertRun(agent.id, { status: 'done', startedAt: '2026-10-10T10:00:00.000Z', caseIds: [c1.id, c2.id, gone.id], recall: 0.3 });
      const newer = await insertRun(agent.id, { status: 'partial', startedAt: '2026-10-11T10:00:00.000Z', caseIds: [c1.id, c2.id], recall: 0.6 });
      const failed = await insertRun(agent.id, { status: 'failed', startedAt: '2026-10-12T10:00:00.000Z', caseIds: [c1.id] });
      await insertResult(older.id, c1.id, 'pass', 1);
      await insertResult(older.id, c2.id, 'fail', 0);
      await insertResult(older.id, gone.id, 'pass', 1);
      await insertResult(newer.id, c1.id, 'fail', 0);
      await insertResult(newer.id, c2.id, 'fail', 0);

      const cmp = await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${older.id}&b=${newer.id}` });
      expect(cmp.statusCode).toBe(200);
      expect(cmp.json()).toMatchObject({
        flipped: [{ case_id: c1.id, name: 'flips', from: 'pass', to: 'fail' }],
        case_sets_differ: true,
        only_in_older: 1,
        only_in_newer: 0,
      });

      // EC-19: the case is deleted later; flipped no longer lists it, metrics stay
      expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c1.id}` })).statusCode).toBe(204);
      const after = await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${older.id}&b=${newer.id}` });
      expect(after.json().flipped).toEqual([]);
      expect(after.json().older.run.recall).toBe(0.3);
      expect(after.json().newer.run.recall).toBe(0.6);

      // EC-11: a failed run cannot be compared
      const bad = await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${older.id}&b=${failed.id}` });
      expect(bad.statusCode).toBe(422);
    });

    it('AC-54, AC-56, AC-57: edit keeps the id and source finding; delete is 409 while running, then 204 and past metrics stay', async () => {
      const { app } = await makeApp();
      const agent = await postAgent(app, `edit-agent-${seq++}`);
      const findingId = await insertFinding(agent.id, 'src/a.ts', 11, 12);
      const created = (
        await app.inject({
          method: 'POST',
          url: `/agents/${agent.id}/eval-cases`,
          payload: casePayload('src/a.ts', { source_finding_id: findingId }),
        })
      ).json() as { id: string };

      const put = await app.inject({
        method: 'PUT',
        url: `/eval-cases/${created.id}`,
        payload: casePayload('src/a.ts', {
          name: 'renamed',
          expected_output: expectation('must_not_flag', 'src/a.ts', 11, 11),
          source_finding_id: null,
        }),
      });
      expect(put.statusCode).toBe(200);
      expect(put.json()).toMatchObject({
        id: created.id,
        name: 'renamed',
        source_finding_id: findingId,
        expected_output: { type: 'must_not_flag', start_line: 11 },
      });
      const badPut = await app.inject({
        method: 'PUT',
        url: `/eval-cases/${created.id}`,
        payload: casePayload('yarn.lock'),
      });
      expect(badPut.statusCode).toBe(422);

      const finished = await insertRun(agent.id, { status: 'done', startedAt: '2026-10-10T10:00:00.000Z', caseIds: [created.id], recall: 0.9 });
      await insertResult(finished.id, created.id, 'pass', 1);
      const running = await insertRun(agent.id, { status: 'running', startedAt: '2026-10-11T10:00:00.000Z' });

      const refused = await app.inject({ method: 'DELETE', url: `/eval-cases/${created.id}` });
      expect(refused.statusCode).toBe(409);
      expect(await store.getCase(workspaceId, created.id)).toBeDefined();

      await store.finishRun(running.id, 'failed', { recall: null, precision: null, citationAccuracy: null, unlabelledFindings: 0, costUsd: null });
      const deleted = await app.inject({ method: 'DELETE', url: `/eval-cases/${created.id}` });
      expect(deleted.statusCode).toBe(204);
      expect(await store.getCase(workspaceId, created.id)).toBeUndefined();
      expect((await runRow(finished.id)).recall).toBe(0.9);
    });

    it('AC-58: the trend route returns counted runs oldest first', async () => {
      const { app } = await makeApp();
      const agent = await postAgent(app, `trend-agent-${seq++}`);
      await insertRun(agent.id, { status: 'done', startedAt: '2026-10-12T10:00:00.000Z', recall: 0.8 });
      await insertRun(agent.id, { status: 'done', startedAt: '2026-10-10T10:00:00.000Z', recall: 0.4 });
      await insertRun(agent.id, { status: 'failed', startedAt: '2026-10-13T10:00:00.000Z' });

      const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-trend` });

      expect(res.statusCode).toBe(200);
      expect(res.json().points.map((p: { recall: number }) => p.recall)).toEqual([0.4, 0.8]);
    });

    it('AC-42, AC-43: the dashboard route lists every agent of the workspace and at most 6 recent counted runs', async () => {
      const { app } = await makeApp();
      const withRun = await postAgent(app, `dash-run-${seq++}`);
      const without = await postAgent(app, `dash-none-${seq++}`);
      await insertRun(withRun.id, { status: 'done', startedAt: '2028-01-01T10:00:00.000Z', recall: 0.5 });

      const res = await app.inject({ method: 'GET', url: '/eval/dashboard' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.agents.find((a: { agent_id: string }) => a.agent_id === withRun.id).latest.recall).toBe(0.5);
      expect(body.agents.find((a: { agent_id: string }) => a.agent_id === without.id).latest).toBeNull();
      expect(body.recent_runs.length).toBeLessThanOrEqual(6);
      expect(body.recent_runs[0]).toMatchObject({ agent_id: withRun.id, started_at: '2028-01-01T10:00:00.000Z' });
    });

    it('NFR-4: every eval route answers 404 for an agent, case or run of another workspace', async () => {
      const { app } = await makeApp();
      const [other] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${seq++}` }).returning();
      const foreignAgent = await insertAgent({ workspaceId: other!.id });
      const [foreignCase] = await pg.handle.db
        .insert(t.evalCases)
        .values({
          workspaceId: other!.id,
          ownerKind: 'agent',
          ownerId: foreignAgent.id,
          agentId: foreignAgent.id,
          name: 'foreign',
          inputDiff: diffFor('src/a.ts'),
          inputMeta: meta,
          expectedOutput: expectation('must_find', 'src/a.ts', 10, 12),
        })
        .returning();
      const foreignRun = await insertRun(foreignAgent.id, { status: 'done', workspaceId: other!.id });
      const mine = await postAgent(app, `mine-${seq++}`);
      const myRun = await insertRun(mine.id, { status: 'done' });

      const calls: Array<[string, string, object?]> = [
        ['GET', `/agents/${foreignAgent.id}/eval-cases`],
        ['POST', `/agents/${foreignAgent.id}/eval-cases`, casePayload()],
        ['POST', `/agents/${foreignAgent.id}/eval-runs`],
        ['GET', `/agents/${foreignAgent.id}/eval-runs`],
        ['GET', `/agents/${foreignAgent.id}/eval-trend`],
        ['PUT', `/eval-cases/${foreignCase!.id}`, casePayload()],
        ['DELETE', `/eval-cases/${foreignCase!.id}`],
        ['GET', `/eval-runs/compare?a=${foreignRun.id}&b=${myRun.id}`],
      ];
      for (const [method, url, payload] of calls) {
        const res = await app.inject({ method: method as 'GET', url, ...(payload ? { payload } : {}) });
        expect(res.statusCode, `${method} ${url}`).toBe(404);
      }
      // nothing of the other workspace changed
      expect(await store.getCase(other!.id, foreignCase!.id)).toBeDefined();
      expect(await pg.handle.db.select().from(t.evalRuns).where(inArray(t.evalRuns.agentId, [foreignAgent.id]))).toHaveLength(1);
    });

    it('AC-14: DELETE /agents/:id removes the agent cases, runs and results', async () => {
      const { app } = await makeApp();
      const agent = await postAgent(app, `del-agent-${seq++}`);
      const c = await newCase(agent.id);
      const run = await insertRun(agent.id, { status: 'done', caseIds: [c.id] });
      await insertResult(run.id, c.id, 'pass', 1);

      const res = await app.inject({ method: 'DELETE', url: `/agents/${agent.id}` });
      expect(res.statusCode).toBeLessThan(300);

      expect(await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.agentId, agent.id))).toHaveLength(0);
      expect(await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toHaveLength(0);
      expect(await pg.handle.db.select().from(t.evalCaseResults).where(eq(t.evalCaseResults.runId, run.id))).toHaveLength(0);
    });
  });
});
