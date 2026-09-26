/* hooks/reviews.ts — React Query + SSE hooks for the A2 reviewer.
   Run a review, stream RunEvents live, act on findings. Query keys come from
   ../query-keys (hierarchical: `keys.pr.scope(id)` covers everything of one PR). */
"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, API_BASE } from "../api";
import { keys } from "../query-keys";
import type {
  FindingActionKind,
  PrReviewComment,
  ReviewRecord,
  ReviewRunResponse,
  RunEvent,
  RunSummary,
} from "@devdigest/shared";

// ---- Active (in-flight) runs — server-side source of truth ----
export interface ActiveRun {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  ran_at: string | null;
}

/** In-flight runs for a PR, from the server (agent_runs where status='running').
   Survives reloads/devices; polls while anything is running so it self-clears. */
export function usePrActiveRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: keys.pr.activeRuns(prId),
    queryFn: () => api.get<ActiveRun[]>(`/pulls/${prId}/runs/active`),
    enabled: !!prId,
    refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? 4000 : false),
  });
}

// ---- Full run history for a PR (every agent_runs row, any status) ----
/** All runs for a PR — done, failed (with error), cancelled, running. Survives
   reload (DB-backed). Polls while anything is running so it self-updates. */
export function usePrRuns(prId: string | null | undefined) {
  return useQuery({
    queryKey: keys.pr.runs(prId),
    queryFn: () => api.get<RunSummary[]>(`/pulls/${prId}/runs`),
    enabled: !!prId,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === "running") ? 4000 : false,
  });
}

// ---- Persisted reviews + findings for a PR ----
/**
 * `enabled: false` keeps the fetch lazy — the PR list only loads a row's findings
 * when its FINDINGS cell is hovered.
 */
export function usePrReviews(
  prId: string | null | undefined,
  opts?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: keys.pr.reviews(prId),
    queryFn: () => api.get<ReviewRecord[]>(`/pulls/${prId}/reviews`),
    enabled: !!prId && (opts?.enabled ?? true),
  });
}

/** Refresh what a run's start or end changes: its PR's run lists and reviews. */
function invalidateRuns(qc: QueryClient, prId: string | null | undefined) {
  if (!prId) return;
  void qc.invalidateQueries({ queryKey: keys.pr.activeRuns(prId) });
  void qc.invalidateQueries({ queryKey: keys.pr.runs(prId) });
  void qc.invalidateQueries({ queryKey: keys.pr.reviews(prId) });
}

/**
 * Live-run bookkeeping of the PR page: the server-sourced in-flight runs and the
 * history. `onRunsStarted` only nudges the active-runs query — it doubles as RunStatus's
 * SSE "done" callback (FindingsTab), since either event (a run starting, or its stream
 * ending) only means the active-runs LIST may have changed. The one full refresh (runs,
 * reviews, the PR list, intent, Smart Diff) happens exactly once, below, the moment that
 * refetch actually reports zero live runs — so an SSE `onDone` and the 4s poll can never
 * double-fire it for the same settle.
 */
export function usePrRunTracking(prId: string | null | undefined) {
  const qc = useQueryClient();
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: history } = usePrRuns(prId);
  const liveRunIds = React.useMemo(() => (activeRuns ?? []).map((r) => r.run_id), [activeRuns]);

  const onRunsStarted = React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: keys.pr.activeRuns(prId) });
  }, [qc, prId]);

  const onRunsSettled = React.useCallback(() => {
    invalidateRuns(qc, prId);
    void qc.invalidateQueries({ queryKey: keys.allPulls() });
    // A run derives the intent as shared pre-work when none is stored yet, so the
    // card's empty state must refresh once the run settles (no SSE event for this).
    void qc.invalidateQueries({ queryKey: keys.pr.intent(prId) });
    // Smart Diff's finding dots/counters read the reviews query indirectly
    // (`latestRoundFindings`), but the server's own `finding_lines` need a refetch too.
    void qc.invalidateQueries({ queryKey: keys.pr.smartDiff(prId) });
  }, [qc, prId]);

  // The SINGLE trigger for the full refresh: a >0 → 0 transition in the polled
  // active-runs count. This fires whether that transition was noticed through
  // RunStatus's SSE `onDone` (Findings tab — `onRunsStarted` reused as the done
  // callback, immediately refetching active-runs) or through the 4s poll alone (Files
  // changed tab, which never mounts RunStatus).
  const prevLiveCount = React.useRef(liveRunIds.length);
  React.useEffect(() => {
    if (prevLiveCount.current > 0 && liveRunIds.length === 0) onRunsSettled();
    prevLiveCount.current = liveRunIds.length;
  }, [liveRunIds.length, onRunsSettled]);

  return { liveRunIds, history, onRunsStarted };
}

