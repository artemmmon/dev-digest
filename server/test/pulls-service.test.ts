import { describe, it, expect } from 'vitest';
import type { GitHubClient, PrDetail, PrMeta } from '@devdigest/shared';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { NotFoundError } from '../src/platform/errors.js';
import { PullsService } from '../src/modules/pulls/service.js';
import type {
  DiffStats,
  PullRecord,
  PullRepoRef,
  PullStore,
  RoundInputs,
} from '../src/modules/pulls/ports.js';

/**
 * PullsService against an in-memory PullStore (onion-architecture patterns §8):
 * no DB, no network — the rules of the PR list and detail in isolation.
 */

const REPO: PullRepoRef = { id: 'repo-1', owner: 'acme', name: 'widgets' };
/** Resolves to REPO in the fake store: lets a test tell the id the caller passed from REPO.id. */
const REPO_ALIAS = 'acme/widgets';

function pull(o: Partial<PullRecord>): PullRecord {
  return {
    id: 'pr-1',
    repoId: REPO.id,
    number: 1,
    title: 't',
    author: 'a',
    branch: 'b',
    base: 'main',
    headSha: 'sha',
    lastReviewedSha: null,
    additions: 0,
    deletions: 0,
    filesCount: 0,
    status: 'open',
    body: null,
    openedAt: null,
    updatedAt: null,
    ...o,
  };
}

class InMemoryPullStore implements PullStore {
  pulls = new Map<string, PullRecord>();
  replaced: string[] = [];
  polled: string[] = [];
  round: RoundInputs = { runs: [], reviews: [] };
  severities: { reviewId: string; severity: string }[] = [];
  findByNumberCalls: { repoId: string; number: number }[] = [];

  async repoInWorkspace(workspaceId: string, repoId: string) {
    return workspaceId === 'ws' && (repoId === REPO.id || repoId === REPO_ALIAS) ? REPO : undefined;
  }
  async pullInWorkspace(workspaceId: string, prId: string) {
    const p = this.pulls.get(prId);
    return workspaceId === 'ws' && p ? { pull: p, repo: REPO } : undefined;
  }
  async listForRepo() {
    return [...this.pulls.values()];
  }
  async findByNumber(repoId: string, number: number) {
    this.findByNumberCalls.push({ repoId, number });
    return [...this.pulls.values()].find((p) => p.repoId === repoId && p.number === number);
  }
  async upsertFromGitHub(_ws: string, _repo: string, list: PrMeta[]) {
    for (const pr of list) {
      this.pulls.set(`pr-${pr.number}`, pull({ id: `pr-${pr.number}`, number: pr.number, title: pr.title }));
    }
    return list.length;
  }
  async setDiffStats(prId: string, stats: DiffStats) {
    Object.assign(this.pulls.get(prId)!, stats);
  }
  async replaceDetail(prId: string) {
    this.replaced.push(prId);
  }
  async persistedDetail() {
    return { files: [{ path: 'persisted.ts', additions: 1, deletions: 0, patch: null }], commits: [] };
  }
  async markPolled(repoId: string) {
    this.polled.push(repoId);
  }
  async roundInputs() {
    return this.round;
  }
  async findingSeverities() {
    return this.severities;
  }
}

const silentLog = { warn: () => undefined };
const noGitHub = async (): Promise<GitHubClient> => {
  throw new Error('GITHUB_TOKEN is not configured');
};

