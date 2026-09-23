import type { GitClient, RepoStack } from '@devdigest/shared';
import type { JobQueue } from '../_shared/ports.js';

/** Ports of the repos module (onion-architecture: core declares, outer ring implements). */

/** A persisted repo, as the application needs it (no Drizzle row type). */
export interface RepoRecord {
  id: string;
  workspaceId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  clonePath: string | null;
  lastPolledAt: Date | null;
  createdBy: string | null;
  /** `null` until stack detection has run once (`modules/repos/stack.ts`). */
  stack: RepoStack | null;
}

export interface NewRepo {
  workspaceId: string;
  owner: string;
  name: string;
  fullName: string;
  createdBy: string;
}

/** Every method is scoped by workspace, except the two the clone job calls with a trusted id. */
export interface RepoStore {
  findByFullName(workspaceId: string, fullName: string): Promise<RepoRecord | undefined>;
  list(workspaceId: string): Promise<RepoRecord[]>;
  getById(workspaceId: string, id: string): Promise<RepoRecord | undefined>;
  insert(values: NewRepo): Promise<RepoRecord>;
  /** Owning workspace of a repo; null if it was deleted before a follow-up job ran. */
  workspaceIdFor(repoId: string): Promise<string | null>;
  /** Persist the clone path and bump `last_polled_at` once a clone job completes. */
  updateClonePath(repoId: string, clonePath: string): Promise<void>;
  /**
   * Persist stack-detection results. Always a real `RepoStack` — even "nothing
   * recognised" is stored as empty arrays (never `null`), so detection never retries
   * every boot for a repo that's just a docs bundle.
   */
  updateStack(repoId: string, stack: RepoStack): Promise<void>;
  /** Cloned repos with no stack yet, across every workspace — trusted, boot-time backfill only. */
  listUnstacked(): Promise<RepoRecord[]>;
  remove(workspaceId: string, id: string): Promise<boolean>;
}

export interface RepoServiceDeps {
  repos: RepoStore;
  git: GitClient;
  jobs: JobQueue;
}
