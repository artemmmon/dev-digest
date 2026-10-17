import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Agent, EvalCaseRecord, EvalRunsOverview } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";
import { evalCase, evalRun } from "@/test/eval-fixtures";

const h = vi.hoisted(() => ({
  cases: { data: [] as unknown[] | undefined, isError: false, refetch: vi.fn() },
  runs: { data: undefined as unknown, isError: false, refetch: vi.fn() },
  start: { mutate: vi.fn(), isPending: false },
  create: { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null as unknown },
  update: { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null as unknown },
  remove: { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null as unknown },
  trend: { data: { points: [] as unknown[] }, isError: false },
}));

vi.mock("@/lib/hooks", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useEvalCases: () => h.cases,
  useEvalRuns: () => h.runs,
  useEvalTrend: () => h.trend,
  useStartEvalRun: () => h.start,
  useCreateEvalCase: () => h.create,
  useUpdateEvalCase: () => h.update,
  useDeleteEvalCase: () => h.remove,
}));

import { EvalsTab } from "./EvalsTab";

const AGENT = { id: "ag1", name: "Security Reviewer", model: "gpt-4.1" } as Agent;

function overview(over: Partial<EvalRunsOverview> = {}): EvalRunsOverview {
  return { runs: [], latest_counted: null, previous_counted: null, ...over };
}

beforeEach(() => {
  h.cases = { data: [], isError: false, refetch: vi.fn() };
  h.runs = { data: overview(), isError: false, refetch: vi.fn() };
  h.start = { mutate: vi.fn(), isPending: false };
  h.create = { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null };
  h.update = { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null };
  h.remove = { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null };
  h.trend = { data: { points: [] }, isError: false };
});
afterEach(cleanup);

const render = () => renderWithIntl(<EvalsTab agent={AGENT} />);

