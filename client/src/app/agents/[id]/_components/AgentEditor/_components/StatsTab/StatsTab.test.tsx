import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Agent, AgentStats } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn(), pathname: "/agents/ag1" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => nav.pathname,
}));

// Only the read hook exists in this mock: a tab that tried to start a review run would have no hook to call.
const hook = vi.hoisted(() => ({
  state: { data: undefined, isError: false, refetch: vi.fn() } as {
    data: unknown;
    isError: boolean;
    refetch: () => void;
  },
  calls: [] as Array<{ agentId: unknown; sel: unknown }>,
}));
vi.mock("@/lib/hooks", () => ({
  useAgentStats: (agentId: unknown, sel: unknown) => {
    hook.calls.push({ agentId, sel });
    return hook.state;
  },
}));

import { StatsTab } from "./StatsTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function stats(over: Partial<AgentStats> = {}): AgentStats {
  return {
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    runs: 12,
    runs_done: 10,
    runs_failed: 1,
    runs_cancelled: 1,
    accepted: 8,
    dismissed: 4,
    pending: 0,
    accept_rate: 8 / 12,
    total_cost_usd: 1.2,
    avg_cost_usd: 0.1,
    cost_partial: false,
    avg_duration_ms: 6200,
    last_run_at: "2026-10-20T10:00:00.000Z",
    cost_by_model: [{ model: "gpt-4.1", cost_usd: 1.2 }],
    ...over,
  };
}

function setStats(data: AgentStats | undefined, isError = false) {
  hook.state = { data, isError, refetch: hook.state.refetch };
}

const lastCall = () => hook.calls[hook.calls.length - 1]!;

beforeEach(() => {
  nav.search = "";
  nav.replace.mockReset();
  hook.calls = [];
  hook.state = { data: undefined, isError: false, refetch: vi.fn() };
});

