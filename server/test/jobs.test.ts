import { describe, it, expect, afterEach } from 'vitest';
import { JobRunner } from '../src/platform/jobs.js';
import type { Db } from '../src/db/client.js';

/**
 * JobRunner mirrors every job into the `jobs` table; these tests record those
 * writes through a fake Db (no Postgres) and check what a job ends up as.
 */

/** Just enough of Drizzle's insert/update chains for JobRunner; records the writes. */
function fakeDb() {
  const updates: Record<string, unknown>[] = [];
  let seq = 0;
  const db = {
    insert: () => ({
      values: () => ({ returning: async () => [{ id: `job-${++seq}` }] }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          updates.push(patch);
        },
      }),
    }),
  };
  return { db: db as unknown as Db, updates };
}

const tick = () => new Promise((r) => setImmediate(r));

describe('JobRunner', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  afterEach(() => {
    unhandled.length = 0;
  });

  // Callers fire-and-forget `enqueue()`; a rejected `done` nobody catches would be
  // an unhandled rejection, which exits a Node 22 process.
  it('records a failed job without an unhandled rejection', async () => {
    const { db, updates } = fakeDb();
    const jobs = new JobRunner(db, { retries: 0, timeoutMs: 1_000 });
    jobs.register('boom', async () => {
      throw new Error('clone failed');
    });

    await jobs.enqueue('ws', 'boom', {});
    await jobs.onIdle();
    await tick();

    expect(updates.at(-1)).toMatchObject({ status: 'failed', error: 'clone failed' });
    expect(unhandled).toEqual([]);
  });

  it('still lets a caller await the failure through `done`', async () => {
    const { db } = fakeDb();
    const jobs = new JobRunner(db, { retries: 0, timeoutMs: 1_000 });
    jobs.register('boom', async () => {
      throw new Error('clone failed');
    });

    const job = await jobs.enqueue('ws', 'boom', {});
    await expect(job.done).rejects.toThrow('clone failed');
  });

  it('counts attempts across retries and keeps the count on success', async () => {
    const { db, updates } = fakeDb();
    const jobs = new JobRunner(db, { retries: 2, timeoutMs: 1_000 });
    let calls = 0;
    jobs.register('flaky', async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('503'), { status: 503 });
    });

    await (await jobs.enqueue('ws', 'flaky', {})).done;

    expect(updates.filter((u) => 'attempts' in u).map((u) => u.attempts)).toEqual([1, 2, 3]);
    expect(updates.at(-1)).toMatchObject({ status: 'done' });
  });

  it('aborts the handler signal when an attempt times out', async () => {
    const { db, updates } = fakeDb();
    const jobs = new JobRunner(db, { retries: 0, timeoutMs: 20 });
    let aborted = false;
    jobs.register('slow', (_payload, { signal }) => {
      return new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(signal.reason);
        });
      });
    });

    const job = await jobs.enqueue('ws', 'slow', {});
    await expect(job.done).rejects.toThrow(/timed out/);
    expect(aborted).toBe(true);
    expect(updates.at(-1)).toMatchObject({ status: 'failed' });
  });

  it('never overlaps two jobs with the same serializeBy key', async () => {
    const { db } = fakeDb();
    const jobs = new JobRunner(db, { concurrency: 3, retries: 0, timeoutMs: 1_000 });
    let running = 0;
    let peak = 0;
    const order: string[] = [];
    jobs.register(
      'git',
      async (payload) => {
        const { repoId, tag } = payload as { repoId: string; tag: string };
        running += 1;
        peak = Math.max(peak, running);
        order.push(`start ${repoId}:${tag}`);
        await new Promise((r) => setTimeout(r, 10));
        order.push(`end ${repoId}:${tag}`);
        running -= 1;
      },
      { serializeBy: (p) => (p as { repoId: string }).repoId },
    );

    await jobs.enqueue('ws', 'git', { repoId: 'a', tag: '1' });
    await jobs.enqueue('ws', 'git', { repoId: 'a', tag: '2' });
    await jobs.onIdle();

    expect(peak).toBe(1);
    expect(order).toEqual(['start a:1', 'end a:1', 'start a:2', 'end a:2']);
  });

  it('runs jobs with different keys side by side', async () => {
    const { db } = fakeDb();
    const jobs = new JobRunner(db, { concurrency: 3, retries: 0, timeoutMs: 1_000 });
    let running = 0;
    let peak = 0;
    jobs.register(
      'git',
      async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 10));
        running -= 1;
      },
      { serializeBy: (p) => (p as { repoId: string }).repoId },
    );

    await jobs.enqueue('ws', 'git', { repoId: 'a' });
    await jobs.enqueue('ws', 'git', { repoId: 'b' });
    await jobs.onIdle();

    expect(peak).toBe(2);
  });

  it('on shutdown aborts running jobs, fails waiting ones and refuses new ones', async () => {
    const { db, updates } = fakeDb();
    const jobs = new JobRunner(db, { concurrency: 1, retries: 0, timeoutMs: 10_000 });
    jobs.register('wait', (_payload, { signal }) => {
      return new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason));
      });
    });

    const running = await jobs.enqueue('ws', 'wait', {});
    const waiting = await jobs.enqueue('ws', 'wait', {});
    await tick();
    await jobs.shutdown(1_000);

    await expect(running.done).rejects.toThrow(/shut down/);
    await expect(waiting.done).rejects.toThrow(/shut down/);
    expect(updates.filter((u) => u.status === 'failed')).toHaveLength(2);
    await expect(jobs.enqueue('ws', 'wait', {})).rejects.toThrow(/shut down/);
  });
});
