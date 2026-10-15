import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EvalRunsOverview } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { renderWithIntl } from "@/test/render";
import { evalCase, evalRun } from "@/test/eval-fixtures";

const h = vi.hoisted(() => ({
  agent: { data: undefined as unknown, isError: false, error: null as unknown, refetch: vi.fn() },
  runs: { data: undefined as unknown, isError: false, refetch: vi.fn() },
  cases: { data: [] as unknown[] | undefined, isError: false, refetch: vi.fn() },
  start: { mutate: vi.fn(), isPending: false },
  limit: 0,
}));

vi.mock("@/lib/hooks", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useEvalRuns: (_id: string, limit: number) => {
    h.limit = limit;
    return h.runs;
  },
  useEvalCases: () => h.cases,
  useEvalTrend: () => ({ data: { points: [] }, isError: false }),
  useStartEvalRun: () => h.start,
}));
vi.mock("@/lib/hooks/agents", () => ({ useAgent: () => h.agent }));
vi.mock("@/components/app-shell", () => ({ usePageCrumb: () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// the compare modal has its own test; here it only has to open with the two chosen run ids
vi.mock("../CompareView", () => ({
  CompareView: ({ a, b }: { a: string; b: string }) => <div role="dialog">compare {a} {b}</div>,
}));

import { EvalAgentView } from "./EvalAgentView";

const overview = (over: Partial<EvalRunsOverview>): EvalRunsOverview => ({
  runs: [],
  latest_counted: null,
  previous_counted: null,
  ...over,
});

const prev = evalRun({ id: "r-prev", started_at: "2026-10-10T10:00:00.000Z", recall: 0.9, precision: 0.5, citation_accuracy: 0.8 });
const last = evalRun({ id: "r-last", started_at: "2026-10-11T10:00:00.000Z", recall: 0.6, precision: 0.5, citation_accuracy: 0.8 });
const failed = evalRun({ id: "r-failed", status: "failed", started_at: "2026-10-12T10:00:00.000Z", recall: null, precision: null, citation_accuracy: null, cases_completed: 0, cases_errored: 4, cases_passed: 0 });

beforeEach(() => {
  h.agent = { data: { id: "ag1", name: "Security Reviewer", model: "gpt-4.1" }, isError: false, error: null, refetch: vi.fn() };
  h.runs = { data: overview({ runs: [last, prev], latest_counted: last, previous_counted: prev }), isError: false, refetch: vi.fn() };
  h.cases = { data: [evalCase({ id: "c1" })], isError: false, refetch: vi.fn() };
  h.start = { mutate: vi.fn(), isPending: false };
  h.limit = 0;
});
afterEach(cleanup);

const render = () => renderWithIntl(<EvalAgentView agentId="ag1" />);

describe("EvalAgentView", () => {
  it("AC-44: shows the metric cards above a runs table that asks for at most 50 runs", () => {
    render();
    expect(within(screen.getByTestId("metric-recall")).getByText("60%")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-recall")).getByText("▼ 30pt")).toBeInTheDocument();
    expect(h.limit).toBe(50);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(3); // header + 2 runs
    // cards come before the table in the document
    const card = screen.getByTestId("metric-recall");
    expect(card.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("AC-40: names the dropped metric with its drop in points", () => {
    render();
    expect(screen.getByRole("alert")).toHaveTextContent("Recall dropped 30 points");
  });

  it("AC-18: 'Run eval' starts a run; with no case it is disabled with 'Add a case first'", async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole("button", { name: "Run eval" }));
    expect(h.start.mutate).toHaveBeenCalledTimes(1);
    cleanup();

    h.cases.data = [];
    render();
    const run = screen.getByRole("button", { name: "Run eval" });
    expect(run).toBeDisabled();
    expect(run).toHaveAccessibleDescription("Add a case first");
  });

  it("AC-45: Compare is disabled until exactly two counted runs are selected, then opens the compare view", async () => {
    const user = userEvent.setup();
    render();
    const compare = screen.getByRole("button", { name: "Compare" });
    expect(compare).toBeDisabled();

    const boxes = screen.getAllByRole("checkbox");
    await user.click(boxes[0]!);
    expect(compare).toBeDisabled();
    await user.click(boxes[1]!);
    expect(compare).toBeEnabled();

    await user.click(compare);
    expect(screen.getByRole("dialog")).toHaveTextContent("compare r-last r-prev");
  });

  it("EC-11, AC-45: a failed run cannot be selected, so it can never be compared", () => {
    h.runs.data = overview({ runs: [failed, last, prev], latest_counted: last, previous_counted: prev });
    render();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    expect(boxes[0]).toBeDisabled(); // the failed run
    expect(within(screen.getByRole("table")).getByText("failed")).toBeInTheDocument();
  });

  it("AC-22: while a run is running the action shows its progress k / n", () => {
    const running = evalRun({ id: "r-run", status: "running", cases_total: 5, cases_completed: 2, cases_errored: 1, cases_passed: 1, recall: null, precision: null, citation_accuracy: null });
    h.runs.data = overview({ runs: [running, last, prev], latest_counted: last, previous_counted: prev });
    render();
    expect(screen.getByRole("button", { name: "Running 3 / 5 cases" })).toBeDisabled();
  });

  it("AC-44: an agent that does not exist shows the not-found state", () => {
    h.agent = { data: undefined, isError: true, error: new ApiError("Agent not found", 404, "not_found"), refetch: vi.fn() };
    render();
    expect(screen.getByText("Agent not found")).toBeInTheDocument();
  });
});
