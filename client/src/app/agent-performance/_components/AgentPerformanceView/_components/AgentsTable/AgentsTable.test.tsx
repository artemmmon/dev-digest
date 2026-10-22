import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgentStats } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";
import { AgentsTable } from "./AgentsTable";

function agent(name: string | null, over: Partial<AgentStats> = {}): AgentStats {
  return {
    agent_id: name === null ? null : name.toLowerCase().replace(/\s+/g, "-"),
    agent_name: name,
    runs: 10,
    runs_done: 8,
    runs_failed: 1,
    runs_cancelled: 1,
    accepted: 12,
    dismissed: 8,
    pending: 3,
    accept_rate: 0.6,
    total_cost_usd: 1,
    avg_cost_usd: 0.1,
    cost_partial: false,
    avg_duration_ms: 6200,
    last_run_at: "2026-10-20T10:30:00.000Z",
    cost_by_model: [{ model: "gpt-4o", cost_usd: 1 }],
    ...over,
  };
}

const PERIOD = { period: "30d" } as const;
const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

describe("AgentsTable", () => {
  it("AC-24: shows the columns Agent, Runs, Avg cost, Avg duration, Accept rate, Last run and View", () => {
    renderWithIntl(<AgentsTable agents={[agent("Security")]} period={PERIOD} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent ?? "");
    expect(headers[0]).toBe("Agent");
    expect(headers[1]).toBe("Runs");
    expect(headers[2]).toContain("Avg cost");
    expect(headers[3]).toBe("Avg duration");
    expect(headers[4]).toContain("Accept rate");
    expect(headers[5]).toBe("Last run");
    expect(headers[6]).toBe("View");
  });

  it("AC-23/AC-25..31: one row per agent with its runs, average cost, duration, accept rate, decisions and last run", () => {
    renderWithIntl(<AgentsTable agents={[agent("Security"), agent("Perf", { runs: 3, accepted: 1, dismissed: 1 })]} period={PERIOD} />);
    const row = within(rowOf("Security"));
    expect(row.getByText("10")).toBeInTheDocument();
    expect(row.getByText("$0.100")).toBeInTheDocument();
    expect(row.getByText("6.2s")).toBeInTheDocument();
    expect(row.getByText("60%")).toBeInTheDocument();
    expect(row.getByText("20 decisions")).toBeInTheDocument();
    expect(row.getByText(/2026/)).toBeInTheDocument();
    expect(screen.getByText("Perf")).toBeInTheDocument();
  });

  it("AC-27: marks an average cost as partial when a run has no stored cost", () => {
    renderWithIntl(<AgentsTable agents={[agent("Security", { cost_partial: true }), agent("Perf")]} period={PERIOD} />);
    expect(within(rowOf("Security")).getByText("partial")).toBeInTheDocument();
    expect(within(rowOf("Perf")).queryByText("partial")).not.toBeInTheDocument();
  });

  it("AC-54: labels the Avg cost column as a DevDigest estimate", () => {
    renderWithIntl(<AgentsTable agents={[agent("Security")]} period={PERIOD} />);
    expect(within(screen.getByRole("columnheader", { name: /Avg cost/ })).getByText("DevDigest estimate")).toBeInTheDocument();
  });

  it("AC-32/AC-33/AC-34/EC-15: shows — for a missing rate, cost or duration, and keeps the figures that exist", () => {
    renderWithIntl(
      <AgentsTable
        agents={[agent("Quiet", { accepted: 0, dismissed: 0, accept_rate: null, avg_cost_usd: null, avg_duration_ms: null, last_run_at: null })]}
        period={PERIOD}
      />,
    );
    expect(within(rowOf("Quiet")).getAllByText("—")).toHaveLength(4);
    renderWithIntl(<AgentsTable agents={[agent("NoCost", { avg_cost_usd: null })]} period={PERIOD} />);
    const row = within(rowOf("NoCost"));
    expect(row.getByText("60%")).toBeInTheDocument();
    expect(row.getByText("—")).toBeInTheDocument();
  });

  it("AC-35/EC-5: says there was no run in the period instead of showing figures", () => {
    renderWithIntl(<AgentsTable agents={[agent("Idle", { runs: 0, accept_rate: null, accepted: 0, dismissed: 0 })]} period={PERIOD} />);
    const row = within(rowOf("Idle"));
    expect(row.getByText("No runs in this period")).toBeInTheDocument();
    expect(row.queryByText("0")).not.toBeInTheDocument();
    expect(row.queryByText(/small sample/)).not.toBeInTheDocument();
  });

  it("AC-36/AC-37: shows the deleted agent as one row named \"Deleted agent\" with no View link", () => {
    renderWithIntl(<AgentsTable agents={[agent(null), agent("Security")]} period={PERIOD} />);
    const row = within(rowOf("Deleted agent"));
    expect(row.queryByRole("link")).not.toBeInTheDocument();
    expect(within(rowOf("Security")).getByRole("link", { name: "View stats of Security" })).toBeInTheDocument();
  });

  it("AC-38: marks an accept rate built on fewer than 10 decisions as a small sample", () => {
    renderWithIntl(
      <AgentsTable
        agents={[agent("Few", { accepted: 3, dismissed: 0, accept_rate: 1 }), agent("Many")]}
        period={PERIOD}
      />,
    );
    expect(within(rowOf("Few")).getByText("small sample")).toBeInTheDocument();
    expect(within(rowOf("Many")).queryByText("small sample")).not.toBeInTheDocument();
  });

  it("AC-39/AC-40/AC-41: the Accept rate header sorts highest first, then lowest first, small samples last", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <AgentsTable
        agents={[
          agent("Mid", { accepted: 12, dismissed: 8, accept_rate: 0.6, runs: 30 }),
          agent("Tiny", { accepted: 3, dismissed: 0, accept_rate: 1, runs: 20 }),
          agent("High", { accepted: 18, dismissed: 2, accept_rate: 0.9, runs: 10 }),
        ]}
        period={PERIOD}
      />,
    );
    const order = () => screen.getAllByRole("row").slice(1).map((r) => r.querySelector("td span:last-child")?.textContent);
    expect(order()).toEqual(["Mid", "Tiny", "High"]);
    const header = screen.getByRole("columnheader", { name: /Accept rate/ });
    expect(header).toHaveAttribute("aria-sort", "none");

    await user.click(within(header).getByRole("button", { name: /Accept rate/ }));
    expect(order()).toEqual(["High", "Mid", "Tiny"]);
    expect(header).toHaveAttribute("aria-sort", "descending");

    await user.click(within(header).getByRole("button", { name: /Accept rate/ }));
    expect(order()).toEqual(["Mid", "High", "Tiny"]);
    expect(header).toHaveAttribute("aria-sort", "ascending");
  });

  it("only the Accept rate header is a button", () => {
    renderWithIntl(<AgentsTable agents={[agent("Security")]} period={PERIOD} />);
    for (const h of screen.getAllByRole("columnheader")) {
      const isAccept = /Accept rate/.test(h.textContent ?? "");
      expect(within(h).queryAllByRole("button")).toHaveLength(isAccept ? 1 : 0);
    }
  });

  it("AC-42/AC-43/NFR-3: the expand button shows and hides the details and exposes aria-expanded", async () => {
    const user = userEvent.setup();
    renderWithIntl(<AgentsTable agents={[agent("Security")]} period={PERIOD} />);
    const expand = screen.getByRole("button", { name: "Show details of Security" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Findings")).not.toBeInTheDocument();

    await user.click(expand);
    const collapse = screen.getByRole("button", { name: "Hide details of Security" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(collapse.getAttribute("aria-controls") ?? "")).toBeInTheDocument();
    expect(screen.getByText("Findings")).toBeInTheDocument();

    await user.click(collapse);
    expect(screen.queryByText("Findings")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show details of Security" })).toHaveAttribute("aria-expanded", "false");
  });

  it("AC-44/AC-45: the details show runs per state and accepted, dismissed and pending findings", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <AgentsTable
        agents={[agent("Security", { runs_done: 7, runs_failed: 2, runs_cancelled: 1, accepted: 11, dismissed: 4, pending: 5 })]}
        period={PERIOD}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Show details of Security" }));
    const item = (label: string) => screen.getByText(label).closest("li") as HTMLElement;
    expect(within(item("Done")).getByText("7")).toBeInTheDocument();
    expect(within(item("Failed")).getByText("2")).toBeInTheDocument();
    expect(within(item("Cancelled")).getByText("1")).toBeInTheDocument();
    expect(within(item("Accepted")).getByText("11")).toBeInTheDocument();
    expect(within(item("Dismissed")).getByText("4")).toBeInTheDocument();
    expect(within(item("Pending")).getByText("5")).toBeInTheDocument();
  });

  it("AC-46: the details show the cost per model, and a missing model as Unknown model", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <AgentsTable
        agents={[
          agent("Security", {
            cost_by_model: [
              { model: "gpt-4o", cost_usd: 0.5 },
              { model: null, cost_usd: 0.25 },
            ],
          }),
        ]}
        period={PERIOD}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Show details of Security" }));
    expect(within(screen.getByText("gpt-4o").closest("li") as HTMLElement).getByText("$0.500")).toBeInTheDocument();
    expect(within(screen.getByText("Unknown model").closest("li") as HTMLElement).getByText("$0.250")).toBeInTheDocument();
  });

  it("AC-47: View links to the agent's Stats tab with the selected period", () => {
    renderWithIntl(
      <AgentsTable agents={[agent("Security")]} period={{ period: "custom", from: "2026-10-01", to: "2026-10-07" }} />,
    );
    expect(screen.getByRole("link", { name: "View stats of Security" })).toHaveAttribute(
      "href",
      "/agents/security?tab=stats&period=custom&from=2026-10-01&to=2026-10-07",
    );
  });

  it("renders an agent name as text, not markup", () => {
    const evil = "<img src=x onerror=alert(1)>";
    const { container } = renderWithIntl(<AgentsTable agents={[agent(evil)]} period={PERIOD} />);
    expect(screen.getByText(evil)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
