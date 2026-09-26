/**
 * Smart Diff route (spec 09) — GET /pulls/:id/smart-diff: 5 role groups in
 * order, workspace-scoped 404, uuid-shaped 422, and the latest review round's
 * finding lines. Gated on Docker (needs Postgres), pattern: `intent.it.test.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SmartDiffResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[smart-diff] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `smart-diff-repo-${repoSeq++}`;
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
      title: 'Smart Diff test PR',
      author: 'marisa.koch',
      branch: 'feat/smart-diff',
      base: 'main',
      headSha: 'sha-1',
      additions: 4,
      deletions: 0,
      filesCount: 4,
      status: 'open',
    })
    .returning();
  await db.insert(t.prFiles).values([
    { prId: pr!.id, path: 'pnpm-lock.yaml', additions: 100, deletions: 0 },
    { prId: pr!.id, path: 'server/src/modules/pulls/service.ts', additions: 10, deletions: 2 },
    { prId: pr!.id, path: 'server/test/pulls-service.test.ts', additions: 5, deletions: 0 },
    { prId: pr!.id, path: 'server/src/modules/pulls/index.ts', additions: 1, deletions: 0 },
  ]);
  return { repo: repo!, pr: pr! };
}

d('smart-diff (Testcontainers pg)', () => {
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

  function makeApp() {
    return buildApp({ config: config(), db: pg.handle.db });
  }
  type App = Awaited<ReturnType<typeof makeApp>>;

  const getSmartDiff = async (app: App, prId: string) => {
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    return { status: res.statusCode, body: res.statusCode === 200 ? (res.json() as SmartDiffResponse) : undefined };
  };

  it('a PR with a lock file, a core file, a test file and index.ts, no reviews → 200, 5 groups in order, each file in the right group', async () => {
    const app = await makeApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const { status, body } = await getSmartDiff(app, pr.id);
    expect(status).toBe(200);
    expect(body!.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);

    const byRole = new Map(body!.groups.map((g) => [g.role, g.files.map((f) => f.path)]));
    expect(byRole.get('boilerplate')).toEqual(['pnpm-lock.yaml']);
    expect(byRole.get('core')).toEqual(['server/src/modules/pulls/service.ts']);
    expect(byRole.get('tests')).toEqual(['server/test/pulls-service.test.ts']);
    expect(byRole.get('wiring')).toEqual(['server/src/modules/pulls/index.ts']);
    expect(byRole.get('docs')).toEqual([]);

    for (const g of body!.groups) for (const f of g.files) expect(f.finding_lines).toEqual([]);
    expect(body!.split_suggestion).toEqual({ too_big: false, total_lines: 118, proposed_splits: [] });
    await app.close();
  });

  it('a PR with a review round → the right finding_lines', async () => {
    const app = await makeApp();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, prId: pr.id, batchId: crypto.randomUUID(), status: 'done' })
      .returning();
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, runId: run!.id, kind: 'review' })
      .returning();
    await pg.handle.db.insert(t.findings).values({
      reviewId: review!.id,
      file: 'server/src/modules/pulls/service.ts',
      startLine: 12,
      endLine: 12,
      severity: 'WARNING',
      category: 'correctness',
      title: 'Missing null check',
      rationale: 'x may be undefined here.',
      confidence: 0.8,
    });

    const { status, body } = await getSmartDiff(app, pr.id);
    expect(status).toBe(200);
    const core = body!.groups.find((g) => g.role === 'core')!;
    const file = core.files.find((f) => f.path === 'server/src/modules/pulls/service.ts')!;
    expect(file.finding_lines).toEqual([12]);
    await app.close();
  });

  it('a random uuid → 404', async () => {
    const app = await makeApp();
    const { status } = await getSmartDiff(app, crypto.randomUUID());
    expect(status).toBe(404);
    await app.close();
  });

  it('not-a-uuid → 422', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
