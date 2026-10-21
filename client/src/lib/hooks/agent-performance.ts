/* hooks/agent-performance.ts — React Query hooks for the Agent Performance page and the agent Stats tab.
     GET /agent-performance?period=&from=&to=       → AgentPerformance (totals, agent rows, cost breakdowns)
     GET /agents/:id/stats?period=&from=&to=        → AgentStats (one agent over the period)
   A new period is a new key and shows no old figure (no placeholder data). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { keys } from "../query-keys";
import { statsPeriodToApiQuery, type StatsPeriodSelection } from "../stats-period";
import type { AgentPerformance, AgentStats } from "@devdigest/shared";

/** The workspace dashboard over the selected period. */
export function useAgentPerformance(sel: StatsPeriodSelection) {
  return useQuery({
    queryKey: keys.agentPerformance.workspace(sel),
    queryFn: () => api.get<AgentPerformance>(`/agent-performance?${statsPeriodToApiQuery(sel)}`),
  });
}

/** One agent's figures over the selected period (the agent editor's Stats tab). */
export function useAgentStats(agentId: string | null | undefined, sel: StatsPeriodSelection) {
  return useQuery({
    queryKey: keys.agentPerformance.agent(agentId, sel),
    queryFn: () => api.get<AgentStats>(`/agents/${agentId}/stats?${statsPeriodToApiQuery(sel)}`),
    enabled: !!agentId,
  });
}
