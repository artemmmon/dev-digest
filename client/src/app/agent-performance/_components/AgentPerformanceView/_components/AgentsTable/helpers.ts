import type { AgentStats } from "@devdigest/shared";
import { isSmallSample, statsPeriodToSearch, type StatsPeriodSelection } from "@/lib/stats-period";

/** `null` = the default order (most runs first); otherwise the accept-rate direction. */
export type AcceptSort = null | "desc" | "asc";

/** Accept-rate header click: first highest first, then lowest first, then back and forth (AC-39, AC-40). */
export function nextSort(current: AcceptSort): "desc" | "asc" {
  return current === "desc" ? "asc" : "desc";
}

/** Stable DOM / state key of a row; the "Deleted agent" row has no id. */
export function rowKey(agent: AgentStats): string {
  return agent.agent_id ?? "deleted-agent";
}

/**
 * The rows in display order, as a new array. No sort: most runs first (OQ-1). By accept rate: every agent
 * with 10 or more decisions before every small-sample one (AC-41), each group by rate in the chosen
 * direction, agents with no rate last.
 */
export function sortRows(rows: readonly AgentStats[], sort: AcceptSort): AgentStats[] {
  const copy = [...rows];
  if (sort === null) return copy.sort((a, b) => b.runs - a.runs);
  const dir = sort === "desc" ? -1 : 1;
  return copy.sort((a, b) => {
    const bySample = Number(isSmallSample(a)) - Number(isSmallSample(b));
    if (bySample !== 0) return bySample;
    if (a.accept_rate === null || b.accept_rate === null) {
      return Number(a.accept_rate === null) - Number(b.accept_rate === null);
    }
    return dir * (a.accept_rate - b.accept_rate);
  });
}

/** The agent's editor on its Stats tab, with the period selected on this page (AC-47). */
export function viewHref(agentId: string, period: StatsPeriodSelection): string {
  const params = new URLSearchParams({ tab: "stats" });
  for (const [key, value] of Object.entries(statsPeriodToSearch(period))) {
    if (value !== null) params.set(key, value);
  }
  return `/agents/${encodeURIComponent(agentId)}?${params.toString()}`;
}
