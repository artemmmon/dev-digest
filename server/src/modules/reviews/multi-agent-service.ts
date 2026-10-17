import type { AgentRunEstimate, MultiAgentRun, MultiAgentRunListItem } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { ReviewDeps } from './deps.js';
import {
  buildColumns,
  conflictIds,
  estimateByAgent,
  groupFindings,
  listBatches,
  preparationError,
  totals,
} from './multi-agent.js';
import type { ReviewService } from './service.js';

/** How many recent done runs of an agent the estimate averages. */
const ESTIMATE_SAMPLE_RUNS = 5;

/**
 * Multi-agent review reads: a "multi-agent run" is one review batch of a PR,
 * composed on read from `agent_runs`, the persisted reviews and the run-bus buffer
 * (for the derived `queued` state). Nothing here writes.
 */
export class MultiAgentService {
  constructor(
    private deps: ReviewDeps,
    private reviews: Pick<ReviewService, 'reviewsForPull'>,
  ) {}

  /** Review batches of a PR for the run selector, newest first (≤10). */
  async listRuns(workspaceId: string, prId: string): Promise<MultiAgentRunListItem[]> {
    await this.requirePull(workspaceId, prId);
    const rows = await this.deps.reviews.listBatchRunsForPull(workspaceId, prId);
    return listBatches(rows).map((b) => ({
      id: b.id,
      ran_at: b.ranAt.toISOString(),
      agent_count: b.rows.length,
    }));
  }

  /** One batch of a PR with its columns, finding groups, conflicts and totals. */
  async getRun(workspaceId: string, prId: string, runId: string): Promise<MultiAgentRun> {
    await this.requirePull(workspaceId, prId);
    const rows = await this.deps.reviews.listBatchRunsForPull(workspaceId, prId);
    const batch = listBatches(rows, Number.POSITIVE_INFINITY).find((b) => b.id === runId);
    if (!batch) throw new NotFoundError('Multi-agent run not found');
    const reviews = await this.reviews.reviewsForPull(workspaceId, prId);
    const columns = buildColumns(batch.rows, reviews, (id) => this.deps.bus.buffer(id));
    const groups = groupFindings(columns);
    return {
      id: batch.id,
      pr_id: prId,
      ran_at: batch.ranAt.toISOString(),
      agent_count: columns.length,
      ...totals(columns),
      preparation_error: preparationError(columns),
      columns,
      groups,
      conflicts: conflictIds(groups),
    };
  }

  /** Per-agent average duration and cost of the last runs, for the workspace. */
  async estimates(workspaceId: string): Promise<AgentRunEstimate[]> {
    const samples = await this.deps.reviews.recentDoneRuns(workspaceId, ESTIMATE_SAMPLE_RUNS);
    return estimateByAgent(samples);
  }

  private async requirePull(workspaceId: string, prId: string): Promise<void> {
    const pull = await this.deps.reviews.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
  }
}
