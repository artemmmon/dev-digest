import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentSkillLink } from "@devdigest/shared";
import { keys } from "../query-keys";

const h = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock("../api", () => ({ api: { put: h.put } }));

import { useSetAgentSkills } from "./skills";

const link = (skill_id: string, order: number, enabled = true): AgentSkillLink => ({
  agent_id: "ag1",
  skill_id,
  order,
  enabled,
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  qc.setQueryData(keys.agentSkills("ag1"), [link("a", 0), link("b", 1)]);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useSetAgentSkills("ag1"), { wrapper });
  return { qc, result };
}

afterEach(() => h.put.mockReset());

describe("useSetAgentSkills", () => {
  it("shows the new order at once, before the server answers", async () => {
    let resolve!: (v: AgentSkillLink[]) => void;
    h.put.mockReturnValue(new Promise<AgentSkillLink[]>((r) => (resolve = r)));
    const { qc, result } = setup();

    act(() => result.current.mutate([{ skill_id: "b", enabled: true }, { skill_id: "a", enabled: false }]));
    await waitFor(() =>
      expect(qc.getQueryData<AgentSkillLink[]>(keys.agentSkills("ag1"))).toEqual([link("b", 0), link("a", 1, false)]),
    );

    await act(async () => resolve([link("b", 0), link("a", 1, false)]));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("puts the previous order back when the save fails", async () => {
    h.put.mockRejectedValue(new Error("boom"));
    const { qc, result } = setup();

    act(() => result.current.mutate([{ skill_id: "b", enabled: true }, { skill_id: "a", enabled: true }]));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<AgentSkillLink[]>(keys.agentSkills("ag1"))).toEqual([link("a", 0), link("b", 1)]);
  });
});
