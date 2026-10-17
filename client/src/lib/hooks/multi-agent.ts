/* hooks/multi-agent.ts — React Query hooks for the Multi-Agent Review page.
     GET /pulls/:id/multi-agent-runs          → MultiAgentRunListItem[] (≤ 10, newest first)
     GET /pulls/:id/multi-agent-runs/:runId   → MultiAgentRun (columns, groups, totals; 404 if unknown)
     GET /review-estimates                    → AgentRunEstimate[] (last 5 done runs per agent) */
"use client";

import { useQuery } from "@tanstack/react-query";
import type { AgentRunEstimate, MultiAgentRun, MultiAgentRunListItem } from "@devdigest/shared";
import { api } from "../api";
import { keys } from "../query-keys";

/** How often a run with a queued/running column is re-read. The page polls instead of opening one
   SSE stream per column (browsers allow ~6 connections per origin over HTTP/1.1); only the trace
   drawer streams. */
export const MULTI_AGENT_POLL_MS = 4000;

/** The PR's review batches, newest first (the run selector and the "has any run?" check). */
export function useMultiAgentRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: keys.pr.multiAgentRuns(prId),
    queryFn: () => api.get<MultiAgentRunListItem[]>(`/pulls/${prId}/multi-agent-runs`),
    enabled: !!prId,
  });
}

/** One multi-agent run. Polls while any column is `queued` or `running`, so a column's new state
   shows without a reload. */
export function useMultiAgentRun(prId: string | null | undefined, runId: string | null | undefined) {
  return useQuery({
    queryKey: keys.pr.multiAgentRun(prId, runId),
    queryFn: () => api.get<MultiAgentRun>(`/pulls/${prId}/multi-agent-runs/${runId}`),
    enabled: !!prId && !!runId,
    refetchInterval: (query) =>
      (query.state.data?.columns ?? []).some((c) => c.state === "queued" || c.state === "running")
        ? MULTI_AGENT_POLL_MS
        : false,
  });
}

/** Per-agent average duration/cost for the Configure run estimates. */
export function useReviewEstimates() {
  return useQuery({
    queryKey: keys.reviewEstimates(),
    queryFn: () => api.get<AgentRunEstimate[]>("/review-estimates"),
  });
}
