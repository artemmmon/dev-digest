/* hooks/eval.ts — React Query hooks for the eval pipeline (cases, run-level runs, compare, dashboard).
     GET  /agents/:id/eval-cases        → { cases: EvalCaseRecord[] }
     POST /agents/:id/eval-cases        → EvalCaseRecord (201; 409 eval_case_exists, 422 on a bad case)
     PUT  /eval-cases/:id               → EvalCaseRecord (same id and source finding; 422 on a bad case)
     DELETE /eval-cases/:id             → 204 (409 eval_run_in_progress while a run of the agent runs)
     POST /agents/:id/eval-runs         → EvalRunStarted (202; 409 eval_run_in_progress, 422 provider_not_configured)
     GET  /agents/:id/eval-runs?limit=  → EvalRunsOverview
     GET  /agents/:id/eval-trend        → EvalTrend (every counted run, oldest first)
     GET  /eval-runs/compare?a=&b=      → EvalCompare
     GET  /eval/dashboard               → EvalDashboardOverview */
"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { isPrReviewsKey, keys } from "../query-keys";
import type {
  EvalCaseRecord,
  EvalCaseSave,
  EvalCompare,
  EvalDashboardOverview,
  EvalRunStarted,
  EvalRunsOverview,
  EvalTrend,
} from "@devdigest/shared";

/** How often the runs list is re-read while a run is `running`, so its progress `k / n` moves (AC-22). */
const RUN_POLL_MS = 2000;
/** The Evals tab shows the last 10 runs. */
export const EVAL_RUNS_DEFAULT_LIMIT = 10;

/** Everything one agent's eval views show, plus the dashboard that rolls its runs up. */
function invalidateAgentEval(qc: QueryClient, agentId: string | null | undefined) {
  void qc.invalidateQueries({ queryKey: keys.eval.agent(agentId) });
  void qc.invalidateQueries({ queryKey: keys.eval.dashboard() });
}

/** The agent's eval cases, each with its latest counted outcome. */
export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: keys.eval.cases(agentId),
    queryFn: async () => (await api.get<{ cases: EvalCaseRecord[] }>(`/agents/${agentId}/eval-cases`)).cases,
    enabled: !!agentId,
  });
}

/**
 * Save an eval case. A case seeded from a finding also flips that finding's card to "In eval set", so
 * pass the PR id to refetch its reviews. The Case Editor shows 4xx errors inline, hence `silent`.
 */
export function useCreateEvalCase(
  agentId: string | null | undefined,
  opts?: { prId?: string | null },
) {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: EvalCaseSave) => api.post<EvalCaseRecord>(`/agents/${agentId}/eval-cases`, body),
    onSuccess: () => {
      invalidateAgentEval(qc, agentId);
      if (opts?.prId) void qc.invalidateQueries({ queryKey: keys.pr.reviews(opts.prId) });
    },
    onError: (error) => {
      // The finding already has a case (another tab, a double click): its card must say so.
      if (error instanceof ApiError && error.code === "eval_case_exists" && opts?.prId) {
        void qc.invalidateQueries({ queryKey: keys.pr.reviews(opts.prId) });
      }
    },
  });
}

/** Save an edited case under its id (AC-54). The Case Editor shows 4xx errors inline, hence `silent`. */
export function useUpdateEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ id, body }: { id: string; body: EvalCaseSave }) =>
      api.put<EvalCaseRecord>(`/eval-cases/${id}`, body),
    onSuccess: () => invalidateAgentEval(qc, agentId),
  });
}

/**
 * Delete a case. The server refuses with 409 while a run of the agent is running; the caller shows
 * that message inline (`silent`). Past runs keep their metrics, so run lists are re-read too.
 */
export function useDeleteEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (id: string) => api.del<void>(`/eval-cases/${id}`),
    onSuccess: () => {
      invalidateAgentEval(qc, agentId);
      // The finding cards read `eval_case_id` from the cached PR reviews, and the delete does not
      // know the PR: re-read every cached PR's reviews so no card keeps saying "In eval set".
      void qc.invalidateQueries({ predicate: (q) => isPrReviewsKey(q.queryKey) });
    },
  });
}

/**
 * The agent's newest runs (default 10, max 50) plus its two latest counted runs. Polls every 2 s
 * while any listed run is `running`; when that run ends, the case outcomes, the trend and the dashboard
 * are re-read so they show it.
 */
export function useEvalRuns(agentId: string | null | undefined, limit: number = EVAL_RUNS_DEFAULT_LIMIT) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: keys.eval.runs(agentId, limit),
    queryFn: () => api.get<EvalRunsOverview>(`/agents/${agentId}/eval-runs?limit=${limit}`),
    enabled: !!agentId,
    refetchInterval: (q) =>
      (q.state.data?.runs ?? []).some((r) => r.status === "running") ? RUN_POLL_MS : false,
  });
  const running = (query.data?.runs ?? []).some((r) => r.status === "running");
  const wasRunning = React.useRef(false);
  React.useEffect(() => {
    if (wasRunning.current && !running) {
      void qc.invalidateQueries({ queryKey: keys.eval.cases(agentId) });
      void qc.invalidateQueries({ queryKey: keys.eval.trend(agentId) });
      void qc.invalidateQueries({ queryKey: keys.eval.dashboard() });
    }
    wasRunning.current = running;
  }, [running, agentId, qc]);
  return query;
}

/** The agent's counted runs, oldest first: the points of the metric trend chart (AC-58). */
export function useEvalTrend(agentId: string | null | undefined) {
  return useQuery({
    queryKey: keys.eval.trend(agentId),
    queryFn: () => api.get<EvalTrend>(`/agents/${agentId}/eval-trend`),
    enabled: !!agentId,
  });
}

/** Start a run of every case of the agent. The server answers 202 at once; progress comes from `useEvalRuns`. */
export function useStartEvalRun(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalRunStarted>(`/agents/${agentId}/eval-runs`),
    onSuccess: () => invalidateAgentEval(qc, agentId),
    onError: (error) => {
      // A run is already going (another tab): re-read so the page shows that run.
      if (error instanceof ApiError && error.code === "eval_run_in_progress") {
        invalidateAgentEval(qc, agentId);
      }
    },
  });
}

/** Two counted runs of one agent compared. Enabled once both ids are chosen. */
export function useEvalCompare(a: string | null | undefined, b: string | null | undefined) {
  return useQuery({
    queryKey: keys.eval.compare(a, b),
    queryFn: () =>
      api.get<EvalCompare>(
        `/eval-runs/compare?a=${encodeURIComponent(a ?? "")}&b=${encodeURIComponent(b ?? "")}`,
      ),
    enabled: !!a && !!b,
  });
}

/** Every agent's latest counted run and the newest counted runs of the workspace. */
export function useEvalDashboard() {
  return useQuery({
    queryKey: keys.eval.dashboard(),
    queryFn: () => api.get<EvalDashboardOverview>("/eval/dashboard"),
  });
}
