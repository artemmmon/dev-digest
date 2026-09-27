import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  SmartDiffFileRow,
  SmartDiffFindingLocation,
  SmartDiffPullRef,
  SmartDiffRoundInputs,
  SmartDiffStore,
} from './ports.js';

/**
 * Smart Diff data-access (Drizzle implementation of `SmartDiffStore`, spec 09).
 * Reads only — `pr_files`, `agent_runs`, `reviews` and `findings` are owned by
 * other modules (same shared-table precedent as `pulls/repository.ts`'s own
 * `roundInputs`, server INSIGHTS `:329`).
 */
export class SmartDiffRepository implements SmartDiffStore {
  constructor(private db: DbOrTx) {}

  async pullInWorkspace(workspaceId: string, prId: string): Promise<SmartDiffPullRef | undefined> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async files(prId: string): Promise<SmartDiffFileRow[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  async roundInputs(prId: string): Promise<SmartDiffRoundInputs> {
    const runs = await this.db
      .select({ prId: t.agentRuns.prId, id: t.agentRuns.id, batchId: t.agentRuns.batchId })
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.prId, prId), isNotNull(t.agentRuns.batchId)))
      .orderBy(desc(t.agentRuns.ranAt));
    const reviews = await this.db
      .select({ prId: t.reviews.prId, id: t.reviews.id, runId: t.reviews.runId })
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
    return { runs, reviews };
  }

  async findingLocations(reviewIds: string[]): Promise<SmartDiffFindingLocation[]> {
    if (reviewIds.length === 0) return [];
    const rows = await this.db
      .select({ file: t.findings.file, startLine: t.findings.startLine })
      .from(t.findings)
      .where(inArray(t.findings.reviewId, reviewIds));
    return rows;
  }
}
