import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { PrDetail, PrMeta } from '@devdigest/shared';
import type { DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  DiffStats,
  PullRecord,
  PullRepoRef,
  PullStore,
  RoundInputs,
  FindingSeverityRow,
} from './ports.js';

/** Rows per INSERT; one statement per chunk instead of one per PR. */
const UPSERT_CHUNK_SIZE = 500;

type PullRow = typeof t.pullRequests.$inferSelect;

function toPullRecord(r: PullRow): PullRecord {
  return {
    id: r.id,
    repoId: r.repoId,
    number: r.number,
    title: r.title,
    author: r.author,
    branch: r.branch,
    base: r.base,
    headSha: r.headSha,
    lastReviewedSha: r.lastReviewedSha,
    additions: r.additions,
    deletions: r.deletions,
    filesCount: r.filesCount,
    status: r.status,
    body: r.body,
    openedAt: r.openedAt,
    updatedAt: r.updatedAt,
  };
}

/** Drizzle implementation of the pulls module's PullStore port. */
export class PullsRepository implements PullStore {
  constructor(private db: DbOrTx) {}

  async repoInWorkspace(workspaceId: string, repoId: string): Promise<PullRepoRef | undefined> {
    const [repo] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return repo;
  }

  async pullInWorkspace(
    workspaceId: string,
    prId: string,
  ): Promise<{ pull: PullRecord; repo: PullRepoRef } | undefined> {
    const [row] = await this.db
      .select({
        pull: t.pullRequests,
        repo: { id: t.repos.id, owner: t.repos.owner, name: t.repos.name },
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row && { pull: toPullRecord(row.pull), repo: row.repo };
  }

  async listForRepo(repoId: string): Promise<PullRecord[]> {
    const rows = await this.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repoId));
    return rows.map(toPullRecord);
  }

  /**
   * Upsert the PR list from GitHub (idempotent on repo_id + number). New PRs are
   * inserted in full; existing ones get title, head sha, status and updated_at —
   * diff stats and body are backfilled from the detail endpoint instead.
   * Returns how many PRs were written.
   */
  async upsertFromGitHub(workspaceId: string, repoId: string, pulls: PrMeta[]): Promise<number> {
    // One row per number: Postgres rejects a batch that hits the same conflict
    // key twice, and a paginated list can repeat a PR that moved between pages.
    const unique = [...new Map(pulls.map((pr) => [pr.number, pr])).values()];
    const rows = unique.map((pr) => ({
      workspaceId,
      repoId,
      number: pr.number,
      title: pr.title,
      author: pr.author,
      branch: pr.branch,
      base: pr.base,
      headSha: pr.head_sha,
      additions: pr.additions,
      deletions: pr.deletions,
      filesCount: pr.files_count,
      status: pr.status,
      openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
      updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
    }));
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
      await this.db
        .insert(t.pullRequests)
        .values(rows.slice(i, i + UPSERT_CHUNK_SIZE))
        .onConflictDoUpdate({
          target: [t.pullRequests.repoId, t.pullRequests.number],
          set: {
            title: sql`excluded.title`,
            headSha: sql`excluded.head_sha`,
            status: sql`excluded.status`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
    return rows.length;
  }

  async setDiffStats(prId: string, stats: DiffStats): Promise<void> {
    await this.db.update(t.pullRequests).set(stats).where(eq(t.pullRequests.id, prId));
  }

  async replaceDetail(prId: string, detail: PrDetail): Promise<void> {
    // One unit: without it a failure between the DELETE and the INSERT left the
    // PR with no files, and the offline fallback then served that half-deleted state.
    await this.db.transaction(async (tx) => {
      await tx.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
      if (detail.files.length > 0) {
        await tx.insert(t.prFiles).values(
          detail.files.map((f) => ({
            prId,
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch ?? null,
          })),
        );
      }
      await tx.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
      if (detail.commits.length > 0) {
        await tx.insert(t.prCommits).values(
          detail.commits.map((c) => ({
            prId,
            sha: c.sha,
            message: c.message,
            author: c.author,
            committedAt: c.committed_at ? new Date(c.committed_at) : null,
          })),
        );
      }
      await tx
        .update(t.pullRequests)
        .set({
          body: detail.body ?? null,
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        })
        .where(eq(t.pullRequests.id, prId));
    });
  }

  async persistedDetail(prId: string): Promise<Pick<PrDetail, 'files' | 'commits'>> {
    const files = await this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    const commits = await this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
    return {
      files: files.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? null,
      })),
      commits: commits.map((c) => ({
        sha: c.sha,
        message: c.message,
        author: c.author,
        committed_at: c.committedAt?.toISOString() ?? null,
      })),
    };
  }

  async markPolled(repoId: string): Promise<void> {
    await this.db.update(t.repos).set({ lastPolledAt: new Date() }).where(eq(t.repos.id, repoId));
  }

  async roundInputs(prIds: string[]): Promise<RoundInputs> {
    if (prIds.length === 0) return { runs: [], reviews: [] };
    const runs = await this.db
      .select({
        prId: t.agentRuns.prId,
        id: t.agentRuns.id,
        batchId: t.agentRuns.batchId,
        costUsd: t.agentRuns.costUsd,
      })
      .from(t.agentRuns)
      .where(and(inArray(t.agentRuns.prId, prIds), isNotNull(t.agentRuns.batchId)))
      .orderBy(desc(t.agentRuns.ranAt));
    const reviews = await this.db
      .select({
        prId: t.reviews.prId,
        id: t.reviews.id,
        runId: t.reviews.runId,
        score: t.reviews.score,
      })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
    return { runs, reviews };
  }

  async findingSeverities(reviewIds: string[]): Promise<FindingSeverityRow[]> {
    if (reviewIds.length === 0) return [];
    return this.db
      .select({ reviewId: t.findings.reviewId, severity: t.findings.severity })
      .from(t.findings)
      .where(inArray(t.findings.reviewId, reviewIds));
  }
}