/** Delete one run from the PR's run history (+ its trace). */
export function useDeleteRun(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.del<{ ok: boolean }>(`/runs/${runId}`),
    // Deleting a run also deletes the review it produced (server-side), so drop
    // the timeline, the Review Runs list and the PR list's rollups from cache.
    onSuccess: () => {
      invalidateRuns(qc, prId);
      void qc.invalidateQueries({ queryKey: keys.allPulls() });
    },
  });
}

/** Request cancellation of an in-flight run (takes effect at the next step). */
export function useCancelRun(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.post<{ ok: boolean }>(`/runs/${runId}/cancel`),
    // The run leaves "running" in the DB right away: the live section must follow.
    onSuccess: () => invalidateRuns(qc, prId),
  });
}

/** Delete a whole review run (one agent's pass) + its findings. */
export function useDeleteReview(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => api.del<{ ok: boolean }>(`/reviews/${reviewId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.pr.reviews(prId) });
      void qc.invalidateQueries({ queryKey: keys.allPulls() });
    },
  });
}

// ---- Inline review comments on the "Files changed" tab (proxied to GitHub) --
/** Existing GitHub PR review comments, fetched live. */
export function usePrComments(prId: string | null | undefined) {
  return useQuery({
    queryKey: keys.pr.comments(prId),
    queryFn: () => api.get<PrReviewComment[]>(`/pulls/${prId}/comments`),
    enabled: !!prId,
  });
}

export interface CreateCommentInput {
  path: string;
  line: number;
  side?: "LEFT" | "RIGHT";
  body: string;
  in_reply_to?: number;
}

/** Post one inline comment (or reply) to GitHub; refreshes the thread list. */
export function useCreatePrComment(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCommentInput) =>
      api.post<PrReviewComment>(`/pulls/${prId}/comments`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.pr.comments(prId) }),
  });
}

// ---- Run a review (all enabled agents or a specific agent) ----
export interface RunReviewInput {
  prId: string;
  agentId?: string;
  all?: boolean;
}

export function useRunReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentId, all }: RunReviewInput) =>
      api.post<ReviewRunResponse>(`/pulls/${prId}/review`, {
        ...(agentId ? { agentId } : {}),
        ...(all ? { all } : {}),
      }),
    // The new runs are "running" already: show them in the live section and the history.
    onSuccess: (_d, { prId }) => invalidateRuns(qc, prId),
  });
}

// ---- Finding actions (accept/dismiss) ----
export function useFindingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      findingId,
      action,
      reply,
    }: {
      findingId: string;
      action: FindingActionKind;
      reply?: string;
      prId: string;
    }) =>
      api.post<{ finding: ReviewRecord["findings"][number]; memoryId?: string }>(
        `/findings/${findingId}/${action}`,
        reply ? { reply } : undefined,
      ),
    onSuccess: (_d, { prId }) => qc.invalidateQueries({ queryKey: keys.pr.reviews(prId) }),
  });
}

export interface RunEventsOptions {
  /** Called for every new event, once each (never for a replay the hook already saw). */
  onEvent?: (event: RunEvent) => void;
  /** Called once when every stream this hook opened has ended (not on unmount). */
  onSettled?: () => void;
}

// The server names each SSE frame after the event kind, and closes a finished run's
// stream with a terminal `done` frame — a stream that ends without it was dropped.
const EVENT_KINDS = ["info", "tool", "result", "error"] as const;

/**
 * Subscribe to the SSE event streams of `runIds`. Returns the accumulated RunEvents
 * (each `runId:seq` once, even when a reconnect replays it) and `running` — true while
 * any stream is open. A stream ends on the server's `done` frame or when the browser
 * gives up on it; a plain network drop is left to EventSource, which reconnects and
 * resumes from the last event id. Changing `runIds` opens the new streams and closes
 * the removed ones without touching the rest.
 */
export function useRunEvents(runIds: string[], options: RunEventsOptions = {}) {
  const [events, setEvents] = React.useState<RunEvent[]>([]);
  const [openCount, setOpenCount] = React.useState(0);

  // Latest callbacks in refs: a parent passing fresh arrows must not reopen the streams.
  const handlers = React.useRef(options);
  React.useEffect(() => {
    handlers.current = options;
  });

  const sources = React.useRef(new Map<string, EventSource>());
  const open = React.useRef(new Set<string>());
  const finished = React.useRef(new Set<string>());
  const seen = React.useRef(new Set<string>());
  const key = [...new Set(runIds)].sort().join(",");

  React.useEffect(() => {
    const wanted = new Set(key ? key.split(",") : []);

    /** Stop tracking a run's stream; `ended` = the run itself finished (vs. removed/unmounted). */
    const close = (runId: string, ended: boolean) => {
      sources.current.get(runId)?.close();
      sources.current.delete(runId);
      if (!open.current.delete(runId)) return;
      if (ended) finished.current.add(runId);
      setOpenCount(open.current.size);
      if (ended && open.current.size === 0) handlers.current.onSettled?.();
    };

    const connect = (runId: string) => {
      const es = new EventSource(`${API_BASE}/runs/${runId}/events`);
      const onFrame = (ev: MessageEvent) => {
        let parsed: RunEvent;
        try {
          parsed = JSON.parse(ev.data) as RunEvent;
        } catch {
          return; // keepalive / dataless frame
        }
        const id = `${parsed.runId}:${parsed.seq}`;
        if (seen.current.has(id)) return;
        seen.current.add(id);
        setEvents((prev) => [...prev, parsed]);
        handlers.current.onEvent?.(parsed);
      };
      // the server also sends events as default messages in some clients — listen broadly
      es.onmessage = onFrame;
      for (const kind of EVENT_KINDS) es.addEventListener(kind, onFrame as EventListener);
      es.addEventListener("done", () => close(runId, true));
      es.onerror = () => {
        // CLOSED = the browser gave up (e.g. 404 for a run that no longer exists);
        // CONNECTING = it is retrying, and will resume from Last-Event-ID.
        if (es.readyState === EventSource.CLOSED) close(runId, true);
      };
      sources.current.set(runId, es);
      open.current.add(runId);
    };

    for (const runId of [...sources.current.keys()]) {
      if (!wanted.has(runId)) close(runId, false);
    }
    let added = false;
    for (const runId of wanted) {
      if (sources.current.has(runId) || finished.current.has(runId)) continue;
      connect(runId);
      added = true;
    }
    if (added) setOpenCount(open.current.size);
  }, [key]);

  // Close everything on unmount. (The next mount, e.g. StrictMode's, reopens what is
  // still wanted: `finished` and `seen` survive, so nothing repeats.)
  React.useEffect(() => {
    const streams = sources.current;
    const openSet = open.current;
    return () => {
      for (const es of streams.values()) es.close();
      streams.clear();
      openSet.clear();
    };
  }, []);

  return { events, running: openCount > 0 };
}
