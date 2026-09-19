import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PrMeta } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * Workspace isolation and write integrity: ids from another workspace answer
 * 404/422 instead of leaking or linking across tenants, a run deletion takes
 * its review and findings with it, and the PR list sync is one batched upsert.
 */
d('data integrity (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db
      .select()
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    otherWorkspaceId = other!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(pulls?: PrMeta[]) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient({ pulls }) },
    });
  }

  async function insertRun(ws: string, status = 'running') {
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId: ws, status })
      .returning();
    return run!;
  }

  it("an agent can't link another workspace's skill", async () => {
    const app = await makeApp();
    const [foreignSkill] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId: otherWorkspaceId,
        name: 'foreign',
        description: 'x',
        type: 'custom',
        source: 'manual',
        body: 'x',
      })
      .returning();
    const agentId = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'A', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json().id as string;

    const setAll = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [foreignSkill!.id] },
    });
    expect(setAll.statusCode).toBe(422);
    const linkOne = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_id: foreignSkill!.id },
    });
    expect(linkOne.statusCode).toBe(422);
    await app.close();
  });

  it("another workspace's run is 404 for cancel, trace and events — and stays running", async () => {
    const app = await makeApp();
    const run = await insertRun(otherWorkspaceId);

    for (const [method, url] of [
      ['POST', `/runs/${run.id}/cancel`],
      ['GET', `/runs/${run.id}/trace`],
      ['GET', `/runs/${run.id}/events`],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    const [after] = await pg.handle.db
      .select({ status: t.agentRuns.status })
      .from(t.agentRuns)
      .where(eq(t.agentRuns.id, run.id));
    expect(after!.status).toBe('running');
    await app.close();
  });

  it("another workspace's repo is 404 for index-state and resync", async () => {
    const app = await makeApp();
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: otherWorkspaceId, owner: 'o', name: 'n', fullName: 'o/n' })
      .returning();

    const state = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/index-state` });
    expect(state.statusCode).toBe(404);
    const resync = await app.inject({ method: 'POST', url: `/repos/${repo!.id}/resync` });
    expect(resync.statusCode).toBe(404);
    await app.close();
  });

  it('deleting a run deletes its review and findings through the FK cascade', async () => {
    const app = await makeApp();
    const { db } = pg.handle;
    const [pr] = await db.select().from(t.pullRequests).limit(1);
    const run = await insertRun(workspaceId, 'done');
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr!.id, runId: run.id, kind: 'review' })
      .returning();
    await db.insert(t.findings).values({
      reviewId: review!.id,
      file: 'a.ts',
      startLine: 1,
      endLine: 1,
      severity: 'WARNING',
      category: 'bug',
      title: 't',
      rationale: 'r',
      confidence: 0.5,
    });

    const res = await app.inject({ method: 'DELETE', url: `/runs/${run.id}` });
    expect(res.json()).toEqual({ ok: true });
    expect(await db.select().from(t.reviews).where(eq(t.reviews.id, review!.id))).toEqual([]);
    expect(
      await db.select().from(t.findings).where(eq(t.findings.reviewId, review!.id)),
    ).toEqual([]);
    await app.close();
  });

  it('the database rejects an unknown finding severity', async () => {
    const { db } = pg.handle;
    const [review] = await db.select().from(t.reviews).limit(1);
    await expect(
      db.insert(t.findings).values({
        reviewId: review!.id,
        file: 'a.ts',
        startLine: 1,
        endLine: 1,
        severity: 'BLOCKER',
        category: 'bug',
        title: 't',
        rationale: 'r',
        confidence: 0.5,
      }),
    ).rejects.toThrow();
  });

  it('the PR list sync upserts a repeated PR number once, with the latest data', async () => {
    const pr = (n: number, title: string): PrMeta => ({
      number: n,
      title,
      author: 'a',
      branch: 'b',
      base: 'main',
      head_sha: `sha-${title}`,
      additions: 0,
      deletions: 0,
      files_count: 0,
      status: 'open',
      opened_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-02T00:00:00Z',
    });
    const app = await makeApp([pr(900, 'first'), pr(901, 'other'), pr(900, 'moved page')]);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'sync', fullName: 'acme/sync' })
      .returning();

    const res = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const byNumber = new Map(
      (res.json() as { number: number; title: string }[]).map((p) => [p.number, p.title]),
    );
    expect(byNumber.get(900)).toBe('moved page');
    expect(byNumber.get(901)).toBe('other');
    await app.close();
  });
});
