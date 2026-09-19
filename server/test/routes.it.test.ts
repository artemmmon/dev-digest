import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * Route coverage for endpoints the other suites don't exercise: each one through
 * app.inject() against a real Postgres, including its response schema.
 */
d('routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db
      .select()
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  it('PUT /settings saves every key and GET /settings reads them back', async () => {
    const app = await makeApp();
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { theme: 'light', density: 'compact' },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ theme: 'light', density: 'compact' });

    // a second save updates in place (upsert), it doesn't duplicate
    await app.inject({ method: 'PUT', url: '/settings', payload: { theme: 'dark' } });
    const get = await app.inject({ method: 'GET', url: '/settings' });
    expect(get.json()).toMatchObject({ theme: 'dark', density: 'compact' });
    await app.close();
  });

  it('GET /workspace lists the workspace repos with their clone state', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/workspace' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.workspaceId).toBe(workspaceId);
    expect(body.repos.length).toBeGreaterThan(0);
    expect(body.repos[0]).toHaveProperty('cloned');
    await app.close();
  });

  it('GET /health/ready answers ready when the DB is reachable', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.json()).toEqual({ ready: true });
    await app.close();
  });

  it('DELETE /repos/:id removes the repo and its PRs; unknown → 404', async () => {
    const app = await makeApp();
    const { db } = pg.handle;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'doomed', fullName: 'acme/doomed' })
      .returning();
    await db.insert(t.pullRequests).values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 't',
      author: 'a',
      branch: 'b',
      base: 'main',
      headSha: 'sha',
    });

    const res = await app.inject({ method: 'DELETE', url: `/repos/${repo!.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ deleted: repo!.id });
    expect(await db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repo!.id))).toEqual([]);

    const again = await app.inject({ method: 'DELETE', url: `/repos/${repo!.id}` });
    expect(again.statusCode).toBe(404);
    await app.close();
  });

  it('POST /repos/:id/refresh re-enqueues the clone; unknown repo → 404', async () => {
    const app = await makeApp();
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'refreshable', fullName: 'acme/refreshable' })
      .returning();

    const ok = await app.inject({ method: 'POST', url: `/repos/${repo!.id}/refresh` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ status: 'refreshing' });
    await app.container.jobs.onIdle();

    const missing = await app.inject({
      method: 'POST',
      url: '/repos/00000000-0000-0000-0000-000000000000/refresh',
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('GET /repos/:id/index-state degrades instead of failing for an unindexed repo', async () => {
    const app = await makeApp();
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'unindexed', fullName: 'acme/unindexed' })
      .returning();
    const res = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/index-state` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ repoId: repo!.id, status: 'degraded' });
    await app.close();
  });

  it('POST /repos/:id/resync answers 202 with a job id', async () => {
    const app = await makeApp();
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'resyncable', fullName: 'acme/resyncable' })
      .returning();
    const res = await app.inject({ method: 'POST', url: `/repos/${repo!.id}/resync` });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ status: 'accepted' });
    await app.container.jobs.onIdle();
    await app.close();
  });

  it('GET /pulls/:id serves the persisted detail when GitHub is not configured', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    // an empty secrets store: no token from the developer's machine may reach GitHub
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), secrets: new MockSecretsProvider({}) },
    });
    const { db } = pg.handle;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'offline', fullName: 'acme/offline' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 5,
        title: 'Offline PR',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'sha',
        body: 'from the DB',
      })
      .returning();
    await db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/a.ts', additions: 2, deletions: 1, patch: '@@ -1 +1,2 @@' });

    // no token configured → the local copy is served
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr!.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: pr!.id,
      number: 5,
      body: 'from the DB',
      files: [{ path: 'src/a.ts', additions: 2 }],
    });
    await app.close();
  });

  it('DELETE /reviews/:id removes the review and its findings; unknown → 404', async () => {
    const app = await makeApp();
    const { db } = pg.handle;
    const [pr] = await db.select().from(t.pullRequests).limit(1);
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr!.id, kind: 'review' })
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

    const res = await app.inject({ method: 'DELETE', url: `/reviews/${review!.id}` });
    expect(res.json()).toEqual({ ok: true });
    expect(await db.select().from(t.findings).where(eq(t.findings.reviewId, review!.id))).toEqual([]);
    expect((await app.inject({ method: 'DELETE', url: `/reviews/${review!.id}` })).statusCode).toBe(404);
    await app.close();
  });

  // Lives here, not in routes-smoke: the handler resolves the workspace (a DB read) before it
  // checks the body, so without a database this answers 500 instead of 400.
  it('POST /pulls/:id/review without a body is a 400 asking for agentId or all, not a validation error', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/pulls/00000000-0000-0000-0000-000000000000/review',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_run_request');
    await app.close();
  });
});
