import type { RunEvent, RunEventKind } from '@devdigest/shared';

/**
 * Contracts shared by modules (core: types and constants only). The platform
 * implements them — `platform/jobs.ts` (JobRunner) → JobQueue, `platform/sse.ts`
 * (RunBus) → RunBusPort — and services depend on the interfaces.
 */

export interface JobContext {
  jobId: string;
  /** Aborted when the attempt times out or the server shuts down. */
  signal: AbortSignal;
}

export type JobHandler = (payload: unknown, ctx: JobContext) => Promise<void>;

export interface JobQueue {
  enqueue(workspaceId: string, kind: string, payload: unknown): Promise<{ id: string }>;
  register(
    kind: string,
    handler: JobHandler,
    opts?: { serializeBy?: (payload: unknown) => string },
  ): void;
}

/** Live run-event bus: per-run replay buffer + subscribers + cancellation flags. */
export interface RunBusPort {
  publish(runId: string, kind: RunEventKind, msg: string, data?: unknown): RunEvent;
  subscribe(runId: string, listener: (e: RunEvent) => void): () => void;
  /** The full buffered log of a run (persisted as the trace on completion). */
  buffer(runId: string): RunEvent[];
  complete(runId: string): void;
  cancel(runId: string): void;
  isCancelled(runId: string): boolean;
  isComplete(runId: string): boolean;
  onDone(runId: string, listener: () => void): () => void;
  /** Whether the bus holds anything for the run (live, or completed and still retained). */
  knows(runId: string): boolean;
}

// Job kinds enqueued across modules. Clone is owned by repos; the index kinds by
// repo-intel (re-exported from its constants), enqueued by repos after a clone.
export const CLONE_JOB_KIND = 'clone';
export const INDEX_JOB_KIND = 'repo-intel-index';
export const REFRESH_JOB_KIND = 'repo-intel-refresh';
/** Manual "re-analyze": fetch latest from origin + incremental reindex. */
export const RESYNC_JOB_KIND = 'repo-intel-resync';

/**
 * Job serialisation key for work on one repo's clone directory. Clone, refresh,
 * index and resync jobs all touch `<cloneDir>/<owner>/<name>` (git fetch/reset,
 * a delete-and-reclone, a full reindex), so they must not overlap for the same
 * repo. Every such payload carries `repoId`.
 */
export function repoJobKey(payload: unknown): string {
  return `repo:${(payload as { repoId: string }).repoId}`;
}
