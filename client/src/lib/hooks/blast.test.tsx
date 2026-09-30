import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../api", () => ({ api: { get: h.get, post: h.post }, API_BASE: "http://test" }));

import { useBlastRadius, useBlastResync } from "./blast";

/**
 * The blast query waits for the PR detail's head SHA, and a resync refetches the map only
 * once the index state's `updatedAt` has moved past the value seen at click time.
 */

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const blastCalls = () =>
  h.get.mock.calls.filter((args: unknown[]) => String(args[0] ?? "").endsWith("/blast")).length;

afterEach(() => vi.clearAllMocks());

describe("useBlastRadius", () => {
  it("waits for the head sha, then fetches", async () => {
    h.get.mockResolvedValue({ blast: {} });
    const { result, rerender } = renderHook(
      ({ sha }: { sha: string | undefined }) => useBlastRadius("p1", sha),
      { wrapper: wrapper(), initialProps: { sha: undefined as string | undefined } },
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(h.get).not.toHaveBeenCalled();

    rerender({ sha: "abc" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.get).toHaveBeenCalledWith("/pulls/p1/blast");
  });
});

describe("useBlastResync", () => {
  it("refetches the blast map once the index updatedAt advances", async () => {
    let updatedAt = "t1";
    h.get.mockImplementation(async (path?: string) => {
      if (path?.endsWith("/index-state")) return { status: "degraded", updatedAt };
      return { blast: {} };
    });
    h.post.mockImplementation(async () => {
      updatedAt = "t2"; // the resync lands: the next index-state read reports a new row
      return { status: "accepted" };
    });

    const { result } = renderHook(
      () => ({ blast: useBlastRadius("p1", "abc"), resync: useBlastResync("p1", "r1") }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.blast.isSuccess).toBe(true));
    await waitFor(() => expect(h.get).toHaveBeenCalledWith("/repos/r1/index-state"));
    expect(blastCalls()).toBe(1);

    act(() => result.current.resync.start());
    expect(result.current.resync.pending).toBe(true);

    await waitFor(() => expect(blastCalls()).toBe(2));
    expect(h.post).toHaveBeenCalledWith("/repos/r1/resync");
    await waitFor(() => expect(result.current.resync.pending).toBe(false));
    expect(result.current.resync.timedOut).toBe(false);
    expect(result.current.resync.failed).toBe(false);
  });
});
