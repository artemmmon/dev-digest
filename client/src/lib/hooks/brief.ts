/* hooks/brief.ts — React Query hooks for the PR Overview "PR Brief" block.
   GET /pulls/:id/brief (stored brief + stale flag, no LLM call) and
   POST /pulls/:id/brief (generate / re-run; the block's Generate brief and refresh buttons). */
"use client";

import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { keys } from "../query-keys";
import type { PrBrief, PrBriefResponse } from "@devdigest/shared";

/**
 * The PR's stored brief (or null if none has been generated yet) plus staleness.
 * `stale` compares against the PR row's head SHA, which only the PR-detail GET
 * refreshes — so pass the detail's `headSha`: the query waits for it and refetches
 * when a push moves the head (same contract as `usePrIntent`).
 */
export function usePrBrief(prId: string | null | undefined, headSha?: string | null) {
  return useQuery({
    queryKey: [...keys.pr.brief(prId), headSha ?? null] as const,
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId && headSha !== undefined,
  });
}

/**
 * Generate (or re-run) the PR's brief. The error shows inline in the block, so the global
 * mutation toast is silenced. The mutation is keyed, and `generating` is derived from the cache
 * (`useIsMutating`), not from this observer: OverviewTab unmounts on a tab switch while the POST
 * keeps running, and a remounted block must still see it in flight (the controls stay disabled).
 * `onSettled` is a mutation-level option, so it also fires for such an orphaned run: it refetches
 * the stored brief (success or failure) and returns the promise, so the mutation stays pending
 * until the refetched GET is in the cache and the block never flashes the old state.
 */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  const mutationKey = [...keys.pr.brief(prId), "generate"] as const;
  const mutation = useMutation({
    mutationKey,
    mutationFn: () => api.post<PrBrief>(`/pulls/${prId}/brief`),
    meta: { silent: true },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.pr.brief(prId) }),
  });
  const generating = useIsMutating({ mutationKey }) > 0;
  return { ...mutation, generating };
}

export type GenerateBrief = ReturnType<typeof useGenerateBrief>;
