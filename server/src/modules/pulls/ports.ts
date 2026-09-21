import type { GitHubClient, PrDetail, PrMeta } from '@devdigest/shared';

/**
 * Ports of the pulls module (onion-architecture: core declares, outer ring
 * implements). The service sees these types only — no Drizzle rows, no Octokit.
 */

/** A persisted pull request, as the application needs it. */
export interface PullRecord {
  id: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  lastReviewedSha: string | null;
  additions: number;
  deletions: number;
  filesCount: number;
  /** GitHub merge state as stored (open/merged/closed). */
  status: string;
  body: string | null;
  openedAt: Date | null;
  updatedAt: Date | null;
}

/** The repo a pull request belongs to — enough to address it on GitHub. */
export interface PullRepoRef {
  id: string;
  owner: string;
  name: string;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  filesCount: number;
}

// ---- rollup inputs (consumed by the pure helpers in cost.ts / findings.ts) ----

export interface ReviewRow {
  prId: string;
  id: string;
  runId: string | null;
}

export interface RunRow {
  prId: string | null;
  id: string;
  batchId: string | null;
}

export interface BatchCostRow {
  prId: string | null;
  batchId: string | null;
  costUsd: number | null;
}

export interface FindingSeverityRow {
  reviewId: string;
  severity: string;
}

/** Inputs of the PR-list rollups (COST, SCORE, FINDINGS), newest first. */
export interface RoundInputs {
  runs: (RunRow & BatchCostRow)[];
  reviews: (ReviewRow & { score: number | null })[];
}

export interface PullStore {
  repoInWorkspace(workspaceId: string, repoId: string): Promise<PullRepoRef | undefined>;
  pullInWorkspace(
    workspaceId: string,
    prId: string,
  ): Promise<{ pull: PullRecord; repo: PullRepoRef } | undefined>;
  listForRepo(repoId: string): Promise<PullRecord[]>;
  upsertFromGitHub(workspaceId: string, repoId: string, pulls: PrMeta[]): Promise<number>;
  setDiffStats(prId: string, stats: DiffStats): Promise<void>;
  /** Replace files + commits and backfill body/stats in one transaction. */
  replaceDetail(prId: string, detail: PrDetail): Promise<void>;
  persistedDetail(prId: string): Promise<Pick<PrDetail, 'files' | 'commits'>>;
  markPolled(repoId: string): Promise<void>;
  roundInputs(prIds: string[]): Promise<RoundInputs>;
  findingSeverities(reviewIds: string[]): Promise<FindingSeverityRow[]>;
}

/** Lazy GitHub client: throws when no token is configured. */
export type GitHubFactory = () => Promise<GitHubClient>;

/** The one logging call the service makes (Fastify's logger satisfies it). */
export interface WarnLog {
  warn(obj: object, msg: string): void;
}
