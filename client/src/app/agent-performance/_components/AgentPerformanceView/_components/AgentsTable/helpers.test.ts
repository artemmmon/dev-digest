import { describe, it, expect } from "vitest";
import type { AgentStats } from "@devdigest/shared";
import { nextSort, rowKey, sortRows, viewHref } from "./helpers";

function agent(name: string, over: Partial<AgentStats> = {}): AgentStats {
  return {
    agent_id: name.toLowerCase(),
    agent_name: name,
    runs: 5,
    runs_done: 5,
    runs_failed: 0,
    runs_cancelled: 0,
    accepted: 0,
    dismissed: 0,
    pending: 0,
    accept_rate: null,
    total_cost_usd: null,
    avg_cost_usd: null,
    cost_partial: false,
    avg_duration_ms: null,
    last_run_at: null,
    cost_by_model: [],
    ...over,
  };
}

/** An agent with `accepted` + `dismissed` decisions, so its rate and its sample size agree. */
function decided(name: string, accepted: number, dismissed: number): AgentStats {
  return agent(name, { accepted, dismissed, accept_rate: accepted / (accepted + dismissed) });
}

const names = (rows: AgentStats[]) => rows.map((r) => r.agent_name);

describe("sortRows", () => {
  it("without a sort puts the agent with the most runs first", () => {
    const rows = [agent("A", { runs: 2 }), agent("B", { runs: 9 }), agent("C", { runs: 0 })];
    expect(names(sortRows(rows, null))).toEqual(["B", "A", "C"]);
  });

  it("AC-39: sorts by accept rate, highest first", () => {
    const rows = [decided("A", 12, 8), decided("B", 19, 1), decided("C", 10, 10)];
    expect(names(sortRows(rows, "desc"))).toEqual(["B", "A", "C"]);
  });

  it("AC-40: sorts by accept rate, lowest first", () => {
    const rows = [decided("A", 12, 8), decided("B", 19, 1), decided("C", 10, 10)];
    expect(names(sortRows(rows, "asc"))).toEqual(["C", "A", "B"]);
  });

  it("AC-41: places every agent with fewer than 10 decisions after every agent with 10 or more", () => {
    const rows = [decided("Small", 3, 0), decided("Big", 6, 6)];
    expect(names(sortRows(rows, "desc"))).toEqual(["Big", "Small"]);
    expect(names(sortRows(rows, "asc"))).toEqual(["Big", "Small"]);
  });

  it("EC-14: an agent with 3 decisions and a 100 % rate comes after agents with 10 or more", () => {
    const rows = [decided("Perfect", 3, 0), decided("Ten", 7, 3), decided("Twenty", 5, 15)];
    expect(names(sortRows(rows, "desc"))).toEqual(["Ten", "Twenty", "Perfect"]);
  });

  it("orders the small-sample group by rate too, and puts agents with no rate last in both directions", () => {
    const rows = [agent("None"), decided("Low", 1, 3), decided("High", 4, 0)];
    expect(names(sortRows(rows, "desc"))).toEqual(["High", "Low", "None"]);
    expect(names(sortRows(rows, "asc"))).toEqual(["Low", "High", "None"]);
  });

  it("returns a new array and leaves the input alone", () => {
    const rows = [agent("A", { runs: 1 }), agent("B", { runs: 2 })];
    const sorted = sortRows(rows, null);
    expect(sorted).not.toBe(rows);
    expect(names(rows)).toEqual(["A", "B"]);
  });
});

describe("nextSort", () => {
  it("AC-39/AC-40: the first activation sorts highest first, the next lowest first, then it toggles", () => {
    expect(nextSort(null)).toBe("desc");
    expect(nextSort("desc")).toBe("asc");
    expect(nextSort("asc")).toBe("desc");
  });
});

describe("rowKey", () => {
  it("is the agent id, and a fixed key for the deleted-agent row", () => {
    expect(rowKey(agent("A"))).toBe("a");
    expect(rowKey(agent("x", { agent_id: null, agent_name: null }))).toBe("deleted-agent");
  });
});

describe("viewHref", () => {
  it("AC-47: opens the Stats tab with a rolling period", () => {
    expect(viewHref("a1", { period: "1d" })).toBe("/agents/a1?tab=stats&period=1d");
    expect(viewHref("a1", { period: "30d" })).toBe("/agents/a1?tab=stats&period=30d");
  });

  it("AC-47: carries a custom range", () => {
    expect(viewHref("a1", { period: "custom", from: "2026-10-01", to: "2026-10-07" })).toBe(
      "/agents/a1?tab=stats&period=custom&from=2026-10-01&to=2026-10-07",
    );
  });

  it("encodes an id so it cannot add a path segment or a query", () => {
    expect(viewHref("a/b?c", { period: "30d" })).toBe("/agents/a%2Fb%3Fc?tab=stats&period=30d");
  });
});
