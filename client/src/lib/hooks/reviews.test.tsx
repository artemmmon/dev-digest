import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { RunEvent } from "@devdigest/shared";
import { useRunEvents } from "./reviews";

/**
 * useRunEvents against a fake EventSource: the SSE contract (frames named after the
 * event kind, a terminal `done` frame, Last-Event-ID resume) without a server.
 */

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  readyState = FakeEventSource.CONNECTING;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, ((ev: MessageEvent) => void)[]>();
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (ev: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  /** Test helpers */
  emit(type: string, data: unknown) {
    const ev = { data: typeof data === "string" ? data : JSON.stringify(data) } as MessageEvent;
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }
  drop(readyState: number) {
    this.readyState = readyState;
    this.onerror?.();
  }
}

const event = (runId: string, seq: number, msg = `m${seq}`): RunEvent => ({
  runId,
  seq,
  kind: "info",
  msg,
  t: "00:00:0" + seq,
});

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const streamFor = (runId: string) =>
  FakeEventSource.instances.filter((s) => s.url.endsWith(`/runs/${runId}/events`));

describe("useRunEvents", () => {
  it("collects events and runs until the done frame, then reports settled once", () => {
    const onSettled = vi.fn();
    const { result } = renderHook(() => useRunEvents(["r1"], { onSettled }));
    expect(result.current.running).toBe(true);

    const es = streamFor("r1")[0]!;
    act(() => es.emit("info", event("r1", 1)));
    act(() => es.emit("result", event("r1", 2)));
    expect(result.current.events.map((e) => e.seq)).toEqual([1, 2]);

    act(() => es.emit("done", {}));
    expect(result.current.running).toBe(false);
    expect(es.closed).toBe(true);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("shows each event once when a reconnect replays it", () => {
    const onEvent = vi.fn();
    const { result } = renderHook(() => useRunEvents(["r1"], { onEvent }));
    const es = streamFor("r1")[0]!;
    act(() => es.emit("info", event("r1", 1)));
    act(() => es.emit("info", event("r1", 1)));
    act(() => es.emit("info", event("r1", 2)));
    expect(result.current.events).toHaveLength(2);
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it("leaves a dropped connection to EventSource (it is retrying), but ends a stream the browser gave up on", () => {
    const onSettled = vi.fn();
    const { result } = renderHook(() => useRunEvents(["r1"], { onSettled }));
    const es = streamFor("r1")[0]!;

    act(() => es.drop(FakeEventSource.CONNECTING));
    expect(result.current.running).toBe(true);
    expect(es.closed).toBe(false);

    act(() => es.drop(FakeEventSource.CLOSED));
    expect(result.current.running).toBe(false);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("adding a run id opens just that stream; removing one closes just that one", () => {
    const { result, rerender } = renderHook(({ ids }) => useRunEvents(ids), {
      initialProps: { ids: ["r1"] },
    });
    const first = streamFor("r1")[0]!;
    act(() => first.emit("info", event("r1", 1)));

    rerender({ ids: ["r1", "r2"] });
    expect(streamFor("r1")).toHaveLength(1); // not reopened
    expect(streamFor("r2")).toHaveLength(1);
    expect(result.current.events).toHaveLength(1); // not reset

    rerender({ ids: ["r2"] });
    expect(first.closed).toBe(true);
    expect(streamFor("r2")[0]!.closed).toBe(false);
    expect(result.current.running).toBe(true);
  });

  it("settles only after the last of several streams ends", () => {
    const onSettled = vi.fn();
    renderHook(() => useRunEvents(["r1", "r2"], { onSettled }));
    act(() => streamFor("r1")[0]!.emit("done", {}));
    expect(onSettled).not.toHaveBeenCalled();
    act(() => streamFor("r2")[0]!.emit("done", {}));
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("does not reopen a finished run when the ids are passed again, and does not settle on unmount", () => {
    const onSettled = vi.fn();
    const { rerender, unmount } = renderHook(({ ids }) => useRunEvents(ids, { onSettled }), {
      initialProps: { ids: ["r1"] },
    });
    act(() => streamFor("r1")[0]!.emit("done", {}));
    rerender({ ids: ["r1", "r1"] });
    expect(streamFor("r1")).toHaveLength(1);

    rerender({ ids: ["r3"] });
    unmount();
    expect(streamFor("r3")[0]!.closed).toBe(true);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("does not reopen streams when the parent passes fresh callbacks", () => {
    const { rerender } = renderHook(() => useRunEvents(["r1"], { onSettled: () => undefined }));
    rerender();
    rerender();
    expect(streamFor("r1")).toHaveLength(1);
  });

  it("ignores frames that are not JSON (keepalives)", () => {
    const { result } = renderHook(() => useRunEvents(["r1"]));
    act(() => streamFor("r1")[0]!.emit("info", ": keepalive"));
    expect(result.current.events).toEqual([]);
  });
});
