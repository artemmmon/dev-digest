import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { keys } from "../query-keys";

const h = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(
      message: string,
      public status: number,
      public code?: string,
    ) {
      super(message);
    }
  }
  return { get: vi.fn(), post: vi.fn(), del: vi.fn(), ApiError };
});
vi.mock("../api", () => ({ api: { get: h.get, post: h.post, del: h.del }, ApiError: h.ApiError, API_BASE: "http://test" }));

import { useCreateEvalCase, useDeleteEvalCase, useEvalRuns, useStartEvalRun } from "./eval";

/** Eval hooks over a faked `api`: polling while a run runs (AC-22) and what a mutation re-reads. */

const run = (status: string, over: Record<string, unknown> = {}) => ({
  id: "r1",
  agent_id: "ag1",
  status,
  cases_total: 3,
  cases_completed: 0,
  cases_errored: 0,
  cases_passed: 0,
  ...over,
});
const overview = (status: string, over = {}) => ({ runs: [run(status, over)], latest_counted: null, previous_counted: null });

function wrapperWith(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
  h.del.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useEvalRuns — AC-22", () => {
  it("AC-22: re-reads every 2 s while a run is running and stops once none is", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"] });
    h.get
      .mockResolvedValueOnce(overview("running", { cases_completed: 1 }))
      .mockResolvedValueOnce(overview("running", { cases_completed: 2 }))
      .mockResolvedValueOnce(overview("done", { cases_completed: 3 }))
      .mockResolvedValue(overview("done", { cases_completed: 3 }));
    const { result } = renderHook(() => useEvalRuns("ag1"), { wrapper: wrapperWith(newClient()) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.get).toHaveBeenCalledWith("/agents/ag1/eval-runs?limit=10");
    expect(result.current.data?.runs[0]?.cases_completed).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1900); // t = 1950 ms
    });
    expect(h.get).toHaveBeenCalledTimes(1); // not before 2 s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100); // t = 2050 ms
    });
    expect(h.get).toHaveBeenCalledTimes(2);
    expect(result.current.data?.runs[0]?.cases_completed).toBe(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(h.get).toHaveBeenCalledTimes(3);
    expect(result.current.data?.runs[0]?.status).toBe("done");

    // done: no further polling
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(h.get).toHaveBeenCalledTimes(3);
  });

  it("AC-22: when the run ends, the case outcomes, the trend and the dashboard are re-read", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"] });
    h.get.mockResolvedValueOnce(overview("running")).mockResolvedValue(overview("done"));
    const qc = newClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    renderHook(() => useEvalRuns("ag1"), { wrapper: wrapperWith(qc) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(spy).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    const invalidated = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(invalidated).toContainEqual(keys.eval.cases("ag1"));
    expect(invalidated).toContainEqual(keys.eval.trend("ag1"));
    expect(invalidated).toContainEqual(keys.eval.dashboard());
  });

  it("does not fetch without an agent id", async () => {
    renderHook(() => useEvalRuns(null), { wrapper: wrapperWith(newClient()) });
    await act(async () => {});
    expect(h.get).not.toHaveBeenCalled();
  });
});

