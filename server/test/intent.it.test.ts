import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { PrIntentResponse, PrIntent } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[intent] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const CLASSIFICATION_FIXTURE = {
  summary: 'Adds a rate limiter to the public API endpoints.',
  in_scope: ['rate limiter middleware'],
  out_of_scope: ['auth changes'],
  risk_areas: [{ kind: 'performance', label: 'Adds a per-request check' }],
};

let repoSeq = 0;
async function setupRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  overrides: Partial<typeof t.pullRequests.$inferInsert> = {},
) {
  const name = `intent-repo-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, defaultBranch: 'main' })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'sha-1',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Closes #12. Adds a rate limiter to the public API.',
      ...overrides,
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/middleware/rate-limit.ts',
    additions: 10,
    deletions: 0,
    patch: '@@ -1,1 +1,10 @@ export function rateLimit() {',
  });
  return { repo: repo!, pr: pr! };
}

d('intent (Testcontainers pg)', () => {
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

  function makeApp(opts: { llm?: MockLLMProvider } = {}) {
    const llm = opts.llm ?? new MockLLMProvider('openai', { structured: CLASSIFICATION_FIXTURE });
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient({
          closingIssues: {}, // this test repo's head sha isn't the default branch's actual state; keep GraphQL empty and rely on regex
        }),
        llm: { openrouter: llm },
      },
    });
  }
  type App = Awaited<ReturnType<typeof makeApp>>;

  const getIntent = async (app: App, prId: string) =>
    (await app.inject({ method: 'GET', url: `/pulls/${prId}/intent` })).json() as PrIntentResponse;
  const postIntent = async (app: App, prId: string) => {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/intent` });
    return { status: res.statusCode, body: res.json() as PrIntent };
  };

  it('GET with no row returns null, not stale', async () => {
    const app = await makeApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const res = await getIntent(app, pr.id);
    expect(res).toEqual({ intent: null, stale: false, current_head_sha: 'sha-1' });
    await app.close();
  });

  it('POST derives and persists; a later GET serves the stored row', async () => {
    const app = await makeApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const { status, body } = await postIntent(app, pr.id);
    expect(status).toBe(200);
    expect(body.summary).toBe(CLASSIFICATION_FIXTURE.summary);
    expect(body.in_scope).toEqual(CLASSIFICATION_FIXTURE.in_scope);
    expect(body.risk_areas.some((r) => r.origin === 'model')).toBe(true);
    expect(body.head_sha).toBe('sha-1');

    const fetched = await getIntent(app, pr.id);
    expect(fetched.intent?.summary).toBe(CLASSIFICATION_FIXTURE.summary);
    expect(fetched.stale).toBe(false);
    // cost_usd is numeric(14,8) in Postgres (read back as a string) — the API still serves a number.
    expect(body.cost_usd).toBe(0.001);
    expect(fetched.intent?.cost_usd).toBe(0.001);
    await app.close();
  });

  it('a head change makes the stored intent stale', async () => {
    const app = await makeApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await postIntent(app, pr.id);

    await pg.handle.db.update(t.pullRequests).set({ headSha: 'sha-2' }).where(eq(t.pullRequests.id, pr.id));

    const fetched = await getIntent(app, pr.id);
    expect(fetched.stale).toBe(true);
    expect(fetched.current_head_sha).toBe('sha-2');
    // the stored row itself still reflects the SHA it was derived for
    expect(fetched.intent?.head_sha).toBe('sha-1');
    await app.close();
  });

  it('opening the PR page after a push refreshes the head, so the intent turns stale', async () => {
    const app = await makeApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await postIntent(app, pr.id); // derived for sha-1

    // GET /pulls/:id refreshes detail from GitHub; the mock PR head is a1b2c3d4.
    const detail = await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    expect(detail.statusCode).toBe(200);

    const fetched = await getIntent(app, pr.id);
    expect(fetched.current_head_sha).toBe('a1b2c3d4');
    expect(fetched.stale).toBe(true);
    await app.close();
  });

  it('a second POST re-derives and overwrites the stored row', async () => {
    const app = await makeApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await postIntent(app, pr.id);

    const secondFixture = { ...CLASSIFICATION_FIXTURE, summary: 'A different, re-derived summary.' };
    const secondApp = await makeApp({ llm: new MockLLMProvider('openai', { structured: secondFixture }) });
    const { status, body } = await postIntent(secondApp, pr.id);
    expect(status).toBe(200);
    expect(body.summary).toBe('A different, re-derived summary.');

    const fetched = await getIntent(app, pr.id);
    expect(fetched.intent?.summary).toBe('A different, re-derived summary.');
    await app.close();
    await secondApp.close();
  });

  it("another workspace's PR is 404 for both GET and POST", async () => {
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-intent-ws' }).returning();
    const { pr } = await setupRepoAndPr(pg.handle.db, otherWs!.id);

    const app = await makeApp();
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` })).statusCode).toBe(404);
    await app.close();
  });

  it('no LLM key configured surfaces the structured error envelope', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        secrets: new MockSecretsProvider({}), // no OPENROUTER_API_KEY, no GITHUB_TOKEN
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(res.json()).toMatchObject({ error: { code: 'config_error' } });
    await app.close();
  });

  it('the POST route is rate-limited', async () => {
    // The global rate-limit plugin is disabled under NODE_ENV=test (app.ts) so
    // integration suites can hammer routes via inject(); force it on here,
    // just for this one ephemeral app instance, to prove the per-route
    // `{max: 10, timeWindow: '1 minute'}` config on POST /pulls/:id/intent
    // really is wired (not merely present in the route options object).
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'development' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openrouter: new MockLLMProvider('openai', { structured: CLASSIFICATION_FIXTURE }) },
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await postIntent(app, pr.id)).status);
    }
    expect(statuses).toContain(429);
    await app.close();
  });
});
