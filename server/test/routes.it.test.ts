import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

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
});
