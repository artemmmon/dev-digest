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
// Agent performance (GET /agents/:id/stats, GET /agent-performance)
// ---------------------------------------------------------------------------

/** Period of the stats views: rolling 1 day, rolling 30 days, or a custom range. */
export const StatsPeriod = z.enum(['1d', '30d', 'custom']);
export type StatsPeriod = z.infer<typeof StatsPeriod>;

/**
 * Query of both stats routes. `from`/`to` are full ISO instants the client
 * computes from local dates; they are required (and ordered) for `custom`.
 */
export const StatsPeriodQuery = z
  .object({
    period: StatsPeriod.default('30d'),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.period !== 'custom') return;
    if (q.from === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: 'from is required for a custom period' });
    }
    if (q.to === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'to is required for a custom period' });
    }
    if (q.from !== undefined && q.to !== undefined && Date.parse(q.from) > Date.parse(q.to)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: 'from must not be after to' });
    }
  });
export type StatsPeriodQuery = z.infer<typeof StatsPeriodQuery>;

/** Cost of one model inside a period; `model` is null when the run recorded none. */
export const ModelCost = z.object({
  model: z.string().nullable(),
  cost_usd: z.number(),
});
export type ModelCost = z.infer<typeof ModelCost>;

/**
 * Performance of one agent over a period. `agent_id`/`agent_name` are null only
 * for the "Deleted agent" entry. `accept_rate` is a 0..1 ratio; null means "no data".
 */
export const AgentStats = z.object({
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  runs: z.number().int(),
  runs_done: z.number().int(),
  runs_failed: z.number().int(),
  runs_cancelled: z.number().int(),
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  /** true when some counted run in the period has no recorded cost. */
  cost_partial: z.boolean(),
  avg_duration_ms: z.number().nullable(),
  last_run_at: z.string().nullable(),
  cost_by_model: z.array(ModelCost),
});
export type AgentStats = z.infer<typeof AgentStats>;

export const AgentCost = z.object({
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  cost_usd: z.number(),
});
export type AgentCost = z.infer<typeof AgentCost>;

export const MostActiveAgent = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
});
export type MostActiveAgent = z.infer<typeof MostActiveAgent>;

/** Response of `GET /agent-performance`: workspace totals, per-agent rows and cost breakdowns. */
export const AgentPerformance = z.object({
  totals: z.object({
    runs: z.number().int(),
    total_cost_usd: z.number().nullable(),
    cost_partial: z.boolean(),
    accepted: z.number().int(),
    dismissed: z.number().int(),
    accept_rate: z.number().nullable(),
    most_active: MostActiveAgent.nullable(),
  }),
  agents: z.array(AgentStats),
  cost_by_agent: z.array(AgentCost),
  cost_by_model: z.array(ModelCost),
  /** true when counted runs exist in the workspace outside the selected period. */
  has_runs_outside_period: z.boolean(),
});
export type AgentPerformance = z.infer<typeof AgentPerformance>;

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
