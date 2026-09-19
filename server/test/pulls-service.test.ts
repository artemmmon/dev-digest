import { describe, it, expect } from 'vitest';
import type { GitHubClient, PrDetail, PrMeta } from '@devdigest/shared';
import { MockGitHubClient } from '../src/adapters/mocks.js';
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

  async repoInWorkspace(workspaceId: string, repoId: string) {
    return workspaceId === 'ws' && repoId === REPO.id ? REPO : undefined;
  }
  async pullInWorkspace(workspaceId: string, prId: string) {
    const p = this.pulls.get(prId);
    return workspaceId === 'ws' && p ? { pull: p, repo: REPO } : undefined;
  }
  async listForRepo() {
    return [...this.pulls.values()];
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
