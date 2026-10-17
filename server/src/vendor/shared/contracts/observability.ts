import { z } from 'zod';
import { Severity } from './findings.js';
import { FindingRecord } from './review-api.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * A5 owns this file; the barrel re-exports it.
 *   - MultiAgentRun        one review batch of a PR: columns, finding groups, conflicts
 *                          (GET /pulls/:id/multi-agent-runs/:runId). Computed on read
 *                          from `agent_runs` + persisted findings; nothing here is stored.
 *   - AgentColumn          one agent run's column
 *   - FindingGroup         findings of all columns on one overlapping file range
 *   - AgentRunEstimate     per-agent average duration/cost (GET /review-estimates)
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review
// ---------------------------------------------------------------------------

/** Column state. `queued` is derived on read (no agent-started event yet), never stored. */
export const ColumnState = z.enum(['queued', 'running', 'done', 'failed', 'cancelled']);
export type ColumnState = z.infer<typeof ColumnState>;

/** A persisted finding tagged with the agent run that produced it. */
export const MultiAgentFinding = FindingRecord.extend({
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  run_id: z.string(),
});
export type MultiAgentFinding = z.infer<typeof MultiAgentFinding>;

/** One agent run's result column in the multi-agent review. */
export const AgentColumn = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  state: ColumnState,
  error: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  score: z.number().int().nullable(),
  verdict: z.string().nullable(),
  summary: z.string().nullable(),
  findings: z.array(MultiAgentFinding),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** One column's stance on a finding group. */
export const GroupTake = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  take: z.enum(['flagged', 'did_not_flag', 'failed', 'running']),
  finding_id: z.string().nullable(),
  severity: Severity.nullable(),
  title: z.string().nullable(),
});
export type GroupTake = z.infer<typeof GroupTake>;

/** Findings on one overlapping file range, with one take per column. */
export const FindingGroup = z.object({
  id: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  title: z.string(),
  finding_ids: z.array(z.string()),
  takes: z.array(GroupTake),
});
export type FindingGroup = z.infer<typeof FindingGroup>;

/** One review batch of a PR (= `agent_runs.batch_id`, or the run id for an unbatched local run). */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int().nullable(),
  total_cost_usd: z.number().nullable(),
  cost_partial: z.boolean(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  preparation_error: z.string().nullable(),
  columns: z.array(AgentColumn),
  groups: z.array(FindingGroup),
  /** Ids of the groups where the agents disagree. */
  conflicts: z.array(z.string()),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

/** Entry of the run selector (GET /pulls/:id/multi-agent-runs). */
export const MultiAgentRunListItem = z.object({
  id: z.string(),
  ran_at: z.string(),
  agent_count: z.number().int(),
});
export type MultiAgentRunListItem = z.infer<typeof MultiAgentRunListItem>;

/** Average of an agent's recent finished runs (GET /review-estimates). */
export const AgentRunEstimate = z.object({
  agent_id: z.string(),
  avg_duration_ms: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  runs: z.number().int(),
});
export type AgentRunEstimate = z.infer<typeof AgentRunEstimate>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

export const AgentStats = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
});
export type AgentStats = z.infer<typeof AgentStats>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;
