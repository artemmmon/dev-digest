/**
 * SPEC-16 agent performance against real Postgres (Testcontainers, pattern: `eval.it.test.ts`).
 * What only a database can prove: which runs count (status, window, source, eval runs), the
 * decision counts per run (every finding kind, accepted later still counts, findings with no run
 * never count) and workspace scoping of both queries. Route cases go through `buildApp` +
 * `app.inject`. Gated on Docker; ephemeral container only, never the dev database.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AgentPerformance, AgentStats } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import { AgentPerformanceRepository } from '../src/modules/agent-performance/repository.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[agent-performance] Docker not available — skipping integration tests.');
}

const NOW = new Date();
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const WINDOW = { from: hoursAgo(24 * 30), to: NOW };

d('agent performance (Testcontainers pg)', () => {
  let pg: PgFixture;
  let defaultWorkspaceId: string;
  let repo: AgentPerformanceRepository;
  let seq = 0;
  const apps: FastifyInstance[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    defaultWorkspaceId = ws!.id;
    repo = new AgentPerformanceRepository(pg.handle.db);
  });
  afterAll(async () => {
    for (const app of apps) await app.close();
    await pg?.stop();
  });

  // ---------- fixtures: every scenario gets its own workspace so seed data never interferes ----------

  async function newWorkspace() {
    const db = pg.handle.db;
    const [ws] = await db.insert(t.workspaces).values({ name: `perf-${seq++}` }).returning();
    const workspaceId = ws!.id;
    const agent = await insertAgent(workspaceId);
    const [repoRow] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `r${seq}`, fullName: `acme/r${seq}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repoRow!.id,
        number: 1,
        title: 'PR',
        author: 'dev',
        branch: 'feat',
        base: 'main',
        headSha: 'abc',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'open',
      })
      .returning();
    return { workspaceId, agent, prId: pr!.id };
  }

  async function insertAgent(workspaceId: string, name = `perf-agent-${seq++}`) {
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name, provider: 'openrouter', model: 'm', systemPrompt: 'You review code.', version: 1 })
      .returning();
    return agent!;
  }

  async function insertRun(
    workspaceId: string,
    agentId: string | null,
    over: {
      status?: string;
      ranAt?: Date;
      source?: 'local' | 'ci';
      costUsd?: number | null;
      model?: string | null;
      durationMs?: number | null;
    } = {},
  ) {
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        agentId,
        status: over.status ?? 'done',
        ranAt: over.ranAt ?? hoursAgo(2),
        source: over.source ?? 'local',
        costUsd: over.costUsd === undefined ? 0.1 : over.costUsd,
        model: over.model === undefined ? 'm' : over.model,
        durationMs: over.durationMs === undefined ? 1000 : over.durationMs,
      })
      .returning();
    return run!;
  }

  async function insertReview(workspaceId: string, prId: string, runId: string | null) {
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId, runId, kind: 'review' })
      .returning();
    return review!;
  }

  async function insertFinding(
    reviewId: string,
    over: { acceptedAt?: Date | null; dismissedAt?: Date | null; kind?: string } = {},
  ) {
    await pg.handle.db.insert(t.findings).values({
      reviewId,
      file: 'a.ts',
      startLine: 1,
      endLine: 1,
      severity: 'WARNING',
      category: 'bug',
      title: 't',
      rationale: 'r',
      confidence: 0.5,
      kind: over.kind ?? 'finding',
      acceptedAt: over.acceptedAt ?? null,
      dismissedAt: over.dismissedAt ?? null,
    });
  }

  async function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        secrets: new MockSecretsProvider({}),
      },
    });
    apps.push(app);
    return app;
  }

  // ---------- which runs count ----------

  it('AC-92: counts done, failed and cancelled runs; a run still running is not counted (EC-4)', async () => {
    const { workspaceId, agent } = await newWorkspace();
    for (const status of ['done', 'failed', 'cancelled', 'running']) {
      await insertRun(workspaceId, agent.id, { status });
    }
    const rows = await repo.countedRuns(workspaceId, WINDOW);
    expect(rows.map((r) => r.status).sort()).toEqual(['cancelled', 'done', 'failed']);
  });

  it('AC-92: counts a run only when it started inside the window, bounds included', async () => {
    const { workspaceId, agent } = await newWorkspace();
    const from = new Date('2026-06-01T00:00:00.000Z');
    const to = new Date('2026-06-10T23:59:59.999Z');
    await insertRun(workspaceId, agent.id, { ranAt: new Date(from.getTime() - 1) }); // before
    await insertRun(workspaceId, agent.id, { ranAt: from }); // first instant
    await insertRun(workspaceId, agent.id, { ranAt: new Date('2026-06-05T12:00:00Z') });
    await insertRun(workspaceId, agent.id, { ranAt: to }); // last instant
    await insertRun(workspaceId, agent.id, { ranAt: new Date(to.getTime() + 1) }); // after
    const rows = await repo.countedRuns(workspaceId, { from, to });
    expect(rows).toHaveLength(3);
  });

  it('AC-93 / EC-3: local and CI runs both count; a CI run adds no decision', async () => {
    const { workspaceId, agent, prId } = await newWorkspace();
    const local = await insertRun(workspaceId, agent.id, { source: 'local' });
    await insertRun(workspaceId, agent.id, { source: 'ci', costUsd: 0.4, durationMs: 5000 });
    const review = await insertReview(workspaceId, prId, local.id);
    await insertFinding(review.id, { acceptedAt: NOW });
    const rows = await repo.countedRuns(workspaceId, WINDOW);
    expect(rows).toHaveLength(2);
    expect(rows.reduce((s, r) => s + r.accepted, 0)).toBe(1);
    expect(rows.find((r) => r.costUsd === 0.4)).toMatchObject({ accepted: 0, dismissed: 0, pending: 0 });
  });

  it('AC-95 / EC-12: an eval run never counts', async () => {
    const { workspaceId, agent } = await newWorkspace();
    await insertRun(workspaceId, agent.id);
    await pg.handle.db.insert(t.evalRuns).values({
      workspaceId,
      agentId: agent.id,
      agentVersion: 1,
      caseIds: [],
      status: 'done',
      startedAt: hoursAgo(1),
      casesTotal: 0,
    });
    expect(await repo.countedRuns(workspaceId, WINDOW)).toHaveLength(1);
  });

  it('AC-92: the agent filter returns one agent only; a deleted agent keeps its runs with a null agent', async () => {
    const { workspaceId, agent } = await newWorkspace();
    const other = await insertAgent(workspaceId);
    await insertRun(workspaceId, agent.id);
    await insertRun(workspaceId, other.id);
    await insertRun(workspaceId, other.id);
    expect(await repo.countedRuns(workspaceId, WINDOW, other.id)).toHaveLength(2);
    await pg.handle.db.delete(t.agents).where(eq(t.agents.id, other.id));
    const rows = await repo.countedRuns(workspaceId, WINDOW);
    expect(rows.filter((r) => r.agentId === null)).toHaveLength(2);
  });

  it('AC-92: hasCountedRunsOutside sees a counted run beyond the window, ignores running ones', async () => {
    const { workspaceId, agent } = await newWorkspace();
    expect(await repo.hasCountedRunsOutside(workspaceId, WINDOW)).toBe(false);
    await insertRun(workspaceId, agent.id); // inside
    expect(await repo.hasCountedRunsOutside(workspaceId, WINDOW)).toBe(false);
    await insertRun(workspaceId, agent.id, { status: 'running', ranAt: hoursAgo(24 * 90) });
    expect(await repo.hasCountedRunsOutside(workspaceId, WINDOW)).toBe(false);
    await insertRun(workspaceId, agent.id, { ranAt: hoursAgo(24 * 90) });
    expect(await repo.hasCountedRunsOutside(workspaceId, WINDOW)).toBe(true);
  });

  // ---------- decisions ----------

  it('AC-94: accepted, dismissed and pending findings are counted per run, every kind included', async () => {
    const { workspaceId, agent, prId } = await newWorkspace();
    const run = await insertRun(workspaceId, agent.id);
    const review = await insertReview(workspaceId, prId, run.id);
    await insertFinding(review.id, { acceptedAt: NOW });
    await insertFinding(review.id, { acceptedAt: NOW, kind: 'positive' });
    await insertFinding(review.id, { dismissedAt: NOW });
    await insertFinding(review.id, {});
    await insertFinding(review.id, { kind: 'positive' });
    await insertFinding(review.id, {});
    const [row] = await repo.countedRuns(workspaceId, WINDOW);
    expect(row).toMatchObject({ accepted: 2, dismissed: 1, pending: 3 });
  });

  it('AC-94: a finding that is both accepted and dismissed counts once, as accepted', async () => {
    const { workspaceId, agent, prId } = await newWorkspace();
    const run = await insertRun(workspaceId, agent.id);
    const review = await insertReview(workspaceId, prId, run.id);
    await insertFinding(review.id, { acceptedAt: NOW, dismissedAt: NOW });
    const [row] = await repo.countedRuns(workspaceId, WINDOW);
    expect(row).toMatchObject({ accepted: 1, dismissed: 0, pending: 0 });
  });

  it('AC-94: a run with no review has zero counts, and several reviews of one run are summed', async () => {
    const { workspaceId, agent, prId } = await newWorkspace();
    await insertRun(workspaceId, agent.id, { costUsd: 0.7 });
    const withReviews = await insertRun(workspaceId, agent.id, { costUsd: 0.9 });
    const r1 = await insertReview(workspaceId, prId, withReviews.id);
    const r2 = await insertReview(workspaceId, prId, withReviews.id);
    await insertFinding(r1.id, { acceptedAt: NOW });
    await insertFinding(r2.id, { dismissedAt: NOW });
    const rows = await repo.countedRuns(workspaceId, WINDOW);
    expect(rows).toHaveLength(2); // the join does not multiply runs
    expect(rows.find((r) => r.costUsd === 0.7)).toMatchObject({ accepted: 0, dismissed: 0, pending: 0 });
    expect(rows.find((r) => r.costUsd === 0.9)).toMatchObject({ accepted: 1, dismissed: 1, pending: 0 });
  });

  it('EC-9: a finding accepted after the period ended still counts in the period of its run', async () => {
    const { workspaceId, agent, prId } = await newWorkspace();
    const run = await insertRun(workspaceId, agent.id, { ranAt: new Date('2026-06-05T12:00:00Z') });
    const review = await insertReview(workspaceId, prId, run.id);
    await insertFinding(review.id, { acceptedAt: new Date('2026-09-30T00:00:00Z') });
    const rows = await repo.countedRuns(workspaceId, {
      from: new Date('2026-06-01T00:00:00Z'),
      to: new Date('2026-06-10T00:00:00Z'),
    });
    expect(rows[0]).toMatchObject({ accepted: 1 });
  });

  it('EC-13: findings of a review that belongs to no run are never counted', async () => {
    const { workspaceId, agent, prId } = await newWorkspace();
    await insertRun(workspaceId, agent.id);
    const seeded = await insertReview(workspaceId, prId, null);
    await insertFinding(seeded.id, { acceptedAt: NOW });
    await insertFinding(seeded.id, { dismissedAt: NOW });
    const rows = await repo.countedRuns(workspaceId, WINDOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ accepted: 0, dismissed: 0, pending: 0 });
  });

  // ---------- scoping ----------

  it("NFR-2: another workspace's runs are never returned, nor counted as outside", async () => {
    const mine = await newWorkspace();
    const theirs = await newWorkspace();
    await insertRun(theirs.workspaceId, theirs.agent.id);
    await insertRun(theirs.workspaceId, theirs.agent.id, { ranAt: hoursAgo(24 * 90) });
    expect(await repo.countedRuns(mine.workspaceId, WINDOW)).toEqual([]);
    expect(await repo.hasCountedRunsOutside(mine.workspaceId, WINDOW)).toBe(false);
    expect(await repo.countedRuns(mine.workspaceId, WINDOW, theirs.agent.id)).toEqual([]);
  });

  it('NFR-2: a review row of another workspace never feeds a run`s decisions', async () => {
    const mine = await newWorkspace();
    const theirs = await newWorkspace();
    const run = await insertRun(mine.workspaceId, mine.agent.id);
    // inconsistent on purpose: a review pointing at my run but stored in the other workspace
    const foreign = await insertReview(theirs.workspaceId, theirs.prId, run.id);
    await insertFinding(foreign.id, { acceptedAt: NOW });
    const [row] = await repo.countedRuns(mine.workspaceId, WINDOW);
    expect(row).toMatchObject({ accepted: 0, dismissed: 0, pending: 0 });
  });

  // ---------- routes ----------

  it('AC-88: GET /agents/:id/stats answers with the figures of the agent in the caller workspace', async () => {
    const app = await makeApp();
    const created = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `route-agent-${seq++}`, provider: 'openrouter', model: 'm', system_prompt: 's' },
      })
    ).json() as { id: string };
    await insertRun(defaultWorkspaceId, created.id, { costUsd: 0.2 });
    await insertRun(defaultWorkspaceId, created.id, { status: 'failed', costUsd: null, durationMs: null });
    const res = await app.inject({ method: 'GET', url: `/agents/${created.id}/stats?period=30d` });
    expect(res.statusCode).toBe(200);
    const stats = res.json() as AgentStats;
    expect(stats).toMatchObject({ agent_id: created.id, runs: 2, runs_done: 1, runs_failed: 1, cost_partial: true });
    expect(stats.total_cost_usd).toBeCloseTo(0.2, 9);
  });

  it('NFR-2 / AC-90: an agent of another workspace, and an unknown agent, are 404 on the stats route', async () => {
    const app = await makeApp();
    const foreign = await newWorkspace();
    const mine = await app.inject({ method: 'GET', url: `/agents/${foreign.agent.id}/stats?period=30d` });
    expect(mine.statusCode).toBe(404);
    const unknown = await app.inject({
      method: 'GET',
      url: '/agents/00000000-0000-4000-8000-0000000000aa/stats?period=30d',
    });
    expect(unknown.statusCode).toBe(404);
  });

  it("NFR-2: GET /agent-performance lists only the caller workspace's agents and runs", async () => {
    const app = await makeApp();
    const foreign = await newWorkspace();
    await insertRun(foreign.workspaceId, foreign.agent.id);
    const res = await app.inject({ method: 'GET', url: '/agent-performance?period=30d' });
    expect(res.statusCode).toBe(200);
    const perf = res.json() as AgentPerformance;
    expect(perf.agents.some((a) => a.agent_id === foreign.agent.id)).toBe(false);
    expect(perf.cost_by_agent.some((c) => c.agent_id === foreign.agent.id)).toBe(false);
  });

  it('AC-91: bad periods are 422 on both routes, a good custom range is 200', async () => {
    const app = await makeApp();
    const agent = await insertAgent(defaultWorkspaceId);
    for (const q of [
      'period=7d',
      'period=custom',
      'period=custom&from=nope&to=2026-10-02T00:00:00.000Z',
      'period=custom&from=2026-10-05T00:00:00.000Z&to=2026-10-02T00:00:00.000Z',
    ]) {
      const ws = await app.inject({ method: 'GET', url: `/agent-performance?${q}` });
      const one = await app.inject({ method: 'GET', url: `/agents/${agent.id}/stats?${q}` });
      expect([ws.statusCode, one.statusCode]).toEqual([422, 422]);
    }
    const ok = await app.inject({
      method: 'GET',
      url: `/agent-performance?period=custom&from=${encodeURIComponent('2026-10-01T00:00:00.000+03:00')}&to=${encodeURIComponent('2026-10-02T23:59:59.999+03:00')}`,
    });
    expect(ok.statusCode).toBe(200);
  });
});
