/* hooks/intent.ts — React Query hooks for the PR Overview "INTENT" card.
   GET /pulls/:id/intent (stored intent + stale flag, no LLM call) and
   POST /pulls/:id/intent (derive / re-derive; the card's Derive / Re-derive button). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { keys } from "../query-keys";
import type { PrIntent, PrIntentResponse } from "@devdigest/shared";

/**
 * The PR's stored intent (or null if none has been derived yet) plus staleness.
 * `stale` compares against the PR row's head SHA, which only the PR-detail GET
 * refreshes — so pass the detail's `headSha`: the query waits for it and refetches
 * when a push moves the head, instead of racing the detail refresh.
 */
export function usePrIntent(prId: string | null | undefined, headSha?: string | null) {
  return useQuery({
    queryKey: [...keys.pr.intent(prId), headSha ?? null] as const,
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId && headSha !== undefined,
  });
}

/** Derive (or re-derive) the PR's intent. Refetches the GET so `stale` is recomputed
   against the current head SHA rather than assumed false from the POST response. */
export function useDeriveIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntent>(`/pulls/${prId}/intent`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.pr.intent(prId) }),
  });
}
