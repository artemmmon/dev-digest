import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test/render";

const h = vi.hoisted(() => ({
  q: { data: undefined as unknown, isError: false },
}));

vi.mock("@/lib/hooks", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useEvalTrend: () => h.q,
}));
// ResponsiveContainer measures its parent, which is 0 x 0 in jsdom: give the chart a fixed size.
vi.mock("recharts", async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, { width: 600, height: 240 } as never),
  };
});

import { TrendChart } from "./TrendChart";

const point = (n: number, over: Record<string, unknown> = {}) => ({
  run_id: `r${n}`,
  started_at: `2026-10-0${n}T10:00:00.000Z`,
  agent_version: n,
  recall: 0.5,
  precision: 0.6,
  citation_accuracy: 0.7,
  cost_usd: 0.1,
  ...over,
});

beforeEach(() => {
  h.q = { data: undefined, isError: false };
});
afterEach(cleanup);

describe("TrendChart", () => {
  it("AC-58: shows the three metric lines in the legend and a plotted chart for counted runs", () => {
    h.q.data = { points: [point(1), point(2, { recall: 0.9 }), point(3)] };
    const { container } = renderWithIntl(<TrendChart agentId="ag1" />);

    expect(screen.getByText("Metric trend")).toBeInTheDocument();
    const legend = screen.getByRole("list");
    expect(within(legend).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Recall",
      "Precision",
      "Citation",
    ]);
    expect(screen.getByRole("group", { name: /Recall, precision and citation accuracy/ })).toBeInTheDocument();
    // three series, one point per run, in the order the server sent them (oldest first)
    expect(container.querySelectorAll(".recharts-line")).toHaveLength(3);
    expect(container.querySelectorAll(".recharts-line-dots")).toHaveLength(3);
    expect(Array.from(container.querySelectorAll(".recharts-xAxis .recharts-cartesian-axis-tick-value")).map((n) => n.textContent)).toEqual(["v1", "v2", "v3"]);
  });

  it("AC-58: with no counted run the chart is replaced by a message", () => {
    h.q.data = { points: [] };
    renderWithIntl(<TrendChart agentId="ag1" />);
    expect(screen.getByText(/No counted runs yet/)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /Recall, precision/ })).not.toBeInTheDocument();
  });

  it("AC-58: a load error is shown in place of the chart", () => {
    h.q = { data: undefined, isError: true };
    renderWithIntl(<TrendChart agentId="ag1" />);
    expect(screen.getByText("The trend could not be loaded.")).toBeInTheDocument();
  });

  it("AC-34: a metric without a value leaves a gap — one dot fewer on that line, not a zero", () => {
    h.q.data = { points: [point(1), point(2, { precision: null }), point(3)] };
    const { container } = renderWithIntl(<TrendChart agentId="ag1" />);
    const dotCounts = Array.from(container.querySelectorAll(".recharts-line-dots")).map(
      (g) => g.querySelectorAll(".recharts-dot").length,
    );
    expect(dotCounts).toEqual([3, 2, 3]); // recall, precision (gap), citation
  });

  it("AC-59: moving the keyboard cursor over a point shows that run's agent version and cost", async () => {
    const user = userEvent.setup();
    h.q.data = { points: [point(1, { cost_usd: 0.1234 }), point(2, { agent_version: 7, cost_usd: 0.5 })] };
    renderWithIntl(<TrendChart agentId="ag1" />);

    const chart = screen.getByRole("application", { hidden: true });
    chart.focus();
    await user.keyboard("{ArrowRight}");

    const tooltip = await screen.findByTestId("trend-tooltip");
    expect(tooltip).toHaveTextContent("Agent versionv7");
    expect(tooltip).toHaveTextContent("Cost$0.500");

    await user.keyboard("{ArrowLeft}");
    expect(await screen.findByTestId("trend-tooltip")).toHaveTextContent("Agent versionv1");
    expect(screen.getByTestId("trend-tooltip")).toHaveTextContent("Cost$0.123");
  });
});
