import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import type { EvalDashboardOverview } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";
import { evalRun } from "@/test/eval-fixtures";

const h = vi.hoisted(() => ({
  q: { data: undefined as unknown, isError: false, refetch: vi.fn() },
}));

vi.mock("@/lib/hooks", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useEvalDashboard: () => h.q,
}));
vi.mock("@/components/app-shell", () => ({ usePageCrumb: () => {} }));

import { EvalDashboardView } from "./EvalDashboardView";

const withName = (id: string, agent_id: string, agent_name: string, over = {}) => ({
  ...evalRun({ id, agent_id, ...over }),
  agent_name,
});

beforeEach(() => {
  h.q = { data: undefined, isError: false, refetch: vi.fn() };
});
afterEach(cleanup);

describe("EvalDashboardView", () => {
  it("AC-42: lists every agent with its latest counted run's version, time, passed / completed and the three metrics", () => {
    const data: EvalDashboardOverview = {
      agents: [
        {
          agent_id: "a1",
          name: "Security Reviewer",
          latest: evalRun({ id: "r1", agent_id: "a1", agent_version: 3, recall: 0.8, precision: 0.5, citation_accuracy: 1, cases_passed: 3, cases_completed: 4 }),
        },
        { agent_id: "a2", name: "Style Reviewer", latest: null },
      ],
      recent_runs: [],
    };
    h.q.data = data;
    renderWithIntl(<EvalDashboardView />);

    const row = within(screen.getByTestId("agent-row-a1"));
    expect(row.getByText("Security Reviewer")).toBeInTheDocument();
    expect(row.getByText(/Last run v3/)).toBeInTheDocument();
    expect(row.getByText(/3 \/ 4 passed/)).toBeInTheDocument();
    expect(row.getByText("80%")).toBeInTheDocument();
    expect(row.getByText("50%")).toBeInTheDocument();
    expect(row.getByText("100%")).toBeInTheDocument();
    expect(screen.getByTestId("agent-row-a1")).toHaveAttribute("href", "/eval/a1");

    const none = within(screen.getByTestId("agent-row-a2"));
    expect(none.getByText("No eval runs yet")).toBeInTheDocument();
    expect(none.getAllByText("—")).toHaveLength(3);
  });

  it("AC-66: an agent whose newest run is running or failed shows 'No eval runs yet', not that run's numbers", () => {
    h.q.data = {
      agents: [
        { agent_id: "a1", name: "Busy", latest: evalRun({ id: "r1", agent_id: "a1", status: "running", recall: 0.9 }) },
        { agent_id: "a2", name: "Broken", latest: evalRun({ id: "r2", agent_id: "a2", status: "failed", recall: 0.9 }) },
      ],
      recent_runs: [],
    } satisfies EvalDashboardOverview;
    renderWithIntl(<EvalDashboardView />);

    expect(within(screen.getByTestId("agent-row-a1")).getByText("No eval runs yet")).toBeInTheDocument();
    expect(within(screen.getByTestId("agent-row-a2")).getByText("No eval runs yet")).toBeInTheDocument();
    expect(screen.queryByText("90%")).not.toBeInTheDocument();
  });

  it("AC-43: shows the newest counted runs across agents with agent name, version, the three metrics and passed / completed", () => {
    h.q.data = {
      agents: [{ agent_id: "a1", name: "Security Reviewer", latest: null }],
      recent_runs: [
        withName("r1", "a1", "Security Reviewer", { agent_version: 4, recall: 0.6, precision: 0.7, citation_accuracy: 0.8, cases_passed: 1, cases_completed: 2 }),
        withName("r2", "a2", "Style Reviewer", { agent_version: 1, status: "partial" }),
      ],
    } satisfies EvalDashboardOverview;
    renderWithIntl(<EvalDashboardView />);

    const rows = within(screen.getByTestId("recent-runs")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole("link", { name: "Security Reviewer" })).toHaveAttribute("href", "/eval/a1");
    expect(within(rows[0]!).getByText("v4")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("60%")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("70%")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("80%")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("1 / 2")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Style Reviewer")).toBeInTheDocument();
  });

  it("AC-43, AC-66: a running or failed run is never a row of the recent table, and the table shows at most 6 rows", () => {
    const counted = Array.from({ length: 8 }, (_, i) => withName(`r${i}`, "a1", "Security Reviewer", { started_at: `2026-10-0${i + 1}T10:00:00.000Z` }));
    h.q.data = {
      agents: [],
      recent_runs: [
        withName("running", "a1", "Security Reviewer", { status: "running" }),
        withName("failed", "a1", "Security Reviewer", { status: "failed" }),
        ...counted,
      ],
    } satisfies EvalDashboardOverview;
    renderWithIntl(<EvalDashboardView />);

    const rows = within(screen.getByTestId("recent-runs")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(6);
    expect(screen.queryByText("running")).not.toBeInTheDocument();
  });

  it("AC-42, AC-43: no agents and no runs show the empty states", () => {
    h.q.data = { agents: [], recent_runs: [] } satisfies EvalDashboardOverview;
    renderWithIntl(<EvalDashboardView />);
    expect(screen.getByText("No agents yet")).toBeInTheDocument();
    expect(screen.getByText(/No eval runs yet\. Open an agent/)).toBeInTheDocument();
  });

  it("AC-42: a load error is shown with a retry", () => {
    h.q.isError = true;
    renderWithIntl(<EvalDashboardView />);
    expect(screen.getByText("The eval dashboard could not be loaded.")).toBeInTheDocument();
  });
});
