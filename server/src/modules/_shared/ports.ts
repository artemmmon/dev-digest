/**
 * Background-job contract shared by modules (core: types and constants only).
 * `platform/jobs.ts` (JobRunner) implements JobQueue; services depend on this.
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
