/* hooks/ci.ts — React Query hooks for Export to CI (the agent CI tab, the Export Wizard, the CI Runs page).
     GET  /agents/:id/ci          → CiAgentOverview (installations + the 20 newest runs)
     POST /agents/:id/ci/preview  → CiPreview (the generated files; 422 provider_not_supported)
     POST /agents/:id/ci/install  → CiInstallResult (409 ci_replace_unconfirmed, 403 github_workflow_scope)
     POST /agents/:id/ci/zip      → application/zip (saved as devdigest-ci.zip)
     GET  /ci/runs?period=&agent_id=&repo=&status=&cursor=&limit=  → CiRunPage (keyset, 50 per page)
     POST /ci/refresh {force}     → CiRefreshResult (the server ingests new runs from GitHub) */
"use client";

import React from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { keys } from "../query-keys";
import type {
  CiAgentOverview,
  CiInstallInputBody,
  CiInstallResult,
  CiPreview,
  CiPreviewInput,
  CiRefreshResult,
  CiRunPage,
  CiRunStatus,
} from "@devdigest/shared";

/** Runs per page on the CI Runs page (AC-83). */
export const CI_RUNS_PAGE_SIZE = 50;
/** How often an open CI tab / CI Runs page asks the server to ingest new runs (AC-99). */
export const CI_AUTO_REFRESH_MS = 60_000;
/** The file name the zip export is saved under (AC-54). */
export const CI_ZIP_FILE_NAME = "devdigest-ci.zip";

/** The CI Runs page filters; they sit in the URL and make up the list's query key. */
export interface CiRunFilters {
  period: "7d" | "30d" | "all";
  agent_id?: string | null;
  repo?: string | null;
  status?: CiRunStatus | null;
}

/** An agent's CI installations (with their last run) and its 20 newest CI runs. */
export function useCiOverview(agentId: string | null | undefined) {
  return useQuery({
    queryKey: keys.ci.overview(agentId),
    queryFn: () => api.get<CiAgentOverview>(`/agents/${agentId}/ci`),
    enabled: !!agentId,
  });
}

/** The CI Runs page list, newest first, 50 per page; `fetchNextPage` is "Load more" (AC-83). */
export function useCiRuns(filters: CiRunFilters, opts?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: keys.ci.runs({ ...filters }),
    enabled: opts?.enabled ?? true,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams({ period: filters.period, limit: String(CI_RUNS_PAGE_SIZE) });
      if (filters.agent_id) sp.set("agent_id", filters.agent_id);
      if (filters.repo) sp.set("repo", filters.repo);
      if (filters.status) sp.set("status", filters.status);
      if (pageParam) sp.set("cursor", pageParam);
      return api.get<CiRunPage>(`/ci/runs?${sp.toString()}`);
    },
    getNextPageParam: (last) => last.next_cursor,
  });
}

/**
 * Generate the files for the chosen repository, triggers and "post results as". The wizard shows a
 * failure inline on its own step, hence `silent`.
 */
export function useCiPreview(agentId: string | null | undefined) {
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: CiPreviewInput) => api.post<CiPreview>(`/agents/${agentId}/ci/preview`, body),
  });
}

/** Install: open (or update) the export PR. The Install step shows a failure inline, hence `silent`. */
export function useCiInstall(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: CiInstallInputBody) => api.post<CiInstallResult>(`/agents/${agentId}/ci/install`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.ci.scope() }),
  });
}

/** Save `blob` as a file through a temporary link, then free the object URL. */
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Install as a zip: the server records a manual installation and answers with the bytes. */
export function useCiZip(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: async (body: CiInstallInputBody) => {
      saveBlob(await api.postBlob(`/agents/${agentId}/ci/zip`, body), CI_ZIP_FILE_NAME);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.ci.scope() }),
  });
}

/** Ask the server to ingest new runs from GitHub (`force` skips its 30 s per-installation guard). */
export function useCiRefresh() {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: (input: { force: boolean }) => api.post<CiRefreshResult>("/ci/refresh", input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.ci.scope() }),
  });
}

/**
 * Refresh every 60 s while the caller is mounted (AC-99) and remember the last refresh problem so the
 * screen can say "Could not refresh from GitHub" while it keeps the stored runs (AC-116). `refreshNow`
 * is the manual Refresh button; the page shares this one mutation so a manual and an automatic refresh
 * report through the same notice.
 */
export function useCiAutoRefresh() {
  const refresh = useCiRefresh();
  const [failed, setFailed] = React.useState(false);
  const { mutate } = refresh;

  const run = React.useCallback(
    (force: boolean) =>
      mutate(
        { force },
        {
          onSuccess: (res) => setFailed(res.github_error != null),
          onError: () => setFailed(true),
        },
      ),
    [mutate],
  );

  React.useEffect(() => {
    const timer = setInterval(() => run(false), CI_AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [run]);

  return {
    /** The last refresh could not reach GitHub (or our own API); the stored runs are still shown. */
    githubError: failed,
    refreshing: refresh.isPending,
    refreshNow: React.useCallback(() => run(true), [run]),
  };
}
