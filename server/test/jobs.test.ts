import { describe, it, expect, afterEach } from 'vitest';
import { JobRunner } from '../src/platform/jobs.js';
import type { Db } from '../src/db/client.js';

/**
 * A failing job must end as `failed` in the table and nothing else: callers
 * fire-and-forget `enqueue()`, so a rejected `done` that nobody catches would be
 * an unhandled rejection, which exits a Node 22 process.
 */

/** Just enough of Drizzle's insert/update chains for JobRunner; records the writes. */
function fakeDb() {
  const updates: Record<string, unknown>[] = [];
  const db = {
    insert: () => ({
      values: () => ({ returning: async () => [{ id: 'job-1' }] }),
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

describe('JobRunner', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  afterEach(() => {
    unhandled.length = 0;
  });

  it('records a failed job without an unhandled rejection', async () => {
    const { db, updates } = fakeDb();
    const jobs = new JobRunner(db, { retries: 0, timeoutMs: 1_000 });
    jobs.register('boom', async () => {
      throw new Error('clone failed');
    });

    await jobs.enqueue('ws', 'boom', {}); // fire-and-forget, like the services do
    await jobs.onIdle();
    await new Promise((r) => setImmediate(r)); // let Node report unhandled rejections

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
});
