/**
 * Polls a review run until it leaves `running`, then reads its review. Time and
 * sleeping are injected so tests run without real timers; the real sleep is
 * abortable, so a cancelled MCP request or a shutdown stops the timer at once.
 */
import { setTimeout as delay } from 'node:timers/promises';
import type { DevDigestApi } from './api/port.js';
import type { ReviewInfo, RunInfo } from './api/schemas.js';
import type { RunStatus } from './domain.js';

export const POLL_MS = 3_000;

/** The API's free-form run status → the four states the tools report. */
export function toRunStatus(status: string | null): RunStatus {
  switch (status) {
    case 'running':
    case 'done':
    case 'cancelled':
      return status;
    default:
      return 'failed';
  }
}

export interface WaitResult {
  state: 'done' | 'failed' | 'cancelled' | 'timeout' | 'aborted';
  run?: RunInfo;
  review?: ReviewInfo;
}

export interface WaitOptions {
  api: DevDigestApi;
  prId: string;
  runId: string;
  maxWaitMs: number;
  pollMs?: number;
  signal?: AbortSignal | undefined;
  /** Called once per poll while the run is still running. */
  onProgress?: ((elapsedMs: number) => void | Promise<void>) | undefined;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}

const realSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  delay(ms, undefined, signal ? { signal } : {});

export async function waitForRun(opts: WaitOptions): Promise<WaitResult> {
  const { api, prId, runId, maxWaitMs, signal, onProgress } = opts;
  const pollMs = opts.pollMs ?? POLL_MS;
  const sleep = opts.sleep ?? realSleep;
  const now = opts.now ?? Date.now;
  const started = now();

  // Sleeps `ms`; false when the wait was aborted meanwhile.
  const pause = async (ms: number): Promise<boolean> => {
    try {
      await sleep(ms, signal);
      return !signal?.aborted;
    } catch (err) {
      if (signal?.aborted) return false;
      throw err;
    }
  };

  try {
    for (;;) {
      if (signal?.aborted) return { state: 'aborted' };
      const run = (await api.listRuns(prId, signal)).find((r) => r.run_id === runId);

      const status = run ? toRunStatus(run.status) : 'running';
      if (run && status !== 'running') {
        if (status !== 'done') return { state: status, run };
        let review = (await api.reviews(prId, signal)).find((r) => r.run_id === runId);
        if (!review) {
          // The review row lands just before the run is marked done; allow one more poll.
          if (!(await pause(pollMs))) return { state: 'aborted' };
          review = (await api.reviews(prId, signal)).find((r) => r.run_id === runId);
        }
        return review ? { state: 'done', run, review } : { state: 'done', run };
      }

      const elapsed = now() - started;
      if (elapsed >= maxWaitMs) return run ? { state: 'timeout', run } : { state: 'timeout' };
      await onProgress?.(elapsed);
      if (!(await pause(Math.min(pollMs, maxWaitMs - elapsed)))) return { state: 'aborted' };
    }
  } catch (err) {
    // A client cancel aborts the in-flight fetch; that is a stop, not a failure.
    if (signal?.aborted) return { state: 'aborted' };
    throw err;
  }
}
