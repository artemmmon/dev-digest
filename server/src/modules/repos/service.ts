import { type Repo, type RepoRef } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { parseRepoUrl, githubCloneUrl, toRepoDto } from './helpers.js';
import {
  CLONE_JOB_KIND,
  INDEX_JOB_KIND,
  REFRESH_JOB_KIND,
  repoJobKey,
} from '../_shared/ports.js';
import { CLONE_DEPTH } from './constants.js';
import { detectStack, findManifestPaths } from './stack.js';
import type { RepoServiceDeps } from './ports.js';

/**
 * F1 — repos service. Business logic for the Repositories feature:
 *   - add / list / refresh / remove
 *   - the asynchronous `clone` job (real `git clone` via the GitClient adapter)
 *
 * No HTTP and no raw SQL live here — persistence goes through RepoRepository,
 * pure transforms through helpers.ts, literals through constants.ts.
 */

/** Payload enqueued for (and consumed by) the `clone` job. */
export interface CloneJobPayload {
  repoId: string;
  owner: string;
  name: string;
  url: string;
}

export class RepoService {
  constructor(private deps: RepoServiceDeps) {}

  /**
   * Register the `clone` job handler once. Authenticates the clone with the
   * stored GitHub PAT (so private repos work), clones via the GitClient adapter,
   * then persists the resulting path + last_polled_at.
   */
  registerCloneJobHandler(): void {
    this.deps.jobs.register(
      CLONE_JOB_KIND,
      async (payload, { signal }) => {
        await this.runCloneJob(payload as CloneJobPayload, signal);
      },
      // one git operation per clone directory at a time (clone vs refresh vs index)
      { serializeBy: repoJobKey },
    );
  }

  async runCloneJob(payload: CloneJobPayload, signal?: AbortSignal): Promise<void> {
    const { repoId, owner, name } = payload;
    // Rebuild from owner/name instead of trusting `payload.url`: jobs queued
    // before the URL check existed may still carry a raw user URL. The git
    // adapter adds the GitHub token itself (per command, never stored).
    const url = githubCloneUrl(owner, name);
    const { path } = await this.deps.git.clone({ owner, name }, url, {
      depth: CLONE_DEPTH,
      signal,
    });
    await this.deps.repos.updateClonePath(repoId, path);

    // Best-effort tech-stack detection — never fails the clone it rides on. Covers
    // both Add (fresh clone) and Refresh (re-clone of an existing directory).
    await this.detectAndStoreStack(repoId, { owner, name });

    // T2.2 — kick off the indexer in the background. ENQUEUE (not call) so the
    // clone job closes immediately and the (heavier) index runs as its own
    // job under JobRunner's timeout/retry. If the handler isn't registered
    // (e.g. repo-intel disabled at module wiring), enqueue() throws — log and
    // continue so the clone result is preserved either way.
    const workspaceId = await this.deps.repos.workspaceIdFor(repoId);
    if (workspaceId) {
      try {
        await this.deps.jobs.enqueue(workspaceId, INDEX_JOB_KIND, {
          repoId,
          owner,
          name,
        });
      } catch {
        // No handler registered or transient enqueue failure — clone has
        // already succeeded, so we don't fail the job for an index-followup
        // miss. The user can hit POST /repos/:id/resync to retry.
      }
    }
  }

  /**
   * Detect the repo's framework/languages/packages from its tracked files and
   * manifests, and store the result. Best-effort: a git error, a malformed
   * manifest or anything else here is swallowed — the stack label is metadata,
   * never something a clone, refresh or backfill pass should fail over.
   */
  async detectAndStoreStack(repoId: string, ref: RepoRef): Promise<void> {
    try {
      const files = await this.deps.git.listFiles(ref);
      const manifestPaths = findManifestPaths(files);
      const manifests = new Map<string, string>();
      for (const path of manifestPaths) {
        manifests.set(path, await this.deps.git.readFile(ref, path));
      }
      const detected = detectStack(files, manifests);
      await this.deps.repos.updateStack(repoId, {
        ...detected,
        detected_at: new Date().toISOString(),
      });
    } catch {
      // Detection failed (git error, unreadable clone, …) — leave `stack` as it was;
      // the next Refresh or the boot backfill will try again.
    }
  }

  /**
   * One-time catch-up for repos cloned before stack detection existed: everyone
   * with a clone but no stack. Called fire-and-forget at boot (`routes.ts`), never
   * awaited by a request — a slow git read here must not delay every other repo.
   */
  async backfillMissingStacks(): Promise<void> {
    const repos = await this.deps.repos.listUnstacked();
    for (const repo of repos) {
      await this.detectAndStoreStack(repo.id, { owner: repo.owner, name: repo.name });
    }
  }

  /**
   * Add a repo: parse the URL, dedupe within the workspace, persist, and enqueue
   * the real clone (non-blocking). `created` is false when the repo already
   * existed (the caller returns 200 instead of 201).
   */
  async add(
    workspaceId: string,
    userId: string,
    url: string,
  ): Promise<{ repo: Repo; created: boolean }> {
    const { owner, name } = parseRepoUrl(url);
    const fullName = `${owner}/${name}`;

    const existing = await this.deps.repos.findByFullName(workspaceId, fullName);
    if (existing) return { repo: toRepoDto(existing), created: false };

    const row = await this.deps.repos.insert({ workspaceId, owner, name, fullName, createdBy: userId });
    await this.deps.jobs.enqueue(workspaceId, CLONE_JOB_KIND, {
      repoId: row.id,
      owner,
      name,
      url: githubCloneUrl(owner, name),
    } satisfies CloneJobPayload);

    return { repo: toRepoDto(row), created: true };
  }

  async list(workspaceId: string): Promise<Repo[]> {
    const rows = await this.deps.repos.list(workspaceId);
    return rows.map(toRepoDto);
  }

  /** Re-fetch the clone for an existing repo (enqueues a fresh `clone` job). */
  async refresh(workspaceId: string, id: string): Promise<{ status: 'refreshing' }> {
    const repo = await this.deps.repos.getById(workspaceId, id);
    if (!repo) throw new NotFoundError('Repo not found');
    await this.deps.jobs.enqueue(workspaceId, CLONE_JOB_KIND, {
      repoId: repo.id,
      owner: repo.owner,
      name: repo.name,
      url: githubCloneUrl(repo.owner, repo.name),
    } satisfies CloneJobPayload);
    // T2.2 — also enqueue an incremental refresh. The two queue positions are
    // independent (p-queue doesn't FIFO across kinds), but `runIncremental` is
    // a no-op when `currentHead === lastIndexedSha`, so ordering is safe: if
    // refresh fires before the new clone settles, it cheaply exits; if after,
    // it picks up the new HEAD.
    try {
      await this.deps.jobs.enqueue(workspaceId, REFRESH_JOB_KIND, {
        repoId: repo.id,
        owner: repo.owner,
        name: repo.name,
      });
    } catch {
      // No handler / transient enqueue failure — refresh button is best-effort.
    }
    return { status: 'refreshing' };
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const ok = await this.deps.repos.remove(workspaceId, id);
    if (!ok) throw new NotFoundError('Repo not found');
  }
}
