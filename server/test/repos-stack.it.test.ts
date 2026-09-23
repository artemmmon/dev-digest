import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { RepoRepository } from '../src/modules/repos/repository.js';
import { RepoService } from '../src/modules/repos/service.js';
import type { JobQueue } from '../src/modules/_shared/ports.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[repos-stack] Docker not available — skipping integration tests.');
}

/** `detectAndStoreStack`/`backfillMissingStacks` never enqueue anything — a no-op is enough. */
const noopJobs: JobQueue = {
  async enqueue() {
    return { id: 'noop' };
  },
  register() {},
};

/** Simulates a clone directory git can no longer read (subclass, not instance monkey-patching). */
class ThrowingGitClient extends MockGitClient {
  override async listFiles(): Promise<string[]> {
    throw new Error('clone directory missing');
  }
}

/**
 * Repo-stack persistence: the round trip through `RepoRepository`, `GET /repos`
 * carrying `stack`, and the fallback to `null` for a row this shape can't parse
 * (`RepoRepository.toRecord` → `safeParse`, so an old/foreign row never breaks the
 * response schema).
 */
d('repo-stack persistence', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function insertRepo(fullName: string) {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: fullName, fullName: `acme/${fullName}` })
      .returning();
    return repo!;
  }

  it('a fresh repo has `stack: null`', async () => {
    const repository = new RepoRepository(pg.handle.db);
    const repo = await insertRepo('fresh');
    const record = await repository.getById(workspaceId, repo.id);
    expect(record?.stack).toBeNull();
  });

  it('detectAndStoreStack persists a real stack, readable back through the repository and GET /repos', async () => {
    const repo = await insertRepo('flutter-app');
    const git = new MockGitClient({
      files: {
        'pubspec.yaml': 'dependencies:\n  flutter:\n    sdk: flutter\n  flutter_bloc: ^8.0.0\n',
        'lib/main.dart': 'void main() {}',
      },
    });
    const service = new RepoService({ repos: new RepoRepository(pg.handle.db), git, jobs: noopJobs });
    await service.detectAndStoreStack(repo.id, { owner: 'acme', name: 'flutter-app' });

    const record = await new RepoRepository(pg.handle.db).getById(workspaceId, repo.id);
    expect(record?.stack).toMatchObject({
      frameworks: [{ name: 'Flutter', path: '' }],
      languages: [{ name: 'Dart', share: 1 }],
      packages: ['flutter_bloc'],
    });

    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const res = await app.inject({ method: 'GET', url: '/repos' });
    expect(res.statusCode).toBe(200);
    const found = res.json().find((r: { id: string }) => r.id === repo.id);
    expect(found.stack).toMatchObject({ frameworks: [{ name: 'Flutter', path: '' }] });
  });

  it('a detection failure leaves `stack` untouched instead of throwing', async () => {
    const repo = await insertRepo('broken-clone');
    const service = new RepoService({
      repos: new RepoRepository(pg.handle.db),
      git: new ThrowingGitClient(),
      jobs: noopJobs,
    });
    await expect(
      service.detectAndStoreStack(repo.id, { owner: 'acme', name: 'broken-clone' }),
    ).resolves.toBeUndefined();

    const record = await new RepoRepository(pg.handle.db).getById(workspaceId, repo.id);
    expect(record?.stack).toBeNull();
  });

  it('a row whose `stack` cannot be parsed reads back as `stack: null`, not a 500', async () => {
    const repo = await insertRepo('malformed-stack');
    await pg.handle.db.update(t.repos).set({ stack: { not: 'a valid RepoStack' } }).where(eq(t.repos.id, repo.id));

    const record = await new RepoRepository(pg.handle.db).getById(workspaceId, repo.id);
    expect(record?.stack).toBeNull();

    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
    const res = await app.inject({ method: 'GET', url: '/repos' });
    expect(res.statusCode).toBe(200);
    const found = res.json().find((r: { id: string }) => r.id === repo.id);
    expect(found.stack).toBeNull();
  });

  it('backfillMissingStacks fills every cloned-but-unstacked repo and skips the rest', async () => {
    const repository = new RepoRepository(pg.handle.db);
    const cloned = await insertRepo('needs-backfill');
    await repository.updateClonePath(cloned.id, '/mock/clones/acme/needs-backfill');
    const neverCloned = await insertRepo('never-cloned'); // no clone_path — must stay untouched

    const git = new MockGitClient({ files: { 'package.json': '{"dependencies":{"fastify":"5.0.0"}}' } });
    const service = new RepoService({ repos: repository, git, jobs: noopJobs });
    await service.backfillMissingStacks();

    expect((await repository.getById(workspaceId, cloned.id))?.stack).toMatchObject({
      frameworks: [{ name: 'Fastify', path: '' }],
    });
    expect((await repository.getById(workspaceId, neverCloned.id))?.stack).toBeNull();
  });
});
