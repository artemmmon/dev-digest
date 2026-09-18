import type { Finding, Intent, RunSummary, RunTrace } from '@devdigest/shared';

/**
 * Ports of the reviews module (onion-architecture: core declares, outer ring
 * implements). The row shapes below mirror the tables the repository reads —
 * declared here so services never import the DB layer; Drizzle rows are
 * structurally assignable to them.
 */

export interface PullRow {
  id: string;
  workspaceId: string;
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
  status: string;
  body: string | null;
  openedAt: Date | null;
  updatedAt: Date | null;
}

export interface ReviewRow {
  id: string;
  workspaceId: string;
  prId: string;
  agentId: string | null;
  runId: string | null;
  kind: 'summary' | 'review';
  verdict: string | null;
  summary: string | null;
  score: number | null;
  model: string | null;
  createdAt: Date;
}

export interface FindingRow {
  id: string;
  reviewId: string;
  file: string;
  startLine: number;
  endLine: number;
  severity: string;
  category: string;
  title: string;
  rationale: string;
  suggestion: string | null;
  confidence: number;
  kind: string;
  trifectaComponents: string[] | null;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

/** One persisted file of a PR (`pr_files`), used to rebuild a diff without a clone. */
export interface PrFileRow {
  path: string;
  patch: string | null;
}

export interface NewReview {
  workspaceId: string;
  prId: string;
  agentId: string | null;
  runId: string | null;
  kind: 'summary' | 'review';
  verdict: string | null;
  summary: string | null;
  score: number | null;
  model: string | null;
}

export interface NewAgentRun {
  workspaceId: string;
  agentId: string | null;
  prId: string;
  provider: string | null;
  model: string | null;
  /** Shared by every run started from one review request. */
  batchId: string | null;
}

export interface AgentRunCompletion {
  status: 'done' | 'failed' | 'cancelled';
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  /** LLM cost in USD; null when unknown (failed run, unpriced model). */
  costUsd?: number | null;
  findingsCount: number;
  grounding: string;
  /** Review score (0-100); null on failed/cancelled runs. */
  score?: number | null;
  /** Findings that tripped the agent's gate; 0 on failed/cancelled runs. */
  blockers?: number | null;
  /** Failure reason (status='failed') / cancellation note. Null clears it. */
  error?: string | null;
}

export interface ActiveRun {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  ran_at: string | null;
}

/**
 * Review data-access: reviews + findings, agent runs + traces, the PR lookup the
 * run needs, and the PR intent. Workspace scoping goes through the PR.
 */
export interface ReviewStore {
  // ---- PR lookup ----
  getPull(workspaceId: string, prId: string): Promise<PullRow | undefined>;
  getRepo(repoId: string): Promise<
    { id: string; owner: string; name: string } | undefined
  >;
  getPrFiles(prId: string): Promise<PrFileRow[]>;
  /** Record the head SHA a review ran against (PR-list freshness derivation). */
  markReviewed(prId: string, sha: string): Promise<void>;

  // ---- reviews + findings ----
  insertReview(values: NewReview): Promise<ReviewRow>;
  insertFindings(reviewId: string, findings: Finding[]): Promise<FindingRow[]>;
  /** Reviews for a PR (newest first), each with its findings. */
  reviewsForPull(
    prId: string,
  ): Promise<{ review: ReviewRow; findings: FindingRow[]; batchId: string | null }[]>;
  getReview(reviewId: string): Promise<ReviewRow | undefined>;
  /** Delete a whole review + its findings (cascade), workspace-scoped. */
  deleteReview(workspaceId: string, reviewId: string): Promise<boolean>;

  // ---- finding actions ----
  getFinding(findingId: string): Promise<FindingRow | undefined>;
  findingContext(
    findingId: string,
  ): Promise<{ finding: FindingRow; review: ReviewRow; pull: PullRow } | undefined>;
  setFindingAccepted(findingId: string, at: Date | null): Promise<FindingRow | undefined>;
  setFindingDismissed(findingId: string, at: Date | null): Promise<FindingRow | undefined>;

  // ---- intent ----
  upsertIntent(prId: string, intent: Intent): Promise<void>;
  getIntent(prId: string): Promise<Intent | undefined>;

  // ---- runs + traces ----
  /** Create an agent_runs row in `running` state; returns its id (= the runId). */
  createAgentRun(values: NewAgentRun): Promise<string>;
  completeAgentRun(runId: string, values: AgentRunCompletion): Promise<void>;
  /** In-flight runs for a PR (status='running'), joined with the agent name. */
  activeRunsForPull(workspaceId: string, prId: string): Promise<ActiveRun[]>;
  /** All runs for a PR (any status), newest first. */
  listRunsForPull(workspaceId: string, prId: string): Promise<RunSummary[]>;
  /** A run's status in the workspace; `undefined` when the run doesn't exist there. */
  runStatus(workspaceId: string, runId: string): Promise<string | null | undefined>;
  cancelRunIfRunning(workspaceId: string, runId: string): Promise<boolean>;
  /** On boot: any run still 'running' is orphaned, so mark it failed. */
  reapStaleRunningRuns(): Promise<number>;
  deleteAgentRun(workspaceId: string, runId: string): Promise<boolean>;
  /** Persist the WHOLE run log as ONE document (PK = runId). */
  saveRunTrace(runId: string, trace: RunTrace): Promise<void>;
  getRunTrace(workspaceId: string, runId: string): Promise<RunTrace | undefined>;
}
