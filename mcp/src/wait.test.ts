import { describe, expect, it, vi } from 'vitest';
import { waitForRun, type WaitOptions } from './wait.js';
import { FakeApi, PR_ID, RUN_ID, review, run } from './test-support/fake-api.js';

/** A fake clock: `sleep` advances time instead of waiting. */
function clock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

function opts(api: FakeApi, over: Partial<WaitOptions> = {}): WaitOptions {
  const c = clock();
  return { api, prId: PR_ID, runId: RUN_ID, maxWaitMs: 30_000, pollMs: 3000, now: c.now, sleep: c.sleep, ...over };
}

describe('waitForRun', () => {
  it('returns done with the review once the run leaves running', async () => {
    const api = new FakeApi();
    api.runsSequence = [[run({ status: 'running' })], [run({ status: 'running' })], [run()]];
    const res = await waitForRun(opts(api));
    expect(res.state).toBe('done');
    expect(res.review?.id).toBe('rev-1');
    expect(api.count('listRuns')).toBe(3);
  });

  it('times out with state timeout after maxWaitMs and stops polling', async () => {
    const api = new FakeApi();
    api.runsSequence = [[run({ status: 'running' })]];
    const c = clock();
    const res = await waitForRun(opts(api, { maxWaitMs: 10_000, now: c.now, sleep: c.sleep }));
    expect(res.state).toBe('timeout');
    // polls at t=0,3,6,9,10(last sleep is clamped to the remaining 1 s)
    expect(c.sleeps).toEqual([3000, 3000, 3000, 1000]);
    expect(api.count('listRuns')).toBe(5);
  });

  it('reports failed and cancelled runs with the run row', async () => {
    const failed = new FakeApi();
    failed.runsSequence = [[run({ status: 'failed', error: 'no key' })]];
    expect(await waitForRun(opts(failed))).toMatchObject({ state: 'failed', run: { error: 'no key' } });

    const cancelled = new FakeApi();
    cancelled.runsSequence = [[run({ status: 'cancelled' })]];
    expect((await waitForRun(opts(cancelled))).state).toBe('cancelled');
    expect(cancelled.count('reviews')).toBe(0);
  });

  it('retries the review lookup once when the review row is not there yet', async () => {
    const api = new FakeApi();
    api.reviewsList = [];
    const c = clock();
    const res = await waitForRun(opts(api, { now: c.now, sleep: c.sleep }));
    expect(res.state).toBe('done');
    expect(res.review).toBeUndefined();
    expect(api.count('reviews')).toBe(2);
    expect(c.sleeps).toEqual([3000]);
  });

  it('calls onProgress once per poll while running', async () => {
    const api = new FakeApi();
    api.runsSequence = [[run({ status: 'running' })], [run({ status: 'running' })], [run({ status: 'running' })], [run()]];
    const onProgress = vi.fn();
    await waitForRun(opts(api, { onProgress }));
    expect(onProgress.mock.calls.map((c) => c[0])).toEqual([0, 3000, 6000]);
  });

  it('stops at once when aborted mid-wait, with no further polls', async () => {
    const api = new FakeApi();
    api.runsSequence = [[run({ status: 'running' })]];
    const ctrl = new AbortController();
    const res = await waitForRun(
      opts(api, {
        signal: ctrl.signal,
        sleep: async () => {
          ctrl.abort();
          throw ctrl.signal.reason;
        },
      }),
    );
    expect(res.state).toBe('aborted');
    expect(api.count('listRuns')).toBe(1);
  });

  it('an already-aborted signal makes no API call', async () => {
    const api = new FakeApi();
    const res = await waitForRun(opts(api, { signal: AbortSignal.abort() }));
    expect(res.state).toBe('aborted');
    expect(api.calls).toEqual([]);
  });

  it('the real sleep is abortable', async () => {
    const api = new FakeApi();
    api.runsSequence = [[run({ status: 'running' })]];
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 20);
    const started = Date.now();
    const res = await waitForRun({
      api,
      prId: PR_ID,
      runId: RUN_ID,
      maxWaitMs: 60_000,
      pollMs: 30_000,
      signal: ctrl.signal,
    });
    expect(res.state).toBe('aborted');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('propagates a real API error', async () => {
    const api = new FakeApi();
    api.failures.set('listRuns', new Error('boom'));
    await expect(waitForRun(opts(api))).rejects.toThrow('boom');
  });

  it('keeps polling when the run is not listed yet', async () => {
    const api = new FakeApi();
    api.runsSequence = [[], [run()]];
    expect((await waitForRun(opts(api))).state).toBe('done');
    void review;
  });
});
