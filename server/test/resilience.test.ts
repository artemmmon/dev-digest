import { describe, it, expect, vi, afterEach } from 'vitest';
import { TimeoutError, withRetry, withTimeout } from '../src/platform/resilience.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('withTimeout', () => {
  it('passes the result through when the promise wins', async () => {
    await expect(withTimeout(Promise.resolve(7), 1_000)).resolves.toBe(7);
  });

  it('rejects with TimeoutError when the promise is too slow', async () => {
    vi.useFakeTimers();
    const slow = new Promise<number>(() => undefined);
    const result = withTimeout(slow, 50);
    const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it('propagates the promise’s own rejection', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1_000)).rejects.toThrow('boom');
  });

  it('is a no-op for a zero or negative budget', async () => {
    await expect(withTimeout(Promise.resolve('x'), 0)).resolves.toBe('x');
    await expect(withTimeout(Promise.resolve('y'), -5)).resolves.toBe('y');
  });
});

describe('withRetry', () => {
  const transient = () => Object.assign(new Error('503'), { status: 503 });

  it('retries a transient failure and returns the eventual result', async () => {
    let calls = 0;
    const onRetry = vi.fn();
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw transient();
        return 'ok';
      },
      { retries: 3, baseDelayMs: 1, maxDelayMs: 2, onRetry },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(onRetry.mock.calls.map(([attempt]) => attempt)).toEqual([1, 2]);
  });

  it('does not retry a client error (4xx) or an unknown error', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw Object.assign(new Error('nope'), { status: 404 });
        },
        { retries: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow('nope');
    expect(calls).toBe(1);
  });

  it('retries 429 and network resets', async () => {
    for (const err of [
      Object.assign(new Error('slow down'), { status: 429 }),
      Object.assign(new Error('reset'), { code: 'ECONNRESET' }),
    ]) {
      let calls = 0;
      await withRetry(
        async () => {
          calls += 1;
          if (calls === 1) throw err;
        },
        { retries: 1, baseDelayMs: 1 },
      );
      expect(calls).toBe(2);
    }
  });

  it('gives up after `retries` and throws the last error', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw transient();
        },
        { retries: 2, baseDelayMs: 1, maxDelayMs: 1 },
      ),
    ).rejects.toThrow('503');
    expect(calls).toBe(3); // first try + 2 retries
  });

  it('honours a custom isRetryable', async () => {
    let calls = 0;
    await withRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw new Error('flaky');
      },
      { retries: 1, baseDelayMs: 1, isRetryable: (e) => (e as Error).message === 'flaky' },
    );
    expect(calls).toBe(2);
  });
});