describe("StatsTab", () => {
  it("AC-66: only reads the agent's figures and starts no review run", () => {
    setStats(stats());
    renderWithIntl(<StatsTab agent={AGENT} />);
    expect(hook.calls.length).toBeGreaterThan(0);
    expect(hook.calls.every((c) => c.agentId === "ag1")).toBe(true);
  });

  it("AC-68: offers 1 day, 30 days and Custom range", () => {
    setStats(stats());
    renderWithIntl(<StatsTab agent={AGENT} />);
    const options = Array.from(screen.getByRole("combobox", { name: "Period" }).querySelectorAll("option")).map(
      (o) => o.textContent,
    );
    expect(options).toEqual(["1 day", "30 days", "Custom range"]);
  });

  it("AC-68: choosing 1 day writes the period to the URL", async () => {
    setStats(stats());
    const user = userEvent.setup();
    renderWithIntl(<StatsTab agent={AGENT} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Period" }), "1d");
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(String(nav.replace.mock.calls[0]![0])).toContain("period=1d");
  });

  it("AC-69: with no period in the URL the tab shows 30 days", () => {
    setStats(stats());
    renderWithIntl(<StatsTab agent={AGENT} />);
    expect(lastCall().sel).toEqual({ period: "30d" });
    expect(screen.getByRole("combobox", { name: "Period" })).toHaveValue("30d");
  });

  it("AC-70: a reload keeps the period from the URL", () => {
    nav.search = "tab=stats&period=1d";
    setStats(stats());
    renderWithIntl(<StatsTab agent={AGENT} />);
    expect(lastCall().sel).toEqual({ period: "1d" });
    expect(screen.getByRole("combobox", { name: "Period" })).toHaveValue("1d");
  });

  it("AC-70: a custom range from the URL is requested as is", () => {
    nav.search = "tab=stats&period=custom&from=2026-10-01&to=2026-10-07";
    setStats(stats());
    renderWithIntl(<StatsTab agent={AGENT} />);
    expect(lastCall().sel).toEqual({ period: "custom", from: "2026-10-01", to: "2026-10-07" });
  });

  it("AC-71: shows the number of counted runs", () => {
    setStats(stats({ runs: 12 }));
    renderWithIntl(<StatsTab agent={AGENT} />);
    expect(screen.getByText("Runs").parentElement).toHaveTextContent("12");
  });

  it("AC-72, AC-79: shows the average cost, labelled as a DevDigest estimate", () => {
    setStats(stats({ avg_cost_usd: 0.1 }));
    renderWithIntl(<StatsTab agent={AGENT} />);
    const tile = screen.getByText(/Avg cost/).parentElement as HTMLElement;
    expect(tile).toHaveTextContent("$0.100");
    expect(tile).toHaveTextContent("DevDigest estimate");
  });

  it("AC-73: marks the average cost partial when a run has no stored cost", () => {
    setStats(stats({ cost_partial: true }));
    renderWithIntl(<StatsTab agent={AGENT} />);
    expect(screen.getByText("partial")).toBeInTheDocument();
  });

  it("AC-73: no partial mark when every run is priced", () => {
    setStats(stats({ cost_partial: false }));
    renderWithIntl(<StatsTab agent={AGENT} />);
    expect(screen.queryByText("partial")).not.toBeInTheDocument();
  });

  it("AC-74: shows the mean duration", () => {
    setStats(stats({ avg_duration_ms: 6200 }));
    renderWithIntl(<StatsTab agent={AGENT} />);
    expect(screen.getByText("Avg duration").parentElement).toHaveTextContent("6.2s");
  });

  it("AC-75, AC-76: shows the accept rate and the decisions it is computed from", () => {
    setStats(stats({ accepted: 8, dismissed: 4, accept_rate: 8 / 12 }));
    renderWithIntl(<StatsTab agent={AGENT} />);
    const tile = screen.getByText("Accept rate").parentElement as HTMLElement;
    expect(tile).toHaveTextContent("67%");
    expect(tile).toHaveTextContent("12 decisions");
  });

  it("AC-77: marks a small sample under 10 decisions", () => {
    setStats(stats({ accepted: 3, dismissed: 2, accept_rate: 0.6 }));
    renderWithIntl(<StatsTab agent={AGENT} />);
    expect(screen.getByText("small sample")).toBeInTheDocument();
  });

  it("AC-77: 10 decisions is not a small sample", () => {
    setStats(stats({ accepted: 6, dismissed: 4, accept_rate: 0.6 }));
    renderWithIntl(<StatsTab agent={AGENT} />);
    expect(screen.queryByText("small sample")).not.toBeInTheDocument();
  });

  it("AC-78: a figure with no data shows a dash", () => {
    setStats(stats({ avg_cost_usd: null, total_cost_usd: null, avg_duration_ms: null, accepted: 0, dismissed: 0, accept_rate: null }));
    renderWithIntl(<StatsTab agent={AGENT} />);
    expect(screen.getByText(/Avg cost/).parentElement).toHaveTextContent("—");
    expect(screen.getByText("Avg duration").parentElement).toHaveTextContent("—");
    expect(screen.getByText("Accept rate").parentElement).toHaveTextContent("—");
    expect(screen.getByText("0 decisions")).toBeInTheDocument();
  });

  it("AC-80: while loading shows placeholders and no figure", () => {
    setStats(undefined);
    renderWithIntl(<StatsTab agent={AGENT} />);
    expect(screen.getByLabelText("Loading agent stats")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Runs")).not.toBeInTheDocument();
    expect(screen.queryByText("Accept rate")).not.toBeInTheDocument();
    expect(screen.queryByText("DevDigest estimate")).not.toBeInTheDocument();
    // The period control stays on screen.
    expect(screen.getByRole("combobox", { name: "Period" })).toBeInTheDocument();
  });

  it("AC-81: a failed load shows the error state with a retry action", async () => {
    setStats(undefined, true);
    const user = userEvent.setup();
    renderWithIntl(<StatsTab agent={AGENT} />);
    expect(screen.getByText("Could not load this agent's stats.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(hook.state.refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Accept rate")).not.toBeInTheDocument();
  });

  it("AC-82: an agent with no counted run shows 'No runs in this period'", () => {
    setStats(stats({ runs: 0, accepted: 0, dismissed: 0, accept_rate: null, avg_cost_usd: null, avg_duration_ms: null, last_run_at: null }));
    renderWithIntl(<StatsTab agent={AGENT} />);
    expect(screen.getByText("No runs in this period")).toBeInTheDocument();
    expect(screen.queryByText("Accept rate")).not.toBeInTheDocument();
  });
});
