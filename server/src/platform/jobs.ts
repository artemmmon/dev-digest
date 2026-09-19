import PQueue from 'p-queue';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import * as t from '../db/schema.js';
import { withTimeout, withRetry } from './resilience.js';
import type { JobContext, JobHandler, JobQueue } from '../modules/_shared/ports.js';

/**
 * JobRunner — async work (clone, PR import, indexing, polling) on a
 * concurrency-limited p-queue, mirrored into the `jobs` table with
 * timeouts + retry/backoff.
 *
 * Handlers are registered by kind. enqueue() inserts a `jobs` row, schedules
 * the handler on the queue, and updates status/attempts/error as it runs.
 *
 * A timeout rejects the attempt AND aborts `ctx.signal`; handlers pass the
 * signal to long operations (e.g. `git clone`) so the work really stops. Jobs
 * registered with `serializeBy` never overlap for the same key, even when an
 * aborted handler takes a moment to wind down.
 */

export type { JobContext, JobHandler };

export interface JobRegistration {
  /** Jobs whose payloads map to the same key run one at a time (e.g. `repo:<id>`). */
  serializeBy?: (payload: unknown) => string;
}

export interface JobRunnerOptions {
  concurrency?: number;
  timeoutMs?: number;
  retries?: number;
}

export interface EnqueuedJob {
  id: string;
  /** Resolves when the job finishes (or rejects if it ultimately fails). */
  done: Promise<void>;
}

/**
 * How long a timed-out attempt waits for its handler to honour the abort before
 * giving the slot (and the key) back anyway. Handlers that ignore the signal
 * (the repo-intel pipeline today) could otherwise hold a queue slot forever.
 */
const ABORT_GRACE_MS = 30_000;

class ShutdownError extends Error {
  constructor() {
    super('Server shut down before the job finished');
    this.name = 'ShutdownError';
  }
}

export class JobRunner implements JobQueue {
  private queue: PQueue;
  private handlers = new Map<string, { handler: JobHandler; opts: JobRegistration }>();
  /** Per-key tail of the chain: the next job for a key starts after this settles. */
  private keyTails = new Map<string, Promise<void>>();
  /** Aborts every in-flight attempt on shutdown. */
  private lifetime = new AbortController();
  private timeoutMs: number;
  private retries: number;

  constructor(
    private db: Db,
    opts: JobRunnerOptions = {},
  ) {
    this.queue = new PQueue({ concurrency: opts.concurrency ?? 3 });
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.retries = opts.retries ?? 2;
  }

  register(kind: string, handler: JobHandler, opts: JobRegistration = {}): void {
    this.handlers.set(kind, { handler, opts });
  }

  async enqueue(workspaceId: string, kind: string, payload: unknown): Promise<EnqueuedJob> {
    const registered = this.handlers.get(kind);
    if (!registered) throw new Error(`No job handler registered for kind '${kind}'`);
    if (this.lifetime.signal.aborted) throw new ShutdownError();

    const [row] = await this.db
      .insert(t.jobs)
      .values({ workspaceId, kind, payload: payload as object, status: 'queued' })
      .returning({ id: t.jobs.id });
    const jobId = row!.id;

    const key = registered.opts.serializeBy?.(payload);
    const run = () => this.runJob(jobId, registered.handler, payload);
    const done = this.queue.add(() => (key ? this.serialized(key, run) : run())) as Promise<void>;
    // Callers fire-and-forget; the failure is already persisted by runJob. Without
    // a handler attached here, a failed job is an unhandled rejection and Node 22
    // exits the process. Callers that await `done` still see the rejection.
    done.catch(() => {});

    return { id: jobId, done };
  }

  private async runJob(jobId: string, handler: JobHandler, payload: unknown): Promise<void> {
    try {
      if (this.lifetime.signal.aborted) throw new ShutdownError();
      await this.db
        .update(t.jobs)
        .set({ status: 'running', startedAt: new Date() })
        .where(eq(t.jobs.id, jobId));
      let attempts = 0;
      await withRetry(
        async () => {
          attempts += 1;
          await this.db.update(t.jobs).set({ attempts }).where(eq(t.jobs.id, jobId));
          await this.attempt(jobId, handler, payload);
        },
        { retries: this.retries },
      );
      await this.db
        .update(t.jobs)
        .set({ status: 'done', finishedAt: new Date() })
        .where(eq(t.jobs.id, jobId));
    } catch (err) {
      await this.db
        .update(t.jobs)
        .set({
          status: 'failed',
          finishedAt: new Date(),
          error: (err as Error).message,
        })
        .where(eq(t.jobs.id, jobId));
      throw err;
    }
  }

  /**
   * One attempt under the timeout. On timeout (or shutdown) the signal is
   * aborted and the attempt rejects — but only once the handler has settled
   * (or ABORT_GRACE_MS passed), so a retry or the next job for the same key
   * doesn't run alongside a handler that is still winding down.
   */
  private async attempt(jobId: string, handler: JobHandler, payload: unknown): Promise<void> {
    const controller = new AbortController();
    const onShutdown = () => controller.abort(new ShutdownError());
    this.lifetime.signal.addEventListener('abort', onShutdown, { once: true });
    const work = handler(payload, { jobId, signal: controller.signal });
    try {
      await withTimeout(work, this.timeoutMs);
    } catch (err) {
      controller.abort(err);
      await settledOrAfter(work, ABORT_GRACE_MS);
      throw err;
    } finally {
      this.lifetime.signal.removeEventListener('abort', onShutdown);
    }
  }

  /** Chain `run` after the previous job for `key`. A waiting job holds its queue slot. */
  private serialized(key: string, run: () => Promise<void>): Promise<void> {
    const previous = this.keyTails.get(key) ?? Promise.resolve();
    const current = previous.then(run);
    const tail = current.then(
      () => undefined,
      () => undefined,
    );
    this.keyTails.set(key, tail);
    void tail.then(() => {
      if (this.keyTails.get(key) === tail) this.keyTails.delete(key);
    });
    return current;
  }

  /**
   * Stop for app shutdown: refuse new jobs, abort the running ones, and wait up
   * to `graceMs` for the queue to drain. Jobs still waiting fail fast with a
   * ShutdownError, so both kinds end as `failed` instead of staying
   * `queued`/`running` forever (nothing re-queues them on boot).
   */
  async shutdown(graceMs = 5_000): Promise<void> {
    this.lifetime.abort(new ShutdownError());
    await settledOrAfter(this.queue.onIdle(), graceMs);
  }

  /** Wait for the queue to drain (useful in tests). */
  async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }
}

/** Resolve when `p` settles (either way) or after `ms`, whichever comes first. */
async function settledOrAfter(p: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    p.then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    }),
  ]);
  clearTimeout(timer);
}
