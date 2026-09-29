/**
 * GET /repos/:id/pulls/by-number/:number — DB-only PR lookup used by the MCP
 * server. Gated on Docker (Postgres via Testcontainers). No GitHub client is
 * needed: the route never talks to GitHub, so a broken one proves that.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { PrMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('GET /repos/:id/pulls/by-number/:number (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function repoWithPr(ws: string, name: string, number: number) {
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    await db.insert(t.pullRequests).values({
      workspaceId: ws,
      repoId: repo!.id,
      number,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'deadbeef',
      additions: 3,
      deletions: 1,
      filesCount: 2,
      status: 'open',
    });
    return repo!;
  }

  it('returns the PR for a known number', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const repo = await repoWithPr(workspaceId, 'by-number-found', 42);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls/by-number/42` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PrMeta;
    expect(body.number).toBe(42);
    expect(body.title).toBe('Add rate limiting');
  });

  it('404 for an unknown number', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const repo = await repoWithPr(workspaceId, 'by-number-missing', 42);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls/by-number/43` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  it('404 for a repo of another workspace', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const [other] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'other-by-number-ws' })
      .returning();
    const repo = await repoWithPr(other!.id, 'by-number-foreign', 5);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls/by-number/5` });
    expect(res.statusCode).toBe(404);
  });

  it('422 for a non-uuid repo id and for a bad number', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const bad = await app.inject({ method: 'GET', url: '/repos/not-a-uuid/pulls/by-number/1' });
    expect(bad.statusCode).toBe(422);

    const repo = await repoWithPr(workspaceId, 'by-number-badnum', 9);
    const zero = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls/by-number/0` });
    expect(zero.statusCode).toBe(422);
  });
});
