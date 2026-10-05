/* hooks/blast.ts — React Query hooks for the PR Overview "BLAST RADIUS" card.
   GET /pulls/:id/blast (precomputed repo-intel map + index state, no LLM call), plus the
   card's Resync action: POST /repos/:id/resync, then watch the index state until it moves. */
"use client";

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { keys } from "../query-keys";
import { useRepoIntelStatus, useResyncRepoIntel } from "./repo-intel";
import type { BlastRadiusResponse } from "@devdigest/shared";

/** Give up waiting for a resync to write a new index row after this long. */
export const RESYNC_TIMEOUT_MS = 120_000;

/**
 * The PR's blast radius. `pr_files` is filled only by the PR-detail GET, so pass the
 * detail's `headSha`: the query waits for it and refetches when a push moves the head
 * (same contract as `usePrIntent`).
 */
export function useBlastRadius(prId: string | null | undefined, headSha?: string | null) {
  return useQuery({
    queryKey: [...keys.pr.blast(prId), headSha ?? null] as const,
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId && headSha !== undefined,
  });
}

/**
 * Resync the repo index and refetch the blast map once it lands. Completion is the index
 * state's `updatedAt` moving past the value seen when `start` was clicked (the status enum
 * is terminal-only, so it cannot signal "done"). Polls only while pending; gives up after
 * `RESYNC_TIMEOUT_MS` and reports `timedOut`.
 */
export function useBlastResync(prId: string | null | undefined, repoId: string | null | undefined) {
  const qc = useQueryClient();
  const resync = useResyncRepoIntel(repoId);
  // `undefined` = never started; `null` = started while no index row existed yet.
  const [baseline, setBaseline] = React.useState<string | null | undefined>(undefined);
  const [timedOut, setTimedOut] = React.useState(false);

  const started = baseline !== undefined;
  const failed = started && resync.isError;
  // Read-only observer: reactive index state without owning the polling, so `finished` (which
  // decides whether to poll) can be derived from it during render.
  const updatedAt = useRepoIntelStatus(repoId).data?.updatedAt ?? null;
  const finished = started && updatedAt !== null && updatedAt !== baseline;
  const pending = started && !finished && !timedOut && !failed;
  // Same query key: the polling observer refreshes the cache the read-only one reads.
  useRepoIntelStatus(repoId, pending);

  // Syncs the blast query with the index state: refetch once, when the index advanced.
  React.useEffect(() => {
    if (finished) void qc.invalidateQueries({ queryKey: keys.pr.blast(prId) });
  }, [finished, prId, qc]);

  React.useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setTimedOut(true), RESYNC_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  const start = () => {
    setBaseline(updatedAt);
    setTimedOut(false);
    resync.mutate();
  };

  return { start, pending, timedOut, failed };
}
