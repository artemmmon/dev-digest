import { sql } from 'drizzle-orm';
import type { PrMeta } from '@devdigest/shared';
import type { DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** Rows per INSERT; one statement per chunk instead of one per PR. */
const UPSERT_CHUNK_SIZE = 500;

/**
 * Pull-request persistence shared by the pulls list sync and the manual poll.
 * First slice of the pulls repository: the rest of the pulls queries still sit
 * in routes.ts (known debt, onion-architecture skill → devdigest.md §5).
 */
export class PullsRepository {
  constructor(private db: DbOrTx) {}

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
}
