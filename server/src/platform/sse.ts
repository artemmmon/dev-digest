import { EventEmitter } from 'node:events';
import type { RunEvent, RunEventKind } from '@devdigest/shared';

/**
 * SSE / run-log bus.
 *
 * During a run, events are pushed to an in-memory buffer and emitted live to
 * any SSE subscriber on `/runs/:id/events`. On completion the full log is
 * persisted as ONE document in `run_traces` (done by the service layer, not here).
 *
 * Event shape on the wire (SSE `data`): RunEvent (see @devdigest/shared).
 */

/** Wall-clock time-of-day (HH:MM:SS, local) stamped on each log line. */
function clockTime(): string {
  return new Date().toTimeString().slice(0, 8);
}

/** How long a completed run's buffer stays replayable for late subscribers. */
const COMPLETED_RETENTION_MS = 5 * 60_000;

export class RunBus {
  constructor(private retentionMs = COMPLETED_RETENTION_MS) {}

  private emitters = new Map<string, EventEmitter>();
  private buffers = new Map<string, RunEvent[]>();
  private seq = new Map<string, number>();
  private completed = new Set<string>();
  private cancelled = new Set<string>();

  /** Request cancellation of an in-flight run. The runner checks `isCancelled`
   *  at its next checkpoint (between map-reduce files) and stops. */
  cancel(runId: string): void {
    this.cancelled.add(runId);
  }

  /** Whether cancellation has been requested for a run. */
  isCancelled(runId: string): boolean {
    return this.cancelled.has(runId);
  }

  private emitterFor(runId: string): EventEmitter {
    let e = this.emitters.get(runId);
    if (!e) {
      e = new EventEmitter();
      e.setMaxListeners(50);
      this.emitters.set(runId, e);
      // Preserve any existing buffer/seq (e.g. a late subscriber after the run
      // completed must still be able to replay the buffered events).
      if (!this.buffers.has(runId)) this.buffers.set(runId, []);
      if (!this.seq.has(runId)) this.seq.set(runId, 0);
    }
    return e;
  }

  /** Publish a live event for a run. Returns the constructed RunEvent. */
  publish(runId: string, kind: RunEventKind, msg: string, data?: unknown): RunEvent {
    const e = this.emitterFor(runId);
    const next = (this.seq.get(runId) ?? 0) + 1;
    this.seq.set(runId, next);
    const event: RunEvent = { runId, seq: next, kind, msg, t: clockTime(), data };
    this.buffers.get(runId)!.push(event);
    e.emit('event', event);
    return event;
  }

  /** Subscribe to live events. Replays any buffered events first. */
  subscribe(runId: string, listener: (e: RunEvent) => void): () => void {
    const e = this.emitterFor(runId);
    for (const buffered of this.buffers.get(runId) ?? []) listener(buffered);
    e.on('event', listener);
    return () => e.off('event', listener);
  }

  /** The full buffered log for a run (used to persist the trace on completion). */
  buffer(runId: string): RunEvent[] {
    return this.buffers.get(runId) ?? [];
  }

  /** Whether the bus holds anything for this run (live, or completed and still retained). */
  knows(runId: string): boolean {
    return this.buffers.has(runId);
  }

  /**
   * Signal completion. The emitter goes now; the buffer stays replayable for
   * late subscribers for `retentionMs`, then everything for the run is dropped —
   * the persisted `run_traces` row is the long-term record.
   */
  complete(runId: string): void {
    const e = this.emitters.get(runId);
    this.completed.add(runId);
    this.cancelled.delete(runId);
    e?.emit('done');
    this.emitters.delete(runId);
    setTimeout(() => this.forget(runId), this.retentionMs).unref();
  }

  private forget(runId: string): void {
    this.emitters.delete(runId);
    this.buffers.delete(runId);
    this.seq.delete(runId);
    this.completed.delete(runId);
  }

  /** Whether a run has already completed (for replay-then-end late subscribers). */
  isComplete(runId: string): boolean {
    return this.completed.has(runId);
  }

  onDone(runId: string, listener: () => void): () => void {
    // A run that already completed fires immediately so late SSE subscribers,
    // after replaying the buffer, end the stream instead of hanging forever.
    if (this.completed.has(runId)) {
      queueMicrotask(listener);
      return () => undefined;
    }
    const e = this.emitterFor(runId);
    e.once('done', listener);
    return () => e.off('done', listener);
  }
}

export const runBus = new RunBus();
