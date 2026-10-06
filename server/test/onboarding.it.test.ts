/**
 * SPEC-11 onboarding storage against real Postgres (Testcontainers, pattern: `blast.it.test.ts`).
 * The point of this file is the claim: `OnboardingRepository.claim` is one
 * `INSERT … ON CONFLICT DO UPDATE … WHERE status <> 'running' RETURNING`, so two simultaneous
 * generation requests must never both win (AC-14, EC-1, AC-16, NFR-1). Gated on Docker.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { CompletionResult, LLMProvider, StructuredRequest, StructuredResult, Tour } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import { OnboardingRepository } from '../src/modules/onboarding/repository.js';
import { OnboardingService } from '../src/modules/onboarding/service.js';
import type { TourDraft } from '../src/modules/onboarding/domain.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[onboarding] Docker not available — skipping integration tests.');
}

const tourFor = (repoId: string, over: Partial<Tour> = {}): Tour => ({
  repo_id: repoId,
  generated_at: '2026-10-05T10:00:00.000Z',
  commit_sha: 'abc1234',
  files_indexed: 3,
  limited_index: false,
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  tokens_in: 10,
  tokens_out: 5,
  cost_usd: 0.001,
  dropped_items: 0,
  sections: [
    { kind: 'architecture_overview', body: 'Overview', diagram: null },
    { kind: 'critical_paths', files: [{ path: 'src/a.ts', note: 'entry' }] },
    { kind: 'how_to_run', steps: [{ command: 'pnpm dev', source: 'package.json' }] },
    { kind: 'guided_reading', reading: [{ path: 'README.md', why: 'start' }] },
    { kind: 'first_tasks', tasks: [{ title: 'Add a test', scope: 'src/a.ts', complexity: 'low' }] },
  ],
  ...over,
});

d('onboarding storage (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let store: OnboardingRepository;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    store = new OnboardingRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });
  afterEach(async () => {
    // every test starts with no generation or tour rows, so `reapRunning` counts are exact
    await pg.handle.db.delete(t.onboardingGenerations);
    await pg.handle.db.delete(t.onboarding);
  });

  async function newRepo() {
    const name = `onboarding-repo-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, defaultBranch: 'main' })
      .returning();
    return repo!;
  }

  const generationRow = async (repoId: string) =>
    (await pg.handle.db.select().from(t.onboardingGenerations).where(eq(t.onboardingGenerations.repoId, repoId)))[0];
  const tourRows = async (repoId: string) =>
    pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));

  describe('claim', () => {
    it('AC-14: the first claim of a repository returns its start time and marks it running', async () => {
      const repo = await newRepo();
      const now = new Date('2026-10-05T10:00:00.000Z');

      const startedAt = await store.claim(repo.id, now);

      expect(startedAt?.getTime()).toBe(now.getTime());
      expect(await store.getGeneration(repo.id)).toMatchObject({ status: 'running', error: null });
    });

    it('AC-14: a claim while one is running gets nothing and leaves the running one untouched', async () => {
      const repo = await newRepo();
      const first = new Date('2026-10-05T10:00:00.000Z');
      await store.claim(repo.id, first);

      const second = await store.claim(repo.id, new Date('2026-10-05T10:00:05.000Z'));

      expect(second).toBeNull();
      const row = await generationRow(repo.id);
      expect(row?.status).toBe('running');
      expect(row?.startedAt.getTime()).toBe(first.getTime());
    });

    it('AC-14, EC-1, NFR-1: concurrent first claims for one repository — exactly one gets a start time', async () => {
      // 5 rounds on fresh repos: the race is between inserts of a row that does not exist yet
      for (let round = 0; round < 5; round++) {
        const repo = await newRepo();
        const results = await Promise.all(
          Array.from({ length: 10 }, (_, i) => store.claim(repo.id, new Date(Date.UTC(2026, 9, 5, 10, 0, 0, i)))),
        );
        const winners = results.filter((r): r is Date => r !== null);
        expect(winners, `round ${round}`).toHaveLength(1);
        // the winner's time is the one stored
        expect((await generationRow(repo.id))?.startedAt.getTime()).toBe(winners[0]!.getTime());
      }
    });

    it('AC-14, EC-1: concurrent claims over an existing idle/failed row — exactly one gets a start time', async () => {
      for (const ended of ['complete', 'fail'] as const) {
        const repo = await newRepo();
        const t0 = new Date('2026-10-05T09:00:00.000Z');
        await store.claim(repo.id, t0);
        if (ended === 'complete') await store.complete(repo.id, t0, tourFor(repo.id));
        else await store.fail(repo.id, t0, 'boom');

        const results = await Promise.all(
          Array.from({ length: 10 }, (_, i) => store.claim(repo.id, new Date(Date.UTC(2026, 9, 5, 10, 0, 0, i)))),
        );
        const winners = results.filter((r): r is Date => r !== null);
        expect(winners, `after ${ended}`).toHaveLength(1);
        expect((await generationRow(repo.id))?.status).toBe('running');
        expect((await generationRow(repo.id))?.startedAt.getTime()).toBe(winners[0]!.getTime());
      }
    });

    it('AC-14: claims of different repositories do not block each other', async () => {
      const a = await newRepo();
      const b = await newRepo();
      const [ra, rb] = await Promise.all([store.claim(a.id, new Date()), store.claim(b.id, new Date())]);
      expect(ra).not.toBeNull();
      expect(rb).not.toBeNull();
    });

    it('a claim after `complete` succeeds (Regenerate)', async () => {
      const repo = await newRepo();
      const t0 = new Date('2026-10-05T10:00:00.000Z');
      await store.claim(repo.id, t0);
      await store.complete(repo.id, t0, tourFor(repo.id));

      const t1 = new Date('2026-10-05T11:00:00.000Z');
      expect((await store.claim(repo.id, t1))?.getTime()).toBe(t1.getTime());
      expect(await store.getGeneration(repo.id)).toMatchObject({ status: 'running', error: null });
    });

    it('a claim after `fail` succeeds (Retry) and clears the previous error', async () => {
      const repo = await newRepo();
      const t0 = new Date('2026-10-05T10:00:00.000Z');
      await store.claim(repo.id, t0);
      await store.fail(repo.id, t0, 'Generation timed out');
      expect((await store.getGeneration(repo.id))?.error).toBe('Generation timed out');

      const t1 = new Date('2026-10-05T11:00:00.000Z');
      expect((await store.claim(repo.id, t1))?.getTime()).toBe(t1.getTime());
      expect(await store.getGeneration(repo.id)).toMatchObject({ status: 'running', error: null });
    });
  });

  describe('complete', () => {
    it('AC-9, AC-18, AC-46: stores the tour, sets idle, and a later completion replaces it (one tour per repository)', async () => {
      const repo = await newRepo();
      const t0 = new Date('2026-10-05T10:00:00.000Z');
      await store.claim(repo.id, t0);
      expect(await store.complete(repo.id, t0, tourFor(repo.id, { commit_sha: 'first' }))).toBe(true);
      expect(await store.getGeneration(repo.id)).toMatchObject({ status: 'idle', error: null });
      expect((await store.getTour(repo.id))?.commit_sha).toBe('first');

      const t1 = new Date('2026-10-05T11:00:00.000Z');
      await store.claim(repo.id, t1);
      expect(await store.complete(repo.id, t1, tourFor(repo.id, { commit_sha: 'second' }))).toBe(true);

      expect(await tourRows(repo.id)).toHaveLength(1);
      expect((await store.getTour(repo.id))?.commit_sha).toBe('second');
    });

    it('a superseded run (older started_at) stores nothing and returns false', async () => {
      const repo = await newRepo();
      const t0 = new Date('2026-10-05T10:00:00.000Z');
      const t1 = new Date('2026-10-05T10:05:00.000Z');
      await store.claim(repo.id, t0);
      await store.fail(repo.id, t0, 'Generation timed out'); // run 0 timed out…
      await store.claim(repo.id, t1); // …and the user started run 1

      const stored = await store.complete(repo.id, t0, tourFor(repo.id, { commit_sha: 'late' })); // run 0 finishes late

      expect(stored).toBe(false);
      expect(await tourRows(repo.id)).toHaveLength(0);
      const row = await generationRow(repo.id);
      expect(row?.status).toBe('running');
      expect(row?.startedAt.getTime()).toBe(t1.getTime());
    });

    it('a run that was already ended (failed / reaped) stores nothing even with its own start time', async () => {
      const repo = await newRepo();
      const t0 = new Date('2026-10-05T10:00:00.000Z');
      await store.claim(repo.id, t0);
      await store.reapRunning('Generation was interrupted by a server restart. Try again.');

      expect(await store.complete(repo.id, t0, tourFor(repo.id))).toBe(false);
      expect(await tourRows(repo.id)).toHaveLength(0);
      expect((await generationRow(repo.id))?.status).toBe('failed');
    });

    it('AC-39, EC-18: a repository removed during the run — nothing is stored', async () => {
      const repo = await newRepo();
      const t0 = new Date('2026-10-05T10:00:00.000Z');
      await store.claim(repo.id, t0);
      await pg.handle.db.delete(t.repos).where(eq(t.repos.id, repo.id));

      expect(await store.complete(repo.id, t0, tourFor(repo.id))).toBe(false);
      expect(await tourRows(repo.id)).toHaveLength(0);
      expect(await generationRow(repo.id)).toBeUndefined();
    });

    it('with no claim at all, nothing is stored', async () => {
      const repo = await newRepo();
      expect(await store.complete(repo.id, new Date(), tourFor(repo.id))).toBe(false);
      expect(await tourRows(repo.id)).toHaveLength(0);
    });
  });

  describe('fail', () => {
    it('AC-34: marks the matching running generation failed with the message', async () => {
      const repo = await newRepo();
      const t0 = new Date('2026-10-05T10:00:00.000Z');
      await store.claim(repo.id, t0);

      await store.fail(repo.id, t0, 'The model could not produce a valid tour. Try again.');

      expect(await store.getGeneration(repo.id)).toMatchObject({
        status: 'failed',
        error: 'The model could not produce a valid tour. Try again.',
      });
    });

    it('AC-36: a failure never touches the stored tour', async () => {
      const repo = await newRepo();
      const t0 = new Date('2026-10-05T10:00:00.000Z');
      await store.claim(repo.id, t0);
      await store.complete(repo.id, t0, tourFor(repo.id, { commit_sha: 'keep-me' }));

      const t1 = new Date('2026-10-05T11:00:00.000Z');
      await store.claim(repo.id, t1);
      await store.fail(repo.id, t1, 'boom');

      expect((await store.getTour(repo.id))?.commit_sha).toBe('keep-me');
      expect((await store.getGeneration(repo.id))?.status).toBe('failed');
    });

    it('a superseded run (older started_at) cannot fail the newer running generation', async () => {
      const repo = await newRepo();
      const t0 = new Date('2026-10-05T10:00:00.000Z');
      const t1 = new Date('2026-10-05T10:05:00.000Z');
      await store.claim(repo.id, t0);
      await store.fail(repo.id, t0, 'Generation timed out');
      await store.claim(repo.id, t1);

      await store.fail(repo.id, t0, 'late failure of the old run');

      const row = await generationRow(repo.id);
      expect(row?.status).toBe('running');
      expect(row?.error).toBeNull();
    });

    it('does not turn an idle (completed) generation into a failed one', async () => {
      const repo = await newRepo();
      const t0 = new Date('2026-10-05T10:00:00.000Z');
      await store.claim(repo.id, t0);
      await store.complete(repo.id, t0, tourFor(repo.id));

      await store.fail(repo.id, t0, 'late');

      expect((await store.getGeneration(repo.id))?.status).toBe('idle');
    });
  });

  describe('reapRunning', () => {
    it('OQ-1: fails every running generation with the message, leaves idle and failed ones alone, returns the count', async () => {
      const running1 = await newRepo();
      const running2 = await newRepo();
      const idle = await newRepo();
      const failed = await newRepo();
      const t0 = new Date('2026-10-05T10:00:00.000Z');
      await store.claim(running1.id, t0);
      await store.claim(running2.id, t0);
      await store.claim(idle.id, t0);
      await store.complete(idle.id, t0, tourFor(idle.id));
      await store.claim(failed.id, t0);
      await store.fail(failed.id, t0, 'original error');

      const reaped = await store.reapRunning('interrupted');

      expect(reaped).toBe(2);
      expect(await store.getGeneration(running1.id)).toMatchObject({ status: 'failed', error: 'interrupted' });
      expect(await store.getGeneration(running2.id)).toMatchObject({ status: 'failed', error: 'interrupted' });
      expect(await store.getGeneration(idle.id)).toMatchObject({ status: 'idle', error: null });
      expect(await store.getGeneration(failed.id)).toMatchObject({ status: 'failed', error: 'original error' });
    });

    it('returns 0 when nothing is running', async () => {
      expect(await store.reapRunning('interrupted')).toBe(0);
    });

    it('after a reap the repository can be claimed again', async () => {
      const repo = await newRepo();
      await store.claim(repo.id, new Date('2026-10-05T10:00:00.000Z'));
      await store.reapRunning('interrupted');
      expect(await store.claim(repo.id, new Date('2026-10-05T10:10:00.000Z'))).not.toBeNull();
    });
  });

  describe('getTour', () => {
    it('is null when nothing is stored, and null when the stored JSON no longer parses', async () => {
      const repo = await newRepo();
      expect(await store.getTour(repo.id)).toBeNull();

      await pg.handle.db.insert(t.onboarding).values({ repoId: repo.id, json: { old: 'scaffold shape' } });
      expect(await store.getTour(repo.id)).toBeNull();
    });
  });

  describe('OnboardingService over the real repository', () => {
    class GatedLLM implements LLMProvider {
      readonly id = 'openrouter' as const;
      requests = 0;
      private release!: () => void;
      private gate = new Promise<void>((resolve) => (this.release = resolve));
      open() {
        this.release();
      }
      async listModels() {
        return [];
      }
      async complete(): Promise<CompletionResult> {
        throw new Error('unused');
      }
      async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
        this.requests += 1;
        await this.gate;
        const draft: TourDraft = {
          architecture_overview: { body: 'b', diagram: null },
          critical_paths: { files: [{ path: 'src/a.ts', note: 'n' }] },
          how_to_run: { steps: [] },
          guided_reading: { reading: [] },
          first_tasks: { tasks: [] },
        };
        return { data: draft as T, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: 0, raw: '{}', attempts: 1 };
      }
      async embed() {
        return [];
      }
    }

    it('AC-14, AC-16, EC-1, NFR-1: simultaneous start calls — one is accepted, the rest get generation_in_progress, the model is asked once, one tour is stored', async () => {
      const repo = await newRepo();
      const llm = new GatedLLM();
      const service = new OnboardingService({
        store,
        repos: {
          getById: async (_ws, id) =>
            id === repo.id
              ? { id: repo.id, owner: repo.owner, name: repo.name, fullName: repo.fullName, clonePath: '/clones/x' }
              : undefined,
        },
        git: new MockGitClient({ head: 'sha-1', files: { 'src/a.ts': 'export {};' } }),
        intel: {
          topFiles: async () => ['src/a.ts'],
          criticalPaths: async () => [],
          repoMap: async () => '',
          indexState: async () => ({ filesIndexed: 1, lastIndexedSha: 'sha-1' }),
        },
        resolveModel: async () => ({ provider: 'openrouter', model: 'm' }),
        llm: async () => llm,
        systemPrompt: async () => 'SYSTEM',
        tokenizer: { count: (s) => Math.ceil(s.length / 4) },
      });

      const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.start(workspaceId, repo.id)));

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of results.filter((x): x is PromiseRejectedResult => x.status === 'rejected')) {
        expect(r.reason).toMatchObject({ code: 'generation_in_progress', statusCode: 409 });
      }

      llm.open();
      await expect
        .poll(async () => (await store.getGeneration(repo.id))?.status, { timeout: 10_000 })
        .toBe('idle');
      expect(llm.requests).toBe(1);
      expect(await tourRows(repo.id)).toHaveLength(1);
      expect((await store.getTour(repo.id))?.commit_sha).toBe('sha-1');
    });
  });
});
