import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunBus } from '../src/platform/sse.js';

/**
 * RunBus lives for the whole process, so a completed run must not keep its
 * buffer forever — but a late SSE subscriber must still get the replay for a while.
 */

describe('RunBus retention', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('replays a completed run to a late subscriber, then forgets it', () => {
    vi.useFakeTimers();
    const bus = new RunBus(1_000);
    bus.publish('r1', 'info', 'hello');
    bus.complete('r1');

    const seen: string[] = [];
    bus.subscribe('r1', (e) => seen.push(e.msg))();
    expect(seen).toEqual(['hello']);
    expect(bus.isComplete('r1')).toBe(true);

    vi.advanceTimersByTime(1_000);
    expect(bus.knows('r1')).toBe(false);
    expect(bus.isComplete('r1')).toBe(false);
    expect(bus.buffer('r1')).toEqual([]);
  });

  it('does not know a run nothing was published for', () => {
    expect(new RunBus().knows('never-published')).toBe(false);
  });
});