describe("EvalsTab — cases", () => {
  it("AC-15, AC-16: lists every case with its name, type badge, count badge and its outcome with 'expected N, got M'", () => {
    h.cases.data = [
      evalCase({ id: "c1", name: "must-find-key-leak", latest: { status: "pass", expected_count: 1, matched_count: 1 } }),
      evalCase({
        id: "c2",
        name: "no-unused-import",
        expected_output: { type: "must_not_flag", file: "src/b.ts", start_line: 3, end_line: 4 },
        latest: { status: "fail", expected_count: 0, matched_count: 2 },
      }),
      evalCase({ id: "c3", name: "boom-case", latest: { status: "error", expected_count: 1, matched_count: null } }),
      evalCase({ id: "c4", name: "fresh-case", latest: { status: "never_run" } }),
    ];
    render();

    expect(screen.getByText("4 cases")).toBeInTheDocument();
    const row = (name: string) => within(screen.getByText(name).closest("li")!);
    expect(row("must-find-key-leak").getByText("Must find")).toBeInTheDocument();
    expect(row("must-find-key-leak").getByText(/pass/)).toHaveTextContent("expected 1, got 1");
    expect(row("no-unused-import").getByText("Must not flag")).toBeInTheDocument();
    expect(row("no-unused-import").getByText(/fail/)).toHaveTextContent("expected 0, got 2");
    expect(row("boom-case").getByText("error")).toBeInTheDocument();
    expect(row("boom-case").queryByText(/expected/)).not.toBeInTheDocument();
    expect(row("fresh-case").getByText("never run")).toBeInTheDocument();
  });

  it("AC-17: an agent with no case shows Run all evals disabled with the reason 'Add a case first'", () => {
    render();
    const run = screen.getByRole("button", { name: "Run all evals" });
    expect(run).toBeDisabled();
    expect(run).toHaveAccessibleDescription("Add a case first");
  });

  it("AC-18: with cases, 'Run all evals' is enabled and a click starts a run", async () => {
    const user = userEvent.setup();
    h.cases.data = [evalCase({ id: "c1" })];
    render();
    const run = screen.getByRole("button", { name: "Run all evals" });
    expect(run).toBeEnabled();
    await user.click(run);
    expect(h.start.mutate).toHaveBeenCalledTimes(1);
  });

  it("AC-22: while a run is running the action shows k / n cases (completed plus errored) and is disabled", () => {
    h.cases.data = [evalCase({ id: "c1" }), evalCase({ id: "c2" }), evalCase({ id: "c3" })];
    h.runs.data = overview({
      runs: [evalRun({ id: "r1", status: "running", cases_total: 3, cases_completed: 1, cases_errored: 1, cases_passed: 1, recall: null, precision: null, citation_accuracy: null })],
    });
    render();
    const button = screen.getByRole("button", { name: "Running 2 / 3 cases" });
    expect(button).toBeDisabled();
  });

  it("EC-8: a case created while a run is running reads 'never run' and is not counted in the run's k / n", () => {
    h.cases.data = [
      evalCase({ id: "c1", latest: { status: "never_run" } }),
      evalCase({ id: "c2", latest: { status: "never_run" } }),
    ];
    h.runs.data = overview({
      runs: [evalRun({ id: "r1", status: "running", cases_total: 1, cases_completed: 0, cases_passed: 0, recall: null, precision: null, citation_accuracy: null })],
    });
    render();
    expect(screen.getAllByText("never run")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Running 0 / 1 cases" })).toBeInTheDocument();
  });
});

describe("EvalsTab — metrics and history", () => {
  const previous = evalRun({ id: "r-prev", started_at: "2026-10-10T10:00:00.000Z", recall: 0.9, precision: 0.6, citation_accuracy: 0.8, cases_passed: 3, cases_completed: 4 });
  const latest = evalRun({ id: "r-latest", started_at: "2026-10-11T10:00:00.000Z", recall: 0.7, precision: 0.8, citation_accuracy: 0.8, cases_passed: 2, cases_completed: 4 });

  it("AC-37: shows the latest counted run as whole percentages with the change in points and 'Traces passed'", () => {
    h.cases.data = [evalCase({ id: "c1" })];
    h.runs.data = overview({ runs: [latest, previous], latest_counted: latest, previous_counted: previous });
    render();

    expect(within(screen.getByTestId("metric-recall")).getByText("70%")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-recall")).getByText("▼ 20pt")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-precision")).getByText("80%")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-precision")).getByText("▲ 20pt")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-citation_accuracy")).getByText("80%")).toBeInTheDocument();
    expect(within(screen.getByTestId("metric-traces")).getByText("2 / 4")).toBeInTheDocument();
  });

  it("AC-37, AC-34: with no counted run every card shows an em dash", () => {
    render();
    for (const id of ["metric-recall", "metric-precision", "metric-citation_accuracy", "metric-traces"]) {
      expect(within(screen.getByTestId(id)).getByText("—")).toBeInTheDocument();
    }
  });

  it("AC-40: a drop of at least one point raises an alert naming each dropped metric with its drop", () => {
    h.runs.data = overview({ runs: [latest, previous], latest_counted: latest, previous_counted: previous });
    render();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Recall dropped 20 points");
    expect(alert).not.toHaveTextContent("Precision");
    expect(alert).not.toHaveTextContent("Citation");
  });

  it("AC-40: no alert when nothing dropped, or when there is no previous counted run", () => {
    h.runs.data = overview({ runs: [previous], latest_counted: previous, previous_counted: null });
    render();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("AC-40, AC-66: a failed or running newest run never sets the card or the alert (the counted pair is what the server sends)", () => {
    const failed = evalRun({ id: "r-failed", status: "failed", started_at: "2026-10-12T10:00:00.000Z", recall: null, precision: null, citation_accuracy: null, cases_completed: 0, cases_passed: 0, cases_errored: 4 });
    h.runs.data = overview({ runs: [failed, latest, previous], latest_counted: latest, previous_counted: previous });
    render();
    expect(within(screen.getByTestId("metric-recall")).getByText("70%")).toBeInTheDocument();
    // the failed run is listed with its badge, but it is not the alert's latest run
    expect(screen.getByText("failed", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Recall dropped 20 points");
  });

  it("AC-38: the run history lists the runs newest first with a badge for a non-done run", () => {
    const partial = evalRun({ id: "r-partial", status: "partial", started_at: "2026-10-12T10:00:00.000Z" });
    h.runs.data = overview({ runs: [partial, latest, previous], latest_counted: partial, previous_counted: latest });
    render();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("partial")).toBeInTheDocument();
    expect(screen.getByText("Recent runs")).toBeInTheDocument();
  });

  it("AC-38: with no run yet it says so instead of showing an empty table", () => {
    render();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(/No runs yet/)).toBeInTheDocument();
  });

  it("AC-39: 'View full dashboard →' links to the agent's dashboard page", () => {
    render();
    expect(screen.getByRole("link", { name: "View full dashboard →" })).toHaveAttribute("href", "/eval/ag1");
  });

  it("AC-58: the tab mounts the trend chart (empty state while the agent has no counted run)", () => {
    render();
    expect(screen.getByText("Metric trend")).toBeInTheDocument();
    expect(screen.getByText(/No counted runs yet/)).toBeInTheDocument();
  });
});

