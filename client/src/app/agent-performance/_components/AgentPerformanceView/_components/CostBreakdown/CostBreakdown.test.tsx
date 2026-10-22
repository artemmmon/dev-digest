import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import type { AgentCost, ModelCost } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";
import { formatCost } from "@/lib/format-cost";
import { CostBreakdown } from "./CostBreakdown";

const BY_AGENT: AgentCost[] = [
  { agent_id: "a1", agent_name: "Security", cost_usd: 3 },
  { agent_id: null, agent_name: null, cost_usd: 1 },
];
const BY_MODEL: ModelCost[] = [
  { model: "gpt-4o", cost_usd: 3.5 },
  { model: null, cost_usd: 0.5 },
];

function setup(over: Partial<React.ComponentProps<typeof CostBreakdown>> = {}) {
  return renderWithIntl(
    <CostBreakdown costByAgent={BY_AGENT} costByModel={BY_MODEL} totalCostUsd={4} costPartial={false} {...over} />,
  );
}

const card = (title: string) => screen.getByRole("heading", { name: title }).parentElement as HTMLElement;

describe("CostBreakdown", () => {
  it("AC-48: shows one slice per agent with a priced run, a deleted agent as Deleted agent", () => {
    setup();
    const by = within(card("By agent"));
    expect(by.getByText("Security")).toBeInTheDocument();
    expect(by.getByText("$3.00")).toBeInTheDocument();
    expect(by.getByText("Deleted agent")).toBeInTheDocument();
    expect(by.getByText("$1.00")).toBeInTheDocument();
  });

  it("AC-49: shows one slice per model, a run with no model as Unknown model", () => {
    setup();
    const by = within(card("By model"));
    expect(by.getByText("gpt-4o")).toBeInTheDocument();
    expect(by.getByText("$3.50")).toBeInTheDocument();
    expect(by.getByText("Unknown model")).toBeInTheDocument();
    expect(by.getByText(formatCost(0.5))).toBeInTheDocument();
  });

  it("AC-50: formats by-agent slice amounts with formatCost, so a small amount is not shown as $0.00", () => {
    setup({
      costByAgent: [
        { agent_id: "a1", agent_name: "Security", cost_usd: 0.004 },
        { agent_id: "a2", agent_name: "Style", cost_usd: 0.0003 },
      ],
      totalCostUsd: 0.0043,
    });
    const by = within(card("By agent"));
    expect(by.getByText(formatCost(0.004))).toBeInTheDocument();
    expect(by.getByText(formatCost(0.0003))).toBeInTheDocument();
    expect(by.getByText("$0.0040")).toBeInTheDocument();
    expect(by.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("AC-51: formats by-model slice amounts with formatCost, so a small amount is not shown as $0.00", () => {
    setup({
      costByModel: [
        { model: "gpt-4o", cost_usd: 0.004 },
        { model: "mini", cost_usd: 0.00004 },
      ],
      totalCostUsd: 0.00404,
    });
    const by = within(card("By model"));
    expect(by.getByText(formatCost(0.004))).toBeInTheDocument();
    expect(by.getByText("<$0.0001")).toBeInTheDocument();
    expect(by.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("AC-50: a legend amount reads the same as the Total cost tile does for an equal amount", () => {
    setup({ costByAgent: [{ agent_id: "a1", agent_name: "Security", cost_usd: 0.1234 }], totalCostUsd: 0.1234 });
    expect(within(card("By agent")).getByText(formatCost(0.1234))).toBeInTheDocument();
  });

  it("AC-54: labels the breakdown as a DevDigest estimate", () => {
    setup();
    expect(screen.getByText("DevDigest estimate")).toBeInTheDocument();
  });

  it("AC-52: marks the breakdown as partial when a run has no stored cost", () => {
    setup({ costPartial: true });
    expect(screen.getByText("partial")).toBeInTheDocument();
  });

  it("AC-52: shows no partial mark when every run is priced", () => {
    setup({ costPartial: false });
    expect(screen.queryByText("partial")).not.toBeInTheDocument();
  });

  it("AC-53: shows \"No cost recorded yet.\" in place of the slices when no run is priced", () => {
    setup({ costByAgent: [], costByModel: [], totalCostUsd: null });
    expect(screen.getByText("No cost recorded yet.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "By agent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "By model" })).not.toBeInTheDocument();
  });

  it("renders legend names as text, not markup", () => {
    const evil = "<img src=x onerror=alert(1)>";
    const { container } = setup({ costByAgent: [{ agent_id: "a1", agent_name: evil, cost_usd: 4 }] });
    expect(screen.getByText(evil)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
