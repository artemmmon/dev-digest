import type { AgentRunEstimate } from "@devdigest/shared";

export interface EstimateTotals {
  /** Longest average duration among the checked agents (they run in parallel); null = none known. */
  timeMs: number | null;
  /** Sum of the checked agents' average costs; null = none known. */
  costUsd: number | null;
  /** True when some checked agent has no estimate (or lacks a duration or a cost), so the totals understate. */
  partial: boolean;
}

/** Estimated time (max average), cost (sum of averages) and whether the total is partial. */
export function estimateTotals(checkedIds: string[], estimates: AgentRunEstimate[]): EstimateTotals {
  const byAgent = new Map(estimates.map((e) => [e.agent_id, e]));
  let timeMs: number | null = null;
  let costUsd: number | null = null;
  let partial = false;
  for (const id of checkedIds) {
    const est = byAgent.get(id);
    if (!est || est.avg_duration_ms == null || est.avg_cost_usd == null) partial = true;
    if (est?.avg_duration_ms != null) timeMs = Math.max(timeMs ?? 0, est.avg_duration_ms);
    if (est?.avg_cost_usd != null) costUsd = (costUsd ?? 0) + est.avg_cost_usd;
  }
  return { timeMs, costUsd, partial };
}
