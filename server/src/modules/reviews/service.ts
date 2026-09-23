import { randomUUID } from 'node:crypto';
import type { FindingActionKind, RunEventKind, RunTrace, SkippedAgent } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { AgentRecord } from '../agents/types.js';
import type { ReviewDeps } from './deps.js';
import { type ReviewDto, type ReviewDtoFinding } from './helpers.js';
import { ReviewRunExecutor, type Logger } from './run-executor.js';
import { actOnFinding as actOnFindingImpl } from './findings.js';
import { reviewToDto } from './helpers.js';
import { effectivePaths, matchesAppliesTo } from './applicability.js';

// Re-export DTO types + converters for backward-compatible imports from
// './service.js' (these previously lived here; logic now in ./helpers.ts).
export { findingRowToDto, reviewToDto } from './helpers.js';
export type { ReviewDto, ReviewDtoFinding } from './helpers.js';

/**
 * Review service (the core). Orchestrates:
 *   diff → assemblePrompt(system + repo-map + diff)
 *        → llm.completeStructured({ schema: Review }) (single-pass)
 *        → groundFindings(...) (citation gate — drops findings off the diff)
 *        → persist reviews + kept findings (+ grounding summary)
 *   while streaming RunEvents over the run bus, and on completion writing
 *   the whole log as ONE RunTrace doc + an agent_runs row.
 *
 * Also: the finding accept/dismiss actions. The bulky run execution lives in
 * run-executor; this class keeps the public method surface.
 */
export class ReviewService {
  private executor: ReviewRunExecutor;

  constructor(private deps: ReviewDeps) {
    this.executor = new ReviewRunExecutor(deps);
  }

  private get repo() {
    return this.deps.reviews;
  }

  private get agents() {
    return this.deps.agents;
  }

  // ===========================================================================
  // Run a review for one or all enabled agents on a PR.
  // ===========================================================================

  /**
   * Resolve which agents to run. `all` → every enabled agent whose `applies_to`
   * (spec 07) matches at least one of the PR's changed files — fails open (runs
   * anyway) when the PR has no `pr_files` yet, so a never-imported PR loses no
   * agent. An explicitly named agent always runs, gating or not.
   */
  async resolveTargets(
    workspaceId: string,
    prId: string,
    opts: { agentId?: string; all?: boolean },
  ): Promise<{ targets: AgentRecord[]; skipped: SkippedAgent[] }> {
    if (opts.all) {
      const enabled = await this.agents.listEnabled(workspaceId);
      const files = await this.repo.getPrFiles(prId);
      const paths = effectivePaths(files.map((f) => f.path));
      const targets: AgentRecord[] = [];
      const skipped: SkippedAgent[] = [];
      for (const agent of enabled) {
        if (matchesAppliesTo(agent.appliesTo, paths)) targets.push(agent);
        else skipped.push({ agent_id: agent.id, agent_name: agent.name });
      }
      return { targets, skipped };
    }
    if (opts.agentId) {
      const agent = await this.agents.getById(workspaceId, opts.agentId);
      if (!agent) throw new NotFoundError('Agent not found');
      return { targets: [agent], skipped: [] };
    }
    throw new AppError('invalid_run_request', 'Provide agentId or all:true', 400);
  }

  /** Delete a whole review run (one agent's pass) + its findings (cascade). */
  async deleteReview(workspaceId: string, reviewId: string): Promise<boolean> {
    return this.repo.deleteReview(workspaceId, reviewId);
  }

  /** In-flight runs for a PR (server-side source of truth, survives reload). */
  async activeRuns(workspaceId: string, prId: string) {
    return this.repo.activeRunsForPull(workspaceId, prId);
  }

  /** All runs for a PR (any status), newest first — the run history (incl. failures). */
  async listRuns(workspaceId: string, prId: string) {
    return this.repo.listRunsForPull(workspaceId, prId);
  }

  /**
   * Whether an SSE subscriber can expect live events for this run. Throws 404
   * for a run outside the workspace. A finished run the bus no longer holds
   * (restart, retention expired) has nothing left to stream — the trace has it.
   */
  async runStream(workspaceId: string, runId: string): Promise<{ live: boolean }> {
    const status = await this.repo.runStatus(workspaceId, runId);
    if (status === undefined) throw new NotFoundError('Run not found');
    return { live: status === 'running' || this.deps.bus.knows(runId) };
  }

