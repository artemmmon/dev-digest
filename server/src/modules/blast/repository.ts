import { and, asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BlastPullRef, BlastStore } from './ports.js';

/**
 * Blast radius data-access (Drizzle implementation of `BlastStore`). Reads only:
 * `pull_requests` and `pr_files` are owned by other modules (same shared-table
 * precedent as `smart-diff/repository.ts`).
 */
export class BlastRepository implements BlastStore {
  constructor(private db: DbOrTx) {}

  async pullInWorkspace(workspaceId: string, prId: string): Promise<BlastPullRef | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        headSha: t.pullRequests.headSha,
      })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async changedPaths(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(asc(t.prFiles.path));
    return rows.map((r) => r.path);
  }
}