describe("eval mutations", () => {
  it("AC-18: a started run re-reads the agent's eval data and the dashboard", async () => {
    h.post.mockResolvedValue({ run_id: "r1", status: "running" });
    const qc = newClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useStartEvalRun("ag1"), { wrapper: wrapperWith(qc) });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/agents/ag1/eval-runs"));
    const invalidated = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(invalidated).toContainEqual(keys.eval.agent("ag1"));
    expect(invalidated).toContainEqual(keys.eval.dashboard());
  });

  it("AC-23: a 409 'run in progress' re-reads the agent's eval data so the page shows that run", async () => {
    h.post.mockRejectedValue(new h.ApiError("already running", 409, "eval_run_in_progress"));
    const qc = newClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useStartEvalRun("ag1"), { wrapper: wrapperWith(qc) });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toContainEqual(keys.eval.agent("ag1")));
  });

  it("AC-9: a case saved from a finding also re-reads that PR's reviews, so the card shows 'In eval set'", async () => {
    h.post.mockResolvedValue({ id: "c1" });
    const qc = newClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateEvalCase("ag1", { prId: "pr1" }), { wrapper: wrapperWith(qc) });

    await act(async () => {
      result.current.mutate({
        name: "n",
        input_diff: "d",
        input_meta: { pr_title: "t", pr_body: "" },
        expected_output: { type: "must_find", file: "a.ts", start_line: 1, end_line: 1 },
        source_finding_id: "f1",
      });
    });

    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/agents/ag1/eval-cases", expect.objectContaining({ source_finding_id: "f1" })));
    await waitFor(() => {
      const invalidated = spy.mock.calls.map((c) => c[0]?.queryKey);
      expect(invalidated).toContainEqual(keys.pr.reviews("pr1"));
      expect(invalidated).toContainEqual(keys.eval.agent("ag1"));
    });
  });

  it("AC-10, EC-4: a 409 'case exists' re-reads the PR's reviews so the finding shows it already has a case", async () => {
    h.post.mockRejectedValue(new h.ApiError("exists", 409, "eval_case_exists"));
    const qc = newClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateEvalCase("ag1", { prId: "pr1" }), { wrapper: wrapperWith(qc) });

    await act(async () => {
      result.current.mutate({
        name: "n",
        input_diff: "d",
        input_meta: { pr_title: "t", pr_body: "" },
        expected_output: { type: "must_find", file: "a.ts", start_line: 1, end_line: 1 },
      });
    });

    await waitFor(() => expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toContainEqual(keys.pr.reviews("pr1")));
  });

  it("AC-9: a deleted case re-reads every cached PR's reviews, so no card keeps saying 'In eval set'", async () => {
    h.del.mockResolvedValue(undefined);
    const qc = newClient();
    // The delete does not know the PR: two PRs' cached reviews, and keys that must stay fresh.
    qc.setQueryData(keys.pr.reviews("pr1"), { reviews: [] });
    qc.setQueryData(keys.pr.reviews("pr2"), { reviews: [] });
    qc.setQueryData(keys.pr.detail("pr1"), { id: "pr1" });
    qc.setQueryData(keys.pr.comments("pr1"), []);
    qc.setQueryData(["repo", "pr1", "reviews"], []);
    qc.setQueryData(keys.eval.dashboard(), { agents: [] });
    const { result } = renderHook(() => useDeleteEvalCase("ag1"), { wrapper: wrapperWith(qc) });

    await act(async () => {
      result.current.mutate("c1");
    });

    await waitFor(() => expect(h.del).toHaveBeenCalledWith("/eval-cases/c1"));
    const stale = (key: readonly unknown[]) => qc.getQueryState(key)?.isInvalidated;
    await waitFor(() => expect(stale(keys.pr.reviews("pr1"))).toBe(true));
    expect(stale(keys.pr.reviews("pr2"))).toBe(true);
    // unrelated cached data is left alone
    expect(stale(keys.pr.detail("pr1"))).toBe(false);
    expect(stale(keys.pr.comments("pr1"))).toBe(false);
    expect(stale(["repo", "pr1", "reviews"])).toBe(false);
  });

  it("AC-9: a deleted case refetches an on-screen PR reviews query", async () => {
    h.del.mockResolvedValue(undefined);
    const qc = newClient();
    const fetchReviews = vi.fn().mockResolvedValue({ reviews: [] });
    qc.setQueryData(keys.pr.reviews("pr1"), { reviews: [] });
    // an observer, as the PR page has
    const observer = renderHook(
      () => useQuery({ queryKey: keys.pr.reviews("pr1"), queryFn: fetchReviews, staleTime: Infinity }),
      { wrapper: wrapperWith(qc) },
    );
    await waitFor(() => expect(observer.result.current.data).toEqual({ reviews: [] }));
    expect(fetchReviews).not.toHaveBeenCalled();
    const { result } = renderHook(() => useDeleteEvalCase("ag1"), { wrapper: wrapperWith(qc) });

    await act(async () => {
      result.current.mutate("c1");
    });

    await waitFor(() => expect(fetchReviews).toHaveBeenCalledTimes(1));
  });

  it("AC-9: a refused delete (409 while a run is running) leaves the cached PR reviews as they are", async () => {
    h.del.mockRejectedValue(new h.ApiError("run in progress", 409, "eval_run_in_progress"));
    const qc = newClient();
    qc.setQueryData(keys.pr.reviews("pr1"), { reviews: [] });
    const { result } = renderHook(() => useDeleteEvalCase("ag1"), { wrapper: wrapperWith(qc) });

    await act(async () => {
      result.current.mutate("c1");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryState(keys.pr.reviews("pr1"))?.isInvalidated).toBe(false);
  });
});
