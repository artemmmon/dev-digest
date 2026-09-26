import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useElementHeight } from "./useElementHeight";

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: ResizeObserverCallback;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb;
    MockResizeObserver.instances.push(this);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  MockResizeObserver.instances = [];
});

describe("useElementHeight", () => {
  it("attaches once the element mounts after an initial null render (a loading state), then reports its height", () => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver);

    const { result } = renderHook(() => useElementHeight<HTMLDivElement>());
    const [ref] = result.current;

    // First render — e.g. the page still shows its loading state, so the ref
    // never attaches to a node yet.
    expect(MockResizeObserver.instances).toHaveLength(0);
    expect(result.current[1]).toBeNull();

    // The element mounts later. A callback ref (not `useRef` + an effect with `[]`)
    // means the observing effect still picks it up.
    const node = document.createElement("div");
    act(() => ref(node));

    expect(MockResizeObserver.instances).toHaveLength(1);
    const instance = MockResizeObserver.instances[0]!;
    expect(instance.observe).toHaveBeenCalledWith(node);

    // contentRect excludes padding/border; borderBoxSize is the rendered box height
    // (e.g. a header with vertical padding) — the two differ here on purpose so a
    // regression back to `entry.contentRect.height` fails this assertion.
    act(() => {
      instance.callback(
        [
          {
            contentRect: { height: 124.8 },
            borderBoxSize: [{ blockSize: 143, inlineSize: 0 }],
          } as unknown as ResizeObserverEntry,
        ],
        instance as unknown as ResizeObserver,
      );
    });

    expect(result.current[1]).toBe(143);
  });

  it("falls back to the element's live border-box height when borderBoxSize isn't available (jsdom)", () => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver);

    const { result } = renderHook(() => useElementHeight<HTMLDivElement>());
    const [ref] = result.current;

    const node = document.createElement("div");
    vi.spyOn(node, "getBoundingClientRect").mockReturnValue({ height: 143 } as DOMRect);
    act(() => ref(node));

    const instance = MockResizeObserver.instances[0]!;
    act(() => {
      instance.callback(
        [{ contentRect: { height: 124.8 } } as ResizeObserverEntry],
        instance as unknown as ResizeObserver,
      );
    });

    expect(result.current[1]).toBe(143);
  });
});