describe('PullsService', () => {
  it('serves persisted PRs offline, with the latest round rolled up', async () => {
    const store = new InMemoryPullStore();
    store.pulls.set('pr-1', pull({ id: 'pr-1', additions: 5, deletions: 1, filesCount: 1 }));
    store.round = {
      runs: [{ prId: 'pr-1', id: 'run-1', batchId: 'b1', costUsd: 0.02 }],
      reviews: [{ prId: 'pr-1', id: 'rv-1', runId: 'run-1', score: 70 }],
    };
    store.severities = [{ reviewId: 'rv-1', severity: 'WARNING' }];
    const service = new PullsService({ pulls: store, github: noGitHub, log: silentLog });

    const [meta] = await service.listForRepo('ws', REPO.id);

    expect(meta).toMatchObject({ id: 'pr-1', cost_usd: 0.02, score: 70, status: 'needs_review' });
    expect(meta!.findings_by_severity).toMatchObject({ WARNING: 1 });
  });

  it('syncs from GitHub and backfills zeroed diff stats', async () => {
    const store = new InMemoryPullStore();
    const service = new PullsService({
      pulls: store,
      github: async () => new MockGitHubClient(),
      log: silentLog,
    });

    const list = await service.listForRepo('ws', REPO.id);

    expect(list).toHaveLength(1);
    // MockGitHubClient's detail reports non-zero stats; the list row is backfilled
    expect(list[0]!.additions).toBeGreaterThan(0);
  });

  it('404s a repo or PR outside the workspace', async () => {
    const service = new PullsService({
      pulls: new InMemoryPullStore(),
      github: noGitHub,
      log: silentLog,
    });
    await expect(service.listForRepo('other-ws', REPO.id)).rejects.toThrow('Repo not found');
    await expect(service.detail('ws', 'missing')).rejects.toThrow('Pull request not found');
  });

  describe('byNumber', () => {
    it('returns the PR with its latest-round rollups, without touching GitHub', async () => {
      const store = new InMemoryPullStore();
      store.pulls.set('pr-7', pull({ id: 'pr-7', number: 7, title: 'Seven', additions: 3, filesCount: 1 }));
      store.round = {
        runs: [{ prId: 'pr-7', id: 'run-7', batchId: 'b7', costUsd: 0.05 }],
        reviews: [{ prId: 'pr-7', id: 'rv-7', runId: 'run-7', score: 80 }],
      };
      store.severities = [{ reviewId: 'rv-7', severity: 'CRITICAL' }];
      const service = new PullsService({ pulls: store, github: noGitHub, log: silentLog });

      const meta = await service.byNumber('ws', REPO.id, 7);

      expect(meta).toMatchObject({ id: 'pr-7', number: 7, title: 'Seven', cost_usd: 0.05, score: 80 });
      expect(meta.findings_by_severity).toMatchObject({ CRITICAL: 1 });
      expect(store.polled).toEqual([]);
      expect(store.replaced).toEqual([]);
    });

    it('404s an unknown PR number', async () => {
      const store = new InMemoryPullStore();
      store.pulls.set('pr-1', pull({ id: 'pr-1', number: 1 }));
      const service = new PullsService({ pulls: store, github: noGitHub, log: silentLog });

      const err = await service.byNumber('ws', REPO.id, 99).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundError);
      expect((err as Error).message).toBe('Pull request not found');
    });

    it('404s a repo outside the workspace before reading any PR', async () => {
      const store = new InMemoryPullStore();
      store.pulls.set('pr-1', pull({ id: 'pr-1', number: 1 }));
      const service = new PullsService({ pulls: store, github: noGitHub, log: silentLog });

      await expect(service.byNumber('other-ws', REPO.id, 1)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.byNumber('ws', 'repo-unknown', 1)).rejects.toBeInstanceOf(NotFoundError);
      expect(store.findByNumberCalls).toEqual([]);
    });

    it("asks the store for the resolved repo's id, and never returns another repo's PR", async () => {
      const store = new InMemoryPullStore();
      store.pulls.set('pr-other', pull({ id: 'pr-other', repoId: 'repo-2', number: 5, title: 'Other repo' }));
      const service = new PullsService({ pulls: store, github: noGitHub, log: silentLog });

      // The caller addressed the repo by an alias; the store must still get REPO.id.
      await expect(service.byNumber('ws', REPO_ALIAS, 5)).rejects.toBeInstanceOf(NotFoundError);
      expect(store.findByNumberCalls).toEqual([{ repoId: REPO.id, number: 5 }]);

      store.pulls.set('pr-mine', pull({ id: 'pr-mine', number: 5, title: 'My repo' }));
      const meta = await service.byNumber('ws', REPO_ALIAS, 5);
      expect(meta).toMatchObject({ id: 'pr-mine', title: 'My repo' });
    });
  });

  it('falls back to the persisted detail when GitHub is unavailable', async () => {
    const store = new InMemoryPullStore();
    store.pulls.set('pr-1', pull({ id: 'pr-1' }));
    const service = new PullsService({ pulls: store, github: noGitHub, log: silentLog });

    const detail: PrDetail = await service.detail('ws', 'pr-1');

    expect(detail.files.map((f) => f.path)).toEqual(['persisted.ts']);
    expect(store.replaced).toEqual([]);
  });

  it('replaces the stored detail when GitHub answers', async () => {
    const store = new InMemoryPullStore();
    store.pulls.set('pr-1', pull({ id: 'pr-1' }));
    const service = new PullsService({
      pulls: store,
      github: async () => new MockGitHubClient(),
      log: silentLog,
    });

    const detail = await service.detail('ws', 'pr-1');

    expect(detail.id).toBe('pr-1');
    expect(store.replaced).toEqual(['pr-1']);
  });

  it('asks for a token before posting a comment', async () => {
    const store = new InMemoryPullStore();
    store.pulls.set('pr-1', pull({ id: 'pr-1' }));
    const service = new PullsService({ pulls: store, github: noGitHub, log: silentLog });

    await expect(
      service.createComment('ws', 'pr-1', { path: 'a.ts', line: 1, body: 'x' }),
    ).rejects.toMatchObject({ code: 'github_unavailable' });
  });

  it('poll syncs the list and stamps the repo', async () => {
    const store = new InMemoryPullStore();
    const service = new PullsService({
      pulls: store,
      github: async () => new MockGitHubClient(),
      log: silentLog,
    });

    expect(await service.poll('ws', REPO.id)).toEqual({ synced: 1 });
    expect(store.polled).toEqual([REPO.id]);
  });
});
