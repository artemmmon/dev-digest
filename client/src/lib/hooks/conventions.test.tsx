import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ConventionCandidate, ConventionList } from "@devdigest/shared";
import { keys } from "../query-keys";

const h = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock("../api", () => ({ api: { patch: h.patch } }));

import { useUpdateConvention } from "./conventions";

const cand = (id: string, status: ConventionCandidate["status"] = "pending"): ConventionCandidate => ({
  id,
  repo_id: "r1",
  category: "naming",
  rule: `rule ${id}`,
  evidence_path: "a.ts",
  evidence_line: 1,
  evidence_snippet: "x",
  confidence: 0.9,
  status,
  created_at: "",
  updated_at: "",
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  qc.setQueryData<ConventionList>(keys.conventions("r1"), { candidates: [cand("a"), cand("b")], last_scan: null });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useUpdateConvention("r1"), { wrapper });
  const ids = () => qc.getQueryData<ConventionList>(keys.conventions("r1"))!.candidates.map((c) => `${c.id}:${c.status}`);
  return { qc, result, ids };
}

afterEach(() => h.patch.mockReset());

describe("useUpdateConvention", () => {
  it("drops a rejected candidate from the cache before the server answers", async () => {
    h.patch.mockReturnValue(new Promise(() => {}));
    const { result, ids } = setup();
    act(() => result.current.mutate({ id: "a", patch: { status: "rejected" } }));
    await waitFor(() => expect(ids()).toEqual(["b:pending"]));
  });

  it("marks an accepted candidate at once and keeps the saved row afterwards", async () => {
    h.patch.mockResolvedValue({ ...cand("a", "accepted"), rule: "rule a" });
    const { result, ids } = setup();
    act(() => result.current.mutate({ id: "a", patch: { status: "accepted" } }));
    await waitFor(() => expect(ids()).toEqual(["a:accepted", "b:pending"]));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(ids()).toEqual(["a:accepted", "b:pending"]);
  });

  it("puts the list back when the save fails", async () => {
    h.patch.mockRejectedValue(new Error("boom"));
    const { result, ids } = setup();
    act(() => result.current.mutate({ id: "a", patch: { status: "rejected" } }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(ids()).toEqual(["a:pending", "b:pending"]);
  });
});
