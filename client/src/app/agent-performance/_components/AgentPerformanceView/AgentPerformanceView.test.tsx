import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgentPerformance, AgentStats } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn(), pathname: "/agent-performance" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => nav.pathname,
}));

const hook = vi.hoisted(() => ({
  state: { data: undefined, isError: false, refetch: vi.fn() } as {
    data: unknown;
    isError: boolean;
    refetch: () => void;
  },
  lastSel: undefined as unknown,
}));
vi.mock("@/lib/hooks", () => ({
  useAgentPerformance: (sel: unknown) => {
    hook.lastSel = sel;
    return hook.state;
  },
}));

import { AgentPerformanceView } from "./AgentPerformanceView";

function stats(name: string | null, over: Partial<AgentStats> = {}): AgentStats {
  return {
    agent_id: name === null ? null : name.toLowerCase(),
    agent_name: name,
    runs: 10,
    runs_done: 10,
    runs_failed: 0,
    runs_cancelled: 0,
    accepted: 6,
    dismissed: 4,
    pending: 0,
    accept_rate: 0.6,
    total_cost_usd: 1,
    avg_cost_usd: 0.1,
    cost_partial: false,
    avg_duration_ms: 3000,
    last_run_at: "2026-10-20T10:00:00.000Z",
    cost_by_model: [{ model: "gpt-4o", cost_usd: 1 }],
    ...over,
  };
}

function perf(over: Partial<AgentPerformance> = {}): AgentPerformance {
  return {
    totals: {
      runs: 10,
      total_cost_usd: 1,
      cost_partial: false,
      accepted: 6,
      dismissed: 4,
      accept_rate: 0.6,
      most_active: { agent_id: "security", agent_name: "Security", runs: 10 },
    },
    agents: [stats("Security")],
    cost_by_agent: [{ agent_id: "security", agent_name: "Security", cost_usd: 1 }],
    cost_by_model: [{ model: "gpt-4o", cost_usd: 1 }],
    has_runs_outside_period: true,
    ...over,
  };
}

function emptyPerf(outside: boolean): AgentPerformance {
  return perf({
    totals: { runs: 0, total_cost_usd: null, cost_partial: false, accepted: 0, dismissed: 0, accept_rate: null, most_active: null },
    agents: [stats("Security", { runs: 0, accepted: 0, dismissed: 0, accept_rate: null, avg_cost_usd: null, avg_duration_ms: null, last_run_at: null })],
    cost_by_agent: [],
    cost_by_model: [],
    has_runs_outside_period: outside,
  });
}

beforeEach(() => {
  nav.search = "";
  nav.replace.mockReset();
  hook.state = { data: undefined, isError: false, refetch: vi.fn() };
  hook.lastSel = undefined;
});

const periodSelect = () => screen.getByRole("combobox", { name: "Period" });

describe("AgentPerformanceView", () => {
  it("AC-5: shows 30 days when the URL names no period, and asks for that period", () => {
    hook.state.data = perf();
    renderWithIntl(<AgentPerformanceView />);
    expect(periodSelect()).toHaveValue("30d");
    expect(hook.lastSel).toEqual({ period: "30d" });
  });

  it("AC-11: shows 30 days for an unknown period in the URL", () => {
    nav.search = "period=7d";
    hook.state.data = perf();
    renderWithIntl(<AgentPerformanceView />);
    expect(periodSelect()).toHaveValue("30d");
  });

  it("AC-10: shows the period named in the URL", () => {
    nav.search = "period=1d";
    hook.state.data = perf();
    renderWithIntl(<AgentPerformanceView />);
    expect(periodSelect()).toHaveValue("1d");
    expect(hook.lastSel).toEqual({ period: "1d" });
  });

  it("AC-6: selecting a period writes it to the URL", async () => {
    const user = userEvent.setup();
    hook.state.data = perf();
    renderWithIntl(<AgentPerformanceView />);
    await user.selectOptions(periodSelect(), "1d");
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace.mock.calls[0]?.[0]).toContain("period=1d");
  });

  it("AC-55: shows the note that costs are not reconciled with provider billing", () => {
    hook.state.data = perf();
    renderWithIntl(<AgentPerformanceView />);
    expect(screen.getByText(/not reconciled with provider billing/)).toBeInTheDocument();
  });

  it("with data, shows the tiles, the agents table and the cost breakdown", () => {
    hook.state.data = perf();
    renderWithIntl(<AgentPerformanceView />);
    expect(screen.getByRole("heading", { level: 1, name: "Agent Performance" })).toBeInTheDocument();
    expect(screen.getByText(/Total runs/)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Agents" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cost breakdown" })).toBeInTheDocument();
  });

  it("AC-56/AC-57: while loading shows placeholders and no figure", () => {
    renderWithIntl(<AgentPerformanceView />);
    const busy = screen.getByLabelText("Loading agent performance");
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy.querySelectorAll(".skeleton").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/Total runs/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$|%|\ds\b/)).not.toBeInTheDocument();
  });

  it("AC-58/AC-59: when loading fails shows the error state with a retry and no figure", async () => {
    const user = userEvent.setup();
    hook.state.isError = true;
    renderWithIntl(<AgentPerformanceView />);
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Could not load agent performance.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/Total runs/)).not.toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: /retry|try again/i }));
    expect(hook.state.refetch).toHaveBeenCalledTimes(1);
  });

  it("AC-60/EC-6: a workspace with no counted run at all shows \"No agent runs yet\"", () => {
    hook.state.data = emptyPerf(false);
    renderWithIntl(<AgentPerformanceView />);
    expect(screen.getByText("No agent runs yet")).toBeInTheDocument();
    expect(screen.queryByText("No runs in this period")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("AC-61/EC-6: a period with no run while others have some shows \"No runs in this period\"", () => {
    hook.state.data = emptyPerf(true);
    renderWithIntl(<AgentPerformanceView />);
    expect(screen.getByText("No runs in this period")).toBeInTheDocument();
    expect(screen.queryByText("No agent runs yet")).not.toBeInTheDocument();
  });

  it("AC-62: keeps the period control while loading", () => {
    renderWithIntl(<AgentPerformanceView />);
    expect(periodSelect()).toBeInTheDocument();
  });

  it("AC-62: keeps the period control when the period has no run", () => {
    hook.state.data = emptyPerf(true);
    renderWithIntl(<AgentPerformanceView />);
    expect(periodSelect()).toBeInTheDocument();
  });

  it("AC-62: keeps the period control when loading failed", () => {
    hook.state.isError = true;
    renderWithIntl(<AgentPerformanceView />);
    expect(periodSelect()).toBeInTheDocument();
  });

  it("AC-62: keeps the period control when the workspace has no run at all", () => {
    hook.state.data = emptyPerf(false);
    renderWithIntl(<AgentPerformanceView />);
    expect(periodSelect()).toBeInTheDocument();
  });
});
