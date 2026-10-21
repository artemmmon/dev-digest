import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import type { AgentPerformance } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";
import type { StatsPeriodSelection } from "@/lib/stats-period";
import { SummaryTiles } from "./SummaryTiles";

type Totals = AgentPerformance["totals"];

function totals(over: Partial<Totals> = {}): Totals {
  return {
    runs: 42,
    total_cost_usd: 12.5,
    cost_partial: false,
    accepted: 30,
    dismissed: 10,
    accept_rate: 0.75,
    most_active: { agent_id: "a1", agent_name: "Security", runs: 20 },
    ...over,
  };
}

function setup(over: Partial<Totals> = {}, period: StatsPeriodSelection = { period: "30d" }) {
  return renderWithIntl(<SummaryTiles totals={totals(over)} period={period} />);
}

/** The tile whose label starts with `label`. */
const tile = (label: RegExp) => screen.getByText(label).closest("section") as HTMLElement;

describe("SummaryTiles", () => {
  it("AC-12: names the selected period in every tile label", () => {
    setup({}, { period: "1d" });
    for (const label of [/Total runs/, /Total cost/, /Avg accept rate/, /Most-active agent/]) {
      expect(screen.getByText(label).textContent).toContain("1 day");
    }
  });

  it("AC-12: names a custom range by its dates", () => {
    setup({}, { period: "custom", from: "2026-10-01", to: "2026-10-07" });
    expect(screen.getByText(/Total runs/).textContent).toContain("2026-10-01 – 2026-10-07");
  });

  it("AC-13: shows the number of counted runs", () => {
    setup({ runs: 42 });
    expect(within(tile(/Total runs/)).getByText("42")).toBeInTheDocument();
  });

  it("AC-14: shows the total cost, labelled as a DevDigest estimate", () => {
    setup({ total_cost_usd: 12.5 });
    const t = within(tile(/Total cost/));
    expect(t.getByText("$12.50")).toBeInTheDocument();
    expect(t.getByText("DevDigest estimate")).toBeInTheDocument();
  });

  it("AC-15: marks the total cost as partial when a run has no stored cost", () => {
    setup({ cost_partial: true });
    expect(within(tile(/Total cost/)).getByText("partial")).toBeInTheDocument();
  });

  it("AC-15: shows no partial mark when every run is priced", () => {
    setup({ cost_partial: false });
    expect(within(tile(/Total cost/)).queryByText("partial")).not.toBeInTheDocument();
  });

  it("shows — for the cost when no run stored one", () => {
    setup({ total_cost_usd: null });
    expect(within(tile(/Total cost/)).getByText("—")).toBeInTheDocument();
  });

  it("AC-16: shows the accept rate as a percentage", () => {
    setup({ accept_rate: 0.75 });
    expect(within(tile(/Avg accept rate/)).getByText("75%")).toBeInTheDocument();
  });

  it("AC-17/AC-18: shows the number of decisions and of counted runs behind the rate", () => {
    setup({ accepted: 30, dismissed: 10, runs: 42 });
    expect(within(tile(/Avg accept rate/)).getByText("40 decisions · 42 runs")).toBeInTheDocument();
  });

  it("AC-19: shows — as the rate when the period has no decision", () => {
    setup({ accepted: 0, dismissed: 0, accept_rate: null, runs: 3 });
    const t = within(tile(/Avg accept rate/));
    expect(t.getByText("—")).toBeInTheDocument();
    expect(t.getByText("0 decisions · 3 runs")).toBeInTheDocument();
    expect(t.queryByText("0%")).not.toBeInTheDocument();
  });

  it("AC-20/AC-21: shows the most-active agent and its number of runs", () => {
    setup({ most_active: { agent_id: "a1", agent_name: "Security", runs: 20 } });
    const t = within(tile(/Most-active agent/));
    expect(t.getByText("Security")).toBeInTheDocument();
    expect(t.getByText("20 runs")).toBeInTheDocument();
  });

  it("AC-22: shows the single agent the server names as most active, even when others tied", () => {
    // The tie-break (newest last run) is the server's; the tile must show exactly the agent it is given.
    setup({ most_active: { agent_id: "a2", agent_name: "Newer", runs: 20 } });
    const t = within(tile(/Most-active agent/));
    expect(t.getByText("Newer")).toBeInTheDocument();
    expect(t.queryByText("Security")).not.toBeInTheDocument();
  });

  it("shows — when there is no most-active agent", () => {
    setup({ most_active: null });
    expect(within(tile(/Most-active agent/)).getByText("—")).toBeInTheDocument();
  });

  it("renders the agent name as text, not markup", () => {
    const evil = "<img src=x onerror=alert(1)>";
    const { container } = setup({ most_active: { agent_id: "a1", agent_name: evil, runs: 2 } });
    expect(screen.getByText(evil)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
