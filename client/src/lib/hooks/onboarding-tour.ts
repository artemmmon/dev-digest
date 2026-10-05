/* hooks/onboarding-tour.ts — React Query hooks for the Onboarding Tour page.
     GET  /repos/:id/onboarding           → TourRead  (the stored tour or null + the generation state)
     POST /repos/:id/onboarding/generate  → TourGenerationStarted (202; 409 generation_in_progress) */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { keys } from "../query-keys";
import type { TourGenerationStarted, TourRead } from "@devdigest/shared";

/** How often the page re-reads the tour while a generation runs, so a finished one appears by itself. */
const POLL_MS = 1500;

/** The repo's stored tour and generation state. Polls only while a generation is running. */
export function useOnboardingTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: keys.onboardingTour(repoId),
    queryFn: () => api.get<TourRead>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    refetchInterval: (query) => (query.state.data?.generation.status === "running" ? POLL_MS : false),
  });
}

/**
 * Start (or restart) a generation. The server answers 202 at once and runs it in the background; the
 * answer's generation state goes straight into the cached read so the page shows "running" without
 * waiting for the poll. Errors are shown by the page itself, hence `silent`.
 */
export function useGenerateOnboardingTour(repoId: string | null | undefined) {
  const qc = useQueryClient();
  const key = keys.onboardingTour(repoId);
  return useMutation({
    mutationFn: () => api.post<TourGenerationStarted>(`/repos/${repoId}/onboarding/generate`),
    meta: { silent: true },
    onSuccess: (started) => {
      qc.setQueryData<TourRead>(key, (read) => (read ? { ...read, generation: started.generation } : read));
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (error) => {
      // Another tab (or an earlier click) already runs one: re-read, and the page shows that run.
      if (error instanceof ApiError && error.code === "generation_in_progress") {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}