describe("EvalsTab — new, edit, delete (stretch a)", () => {
  it("AC-52: 'New eval case' opens an empty Case Editor", async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole("button", { name: "New eval case" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Name")).toHaveValue("");
    expect(within(dialog).getByRole("textbox", { name: "Diff" })).toBeEnabled();
  });

  it("AC-54: Edit opens the case with its stored values and saves under the same id", async () => {
    const user = userEvent.setup();
    const item: EvalCaseRecord = evalCase({ id: "c1", name: "stored-case", source_finding_id: "f1" });
    h.cases.data = [item];
    render();

    await user.click(screen.getByRole("button", { name: "Edit stored-case" }));
    expect(screen.getByLabelText("Name")).toHaveValue("stored-case");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(h.update.mutate).toHaveBeenCalledTimes(1);
    expect(h.update.mutate.mock.calls[0]![0]).toMatchObject({
      id: "c1",
      body: { name: "stored-case", source_finding_id: "f1" },
    });
  });

  it("AC-55: Delete asks for confirmation naming the case before anything is sent", async () => {
    const user = userEvent.setup();
    h.cases.data = [evalCase({ id: "c1", name: "doomed-case" })];
    render();

    await user.click(screen.getByRole("button", { name: "Delete doomed-case" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("doomed-case");
    expect(h.remove.mutate).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(h.remove.mutate).toHaveBeenCalledTimes(1);
    expect(h.remove.mutate.mock.calls[0]![0]).toBe("c1");
  });

  it("AC-55: cancelling the confirmation sends nothing and keeps the case", async () => {
    const user = userEvent.setup();
    h.cases.data = [evalCase({ id: "c1", name: "kept-case" })];
    render();
    await user.click(screen.getByRole("button", { name: "Delete kept-case" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(h.remove.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("kept-case")).toBeInTheDocument();
  });

  it("AC-57: a 409 from the delete is shown inside the confirmation", async () => {
    const { ApiError } = await import("@/lib/api");
    const user = userEvent.setup();
    h.cases.data = [evalCase({ id: "c1", name: "busy-case" })];
    h.remove.error = new ApiError("This agent has an eval run in progress. Delete the case after it finishes.", 409, "eval_run_in_progress");
    render();
    await user.click(screen.getByRole("button", { name: "Delete busy-case" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("This agent has an eval run in progress.");
  });
});

describe("EvalsTab — loading and errors", () => {
  it("shows a retryable error when the cases or runs fail to load", async () => {
    const user = userEvent.setup();
    h.runs.isError = true;
    render();
    expect(screen.getByText("The evals could not be loaded.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(h.cases.refetch).toHaveBeenCalled();
    expect(h.runs.refetch).toHaveBeenCalled();
  });
});
