import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test/render";
import { evalRun } from "@/test/eval-fixtures";
import { RunsTable } from "./RunsTable";

afterEach(cleanup);

const RUNS = [
  evalRun({ id: "r-run", status: "running", started_at: "2026-10-14T10:00:00.000Z", recall: null, precision: null, citation_accuracy: null, cases_completed: 1, cases_passed: 1, cost_usd: null }),
  evalRun({ id: "r-part", status: "partial", started_at: "2026-10-13T10:00:00.000Z", cases_completed: 3, cases_errored: 1, cases_passed: 2, unlabelled_findings: 2 }),
  evalRun({ id: "r-fail", status: "failed", started_at: "2026-10-12T10:00:00.000Z", recall: null, precision: null, citation_accuracy: null, cases_completed: 0, cases_errored: 4, cases_passed: 0, cost_usd: null }),
  evalRun({ id: "r-done", status: "done", agent_version: 2, started_at: "2026-10-11T10:00:00.000Z", recall: 1, precision: 0.5, citation_accuracy: 0.756 }),
  evalRun({ id: "r-done2", status: "done", started_at: "2026-10-10T10:00:00.000Z" }),
];

const rows = () => screen.getAllByRole("row").slice(1); // drop the header row

describe("RunsTable", () => {
  it("AC-38: each row shows version, the three metrics, passed / completed, errored, unlabelled and cost", () => {
    renderWithIntl(<RunsTable runs={[RUNS[3]!]} />);
    const row = within(rows()[0]!);
    expect(row.getByText("v2")).toBeInTheDocument();
    expect(row.getByText("100%")).toBeInTheDocument(); // recall
    expect(row.getByText("50%")).toBeInTheDocument(); // precision
    expect(row.getByText("76%")).toBeInTheDocument(); // citation, whole percentage
    expect(row.getByText("3 / 4")).toBeInTheDocument(); // passed / completed
    expect(row.getByText("$0.123")).toBeInTheDocument(); // cost
    expect(screen.getByRole("columnheader", { name: "Unlabelled" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Errored" })).toBeInTheDocument();
  });

  it("AC-38: a running, partial or failed run carries its badge; a done run carries none", () => {
    renderWithIntl(<RunsTable runs={RUNS} />);
    const [running, partial, failed, done] = rows().map((r) => within(r));
    expect(running!.getByText("running")).toBeInTheDocument();
    expect(partial!.getByText("partial")).toBeInTheDocument();
    expect(failed!.getByText("failed")).toBeInTheDocument();
    expect(done!.queryByText(/^(running|partial|failed)$/)).not.toBeInTheDocument();
  });

  it("AC-34, AC-36, EC-11: a run with no metric or cost shows an em dash, never 0%", () => {
    renderWithIntl(<RunsTable runs={[RUNS[2]!]} />);
    const cells = within(rows()[0]!).getAllByText("—");
    expect(cells.length).toBeGreaterThanOrEqual(4); // recall, precision, citation, cost
    expect(within(rows()[0]!).queryByText("0%")).not.toBeInTheDocument();
  });

  it("AC-38: the unlabelled and errored counts of a partial run are shown", () => {
    renderWithIntl(<RunsTable runs={[RUNS[1]!]} />);
    const cells = within(rows()[0]!).getAllByRole("cell");
    // errored = 1, unlabelled = 2
    expect(cells.map((c) => c.textContent)).toEqual(expect.arrayContaining(["1", "2", "2 / 3"]));
  });

  it("AC-45: with no selection handler there is no checkbox column", () => {
    renderWithIntl(<RunsTable runs={RUNS} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("AC-45, EC-11, AC-66: only done and partial runs can be selected; running and failed rows are disabled", () => {
    renderWithIntl(<RunsTable runs={RUNS} selectedIds={[]} onSelectedChange={() => {}} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(5);
    const [running, partial, failed, done, done2] = boxes;
    expect(running).toBeDisabled();
    expect(failed).toBeDisabled();
    expect(partial).toBeEnabled();
    expect(done).toBeEnabled();
    expect(done2).toBeEnabled();
  });

  it("AC-45: at most two runs can be selected; the others lock until one is cleared", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [ids, setIds] = React.useState<string[]>([]);
      return <RunsTable runs={RUNS} selectedIds={ids} onSelectedChange={setIds} />;
    }
    renderWithIntl(<Harness />);
    const [, partial, , done, done2] = screen.getAllByRole("checkbox");

    await user.click(partial!);
    await user.click(done!);
    expect(partial).toBeChecked();
    expect(done).toBeChecked();
    expect(done2).toBeDisabled();

    await user.click(partial!);
    expect(done2).toBeEnabled();
  });

  it("AC-45: a selection change reports the new list of ids", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<RunsTable runs={RUNS} selectedIds={["r-done"]} onSelectedChange={onChange} />);
    await user.click(screen.getAllByRole("checkbox")[4]!);
    expect(onChange).toHaveBeenCalledWith(["r-done", "r-done2"]);
  });
});