  /** Delete one run from the history (+ its trace). */
  async deleteRun(workspaceId: string, runId: string): Promise<boolean> {
    return this.repo.deleteAgentRun(workspaceId, runId);
  }

  /**
   * Cancel an in-flight run. Signals a live runner to stop at its next
   * checkpoint AND marks the DB row cancelled + completes the bus immediately —
   * so cancel also works for ORPHANED runs (whose background process died on a
   * server restart) where signalling alone would do nothing.
   */
  async cancelRun(workspaceId: string, runId: string): Promise<void> {
    // Unknown (or other workspace's) run → 404, before touching the bus.
    const status = await this.repo.runStatus(workspaceId, runId);
    if (status === undefined) throw new NotFoundError('Run not found');
    this.publish(runId, 'info', 'Cancellation requested — stopping…');
    this.deps.bus.cancel(runId);
    await this.repo.cancelRunIfRunning(workspaceId, runId);
    this.deps.bus.complete(runId);
  }

  /** Reap runs left 'running' by a previous (now-dead) process. Called on boot. */
  async reapStaleRuns(): Promise<number> {
    return this.repo.reapStaleRunningRuns();
  }

  /**
   * Run a review for each target agent. Each agent gets its own runId
   * (= agent_runs.id) created up-front so the SSE route can be subscribed
   * before/while the run progresses. A partial failure in one agent does not
   * abort the others.
   */
  async runReview(
    workspaceId: string,
    prId: string,
    targets: AgentRecord[],
    logger?: Logger,
  ): Promise<{ runs: { run_id: string; agent_id: string; agent_name: string }[]; reviews: ReviewDto[] }> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // Create the agent_run rows up front so a runId is available IMMEDIATELY —
    // the client persists these in global state and subscribes to the SSE
    // stream. The actual (slow) review runs in the background below.
    const runs: { run_id: string; agent_id: string; agent_name: string }[] = [];
    const jobs: { agent: AgentRecord; runId: string }[] = [];
    // One batch per request: the PR list sums the cost of the latest batch.
    const batchId = randomUUID();
    for (const agent of targets) {
      const runId = await this.repo.createAgentRun({
        workspaceId,
        agentId: agent.id,
        prId,
        provider: agent.provider,
        model: agent.model,
        batchId,
      });
      runs.push({ run_id: runId, agent_id: agent.id, agent_name: agent.name });
      jobs.push({ agent, runId });
    }

    // Fire-and-forget: the HTTP response returns now with the runIds; reviews
    // are persisted as each agent finishes and the client refetches on SSE done.
    void this.executor.executeRuns(workspaceId, pull, repo, jobs, logger).catch((err) => {
      logger?.error({ prId, err: (err as Error).message }, 'review: background execution crashed');
    });

    return { runs, reviews: [] };
  }

  private publish(runId: string, kind: RunEventKind, msg: string, data?: unknown) {
    return this.deps.bus.publish(runId, kind, msg, data);
  }

  // ===========================================================================
  // Finding actions
  // ===========================================================================

  async actOnFinding(
    workspaceId: string,
    findingId: string,
    action: FindingActionKind,
  ): Promise<{ finding: ReviewDtoFinding }> {
    return actOnFindingImpl(this.repo, workspaceId, findingId, action);
  }

  // ===========================================================================
  // Reads
  // ===========================================================================

  async reviewsForPull(workspaceId: string, prId: string): Promise<ReviewDto[]> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const rows = await this.repo.reviewsForPull(prId);
    const agentIds = [...new Set(rows.flatMap(({ review }) => review.agentId ?? []))];
    const names = await this.agents.namesByIds(workspaceId, agentIds);
    return rows.map(({ review, findings, batchId }) =>
      reviewToDto(review, findings, review.agentId ? names.get(review.agentId) : null, batchId),
    );
  }

  async getRunTrace(workspaceId: string, runId: string): Promise<RunTrace | undefined> {
    return this.repo.getRunTrace(workspaceId, runId);
  }
}
