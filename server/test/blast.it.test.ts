/**
 * Blast radius route — GET /pulls/:id/blast: grouped map, index-state reasons,
 * "no facade call without a usable index", flag off, workspace-scoped 404,
 * uuid-shaped 422, and a PR without files. Gated on Docker (needs Postgres),
 * pattern: `smart-diff.it.test.ts`. The repo-intel facade is a scripted fake.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { BlastRadiusResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import type { BlastResult, IndexState } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[blast] Docker not available — skipping integration tests.');
}

const config = (env: Record<string, string> = {}) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', REPO_INTEL_ENABLED: 'true', ...env } as NodeJS.ProcessEnv);

const indexState = (over: Partial<IndexState>): IndexState => ({
  repoId: 'r',
  status: 'full',
  filesIndexed: 3,
  filesSkipped: 0,
  durationMs: 1,
  lastIndexedSha: 'idx-sha',
  indexerVersion: 2,
  updatedAt: new Date(),
  ...over,
});

const blastResult: BlastResult = {
  changedSymbols: [{ file: 'src/lib.ts', name: 'a', kind: 'function' }],
  callers: [
    { file: 'src/routes.ts', symbol: 'handler', viaSymbol: 'a', line: 7, rank: 5 },
    { file: 'src/other.ts', symbol: 'helper', viaSymbol: 'a', line: 2, rank: 1 },
  ],
  impactedEndpoints: ['GET /a'],
  factsByFile: { 'src/routes.ts': { endpoints: ['GET /a'], crons: [] } },
  degraded: false,
};

/** Only the two facade methods the blast route uses; counts the blast calls. */
function fakeIntel(state: Partial<IndexState> = {}) {
  const calls = { blast: 0 };
  const intel = {
    getIndexState: async () => indexState(state),
    getBlastRadius: async () => {
      calls.blast += 1;
      return blastResult;
    },
  } as unknown as RepoIntel;
  return { intel, calls };
}

let seq = 0;
async function setupPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  paths: string[] = ['src/lib.ts'],
) {
  const name = `blast-repo-${seq++}`;
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
      title: 'Blast test PR',
      author: 'marisa.koch',
      branch: 'feat/blast',
      base: 'main',
      headSha: 'head-sha-1',
      additions: 1,
      deletions: 0,
      filesCount: paths.length,
      status: 'open',
    })
    .returning();
  if (paths.length > 0) {
    await db.insert(t.prFiles).values(paths.map((path) => ({ prId: pr!.id, path, additions: 1, deletions: 0 })));
  }
  return { repo: repo!, pr: pr! };
}

d('blast (Testcontainers pg)', () => {
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

  const makeApp = (intel: RepoIntel, env: Record<string, string> = {}) =>
    buildApp({ config: config(env), db: pg.handle.db, overrides: { repoIntel: intel } });
  type App = Awaited<ReturnType<typeof makeApp>>;

  const getBlast = async (app: App, id: string) => {
    const res = await app.inject({ method: 'GET', url: `/pulls/${id}/blast` });
    return { status: res.statusCode, body: res.statusCode === 200 ? (res.json() as BlastRadiusResponse) : undefined };
  };

  it('full index -> 200 with a grouped map and counts', async () => {
    const { intel, calls } = fakeIntel();
    const app = await makeApp(intel);
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    const { status, body } = await getBlast(app, pr.id);
    expect(status).toBe(200);
    expect(body!.head_sha).toBe('head-sha-1');
    expect(body!.index).toEqual({ status: 'full', degraded: false, reason: null, indexed_sha: 'idx-sha' });
    expect(body!.blast.downstream).toHaveLength(1);
    expect(body!.blast.downstream[0]).toMatchObject({
      symbol: 'a',
      endpoints_affected: ['GET /a'],
      callers: [
        { name: 'handler', file: 'src/routes.ts', line: 7 },
        { name: 'helper', file: 'src/other.ts', line: 2 },
      ],
    });
    expect(body!.counts).toEqual({ changed_files: 1, symbols: 1, callers: 2, endpoints: 1, crons: 0 });
    expect(body!.limits.max_callers_per_symbol).toBe(20);
    expect(calls.blast).toBe(1);
  });

  it('partial index -> index_partial, map still returned', async () => {
    const { intel, calls } = fakeIntel({ status: 'partial' });
    const app = await makeApp(intel);
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    const { status, body } = await getBlast(app, pr.id);
    expect(status).toBe(200);
    expect(body!.index).toMatchObject({ degraded: true, reason: 'index_partial' });
    expect(body!.blast.downstream).toHaveLength(1);
    expect(calls.blast).toBe(1);
  });

  it('no index -> no_data and the facade is not called', async () => {
    const { intel, calls } = fakeIntel({ status: 'degraded', degradedReason: 'no_data', lastIndexedSha: '' });
    const app = await makeApp(intel);
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    const { status, body } = await getBlast(app, pr.id);
    expect(status).toBe(200);
    expect(body!.index).toMatchObject({ degraded: true, reason: 'no_data', indexed_sha: null });
    expect(body!.blast.downstream).toEqual([]);
    expect(calls.blast).toBe(0);
  });

  it('REPO_INTEL_ENABLED=false -> flag_off and the facade is not called', async () => {
    const { intel, calls } = fakeIntel();
    const app = await makeApp(intel, { REPO_INTEL_ENABLED: 'false' });
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    const { status, body } = await getBlast(app, pr.id);
    expect(status).toBe(200);
    expect(body!.index).toMatchObject({ degraded: true, reason: 'flag_off' });
    expect(calls.blast).toBe(0);
  });

  it('PR from another workspace -> 404', async () => {
    const { intel } = fakeIntel();
    const app = await makeApp(intel);
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const { pr } = await setupPr(pg.handle.db, other!.id);

    expect((await getBlast(app, pr.id)).status).toBe(404);
  });

  it('random uuid -> 404, not-a-uuid -> 422', async () => {
    const { intel } = fakeIntel();
    const app = await makeApp(intel);
    expect((await getBlast(app, crypto.randomUUID())).status).toBe(404);
    expect((await getBlast(app, 'not-a-uuid')).status).toBe(422);
  });

  it('PR without pr_files -> changed_files 0 and the facade is not called', async () => {
    const { intel, calls } = fakeIntel();
    const app = await makeApp(intel);
    const { pr } = await setupPr(pg.handle.db, workspaceId, []);

    const { status, body } = await getBlast(app, pr.id);
    expect(status).toBe(200);
    expect(body!.counts.changed_files).toBe(0);
    expect(calls.blast).toBe(0);
  });
});
