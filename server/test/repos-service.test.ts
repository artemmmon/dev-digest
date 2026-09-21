import { describe, it, expect } from 'vitest';
import { MockGitClient } from '../src/adapters/mocks.js';
import { RepoService } from '../src/modules/repos/service.js';
import type { NewRepo, RepoRecord, RepoStore } from '../src/modules/repos/ports.js';
import type { JobHandler, JobQueue } from '../src/modules/_shared/ports.js';

/** RepoService against in-memory fakes (onion-architecture patterns §8): no DB, no git, no queue. */

class InMemoryRepoStore implements RepoStore {
  rows = new Map<string, RepoRecord>();
  private seq = 0;

  async findByFullName(ws: string, fullName: string) {
    return [...this.rows.values()].find((r) => r.workspaceId === ws && r.fullName === fullName);
  }
  async list(ws: string) {
    return [...this.rows.values()].filter((r) => r.workspaceId === ws);
  }
  async getById(ws: string, id: string) {
    const r = this.rows.get(id);
    return r && r.workspaceId === ws ? r : undefined;
  }
  async insert(v: NewRepo) {
    const row: RepoRecord = {
      id: `repo-${++this.seq}`,
      ...v,
      defaultBranch: 'main',
      clonePath: null,
      lastPolledAt: null,
    };
    this.rows.set(row.id, row);
    return row;
  }
  async workspaceIdFor(id: string) {
    return this.rows.get(id)?.workspaceId ?? null;
  }
  async updateClonePath(id: string, path: string) {
    const r = this.rows.get(id);
    if (r) Object.assign(r, { clonePath: path, lastPolledAt: new Date() });
  }
  async remove(ws: string, id: string) {
    const r = this.rows.get(id);
    return r && r.workspaceId === ws ? this.rows.delete(id) : false;
  }
}

class FakeJobs implements JobQueue {
  enqueued: { kind: string; payload: unknown }[] = [];
  handlers = new Map<string, JobHandler>();
  failKinds = new Set<string>();
  async enqueue(_ws: string, kind: string, payload: unknown) {
    if (this.failKinds.has(kind)) throw new Error(`no handler for ${kind}`);
    this.enqueued.push({ kind, payload });
    return { id: `job-${this.enqueued.length}` };
  }
  register(kind: string, handler: JobHandler) {
    this.handlers.set(kind, handler);
  }
}

function setup() {
  const repos = new InMemoryRepoStore();
  const git = new MockGitClient();
  const jobs = new FakeJobs();
  return { repos, git, jobs, service: new RepoService({ repos, git, jobs }) };
}

describe('RepoService', () => {
  it('add persists the repo and enqueues a clone of the canonical URL', async () => {
    const { service, jobs } = setup();

    const { repo, created } = await service.add('ws', 'u1', 'https://github.com/acme/widgets');

    expect(created).toBe(true);
    expect(repo).toMatchObject({ owner: 'acme', name: 'widgets', full_name: 'acme/widgets' });
    expect(jobs.enqueued).toEqual([
      {
        kind: 'clone',
        payload: {
          repoId: repo.id,
          owner: 'acme',
          name: 'widgets',
          url: 'https://github.com/acme/widgets.git',
        },
      },
    ]);
  });

  it('add is idempotent per workspace', async () => {
    const { service, jobs } = setup();
    const first = await service.add('ws', 'u1', 'https://github.com/acme/widgets');
    const again = await service.add('ws', 'u1', 'git@github.com:acme/widgets.git');

    expect(again.created).toBe(false);
    expect(again.repo.id).toBe(first.repo.id);
    expect(jobs.enqueued).toHaveLength(1);
    // the same repo in another workspace is a different row
    expect((await service.add('other', 'u2', 'https://github.com/acme/widgets')).created).toBe(true);
  });

  it('rejects a URL that is not a plain GitHub repo before touching the store', async () => {
    const { service, repos } = setup();
    await expect(service.add('ws', 'u1', 'https://github.com/../x')).rejects.toMatchObject({
      code: 'invalid_repo_url',
    });
    expect(repos.rows.size).toBe(0);
  });

  it('the clone job clones with the canonical URL, stores the path and queues the index', async () => {
    const { service, repos, git, jobs } = setup();
    const { repo } = await service.add('ws', 'u1', 'https://github.com/acme/widgets');

    // a stale payload URL is ignored: the job rebuilds it from owner/name
    await service.runCloneJob({
      repoId: repo.id,
      owner: 'acme',
      name: 'widgets',
      url: 'https://evil.example/x',
    });

    expect(git.cloned[0]!.url).toBe('https://github.com/acme/widgets.git');
    expect(repos.rows.get(repo.id)!.clonePath).toBe('/mock/clones/acme/widgets');
    expect(jobs.enqueued.at(-1)).toMatchObject({ kind: 'repo-intel-index' });
  });

  it('a failed index follow-up does not fail the clone job', async () => {
    const { service, jobs } = setup();
    const { repo } = await service.add('ws', 'u1', 'https://github.com/acme/widgets');
    jobs.failKinds.add('repo-intel-index');

    await expect(
      service.runCloneJob({ repoId: repo.id, owner: 'acme', name: 'widgets', url: '' }),
    ).resolves.toBeUndefined();
  });

  it('refresh 404s an unknown repo and re-enqueues clone + refresh for a known one', async () => {
    const { service, jobs } = setup();
    await expect(service.refresh('ws', 'nope')).rejects.toThrow('Repo not found');

    const { repo } = await service.add('ws', 'u1', 'https://github.com/acme/widgets');
    jobs.enqueued.length = 0;
    expect(await service.refresh('ws', repo.id)).toEqual({ status: 'refreshing' });
    expect(jobs.enqueued.map((j) => j.kind)).toEqual(['clone', 'repo-intel-refresh']);
  });

  it('remove is workspace-scoped', async () => {
    const { service } = setup();
    const { repo } = await service.add('ws', 'u1', 'https://github.com/acme/widgets');
    await expect(service.remove('other', repo.id)).rejects.toThrow('Repo not found');
    await expect(service.remove('ws', repo.id)).resolves.toBeUndefined();
    expect(await service.list('ws')).toEqual([]);
  });

  it('registers the clone handler serialised per repo', () => {
    const { service, jobs } = setup();
    service.registerCloneJobHandler();
    expect(jobs.handlers.has('clone')).toBe(true);
  });
});
