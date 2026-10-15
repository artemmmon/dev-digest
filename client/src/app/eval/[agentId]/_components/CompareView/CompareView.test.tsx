import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EvalCompare } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";
import { evalRun } from "@/test/eval-fixtures";

const h = vi.hoisted(() => ({
  q: { data: undefined as unknown, isError: false, refetch: vi.fn() },
}));

vi.mock("@/lib/hooks", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useEvalCompare: () => h.q,
}));

import { CompareView } from "./CompareView";

function compare(over: Partial<EvalCompare> = {}): EvalCompare {
  return {
    older: {
      run: evalRun({ id: "r-old", agent_version: 1, recall: 0.5, precision: 0.8, citation_accuracy: 0.9, cost_usd: 0.1 }),
      system_prompt: "Be strict about SQL injection",
      model: "model-a",
    },
    newer: {
      run: evalRun({ id: "r-new", agent_version: 2, recall: 0.75, precision: 0.7, citation_accuracy: 0.9, cost_usd: 0.15, started_at: "2026-10-11T10:00:00.000Z" }),
      system_prompt: "Be lenient about SQL injection and XSS",
      model: "model-b",
    },
    flipped: [],
    case_sets_differ: false,
    only_in_older: 0,
    only_in_newer: 0,
    ...over,
  };
}

beforeEach(() => {
  h.q = { data: compare(), isError: false, refetch: vi.fn() };
});
afterEach(cleanup);

const render = (onClose = vi.fn()) => {
  renderWithIntl(<CompareView a="r-old" b="r-new" onClose={onClose} />);
  return onClose;
};

describe("CompareView", () => {
  it("AC-46: shows the older value, the newer value and the change for recall, precision, citation and cost", () => {
    render();

    expect(screen.getByRole("dialog")).toHaveTextContent("Compare runs · v1 → v2");
    expect(screen.getByTestId("compare-older-recall")).toHaveTextContent("50%");
    expect(screen.getByTestId("compare-newer-recall")).toHaveTextContent("75%");
    expect(screen.getByTestId("compare-change-recall")).toHaveTextContent("▲ 25pt");
    expect(screen.getByTestId("compare-older-precision")).toHaveTextContent("80%");
    expect(screen.getByTestId("compare-newer-precision")).toHaveTextContent("70%");
    expect(screen.getByTestId("compare-change-precision")).toHaveTextContent("▼ 10pt");
    expect(screen.getByTestId("compare-change-citation_accuracy")).toHaveTextContent("no change");
    expect(screen.getByTestId("compare-older-cost")).toHaveTextContent("$0.100");
    expect(screen.getByTestId("compare-newer-cost")).toHaveTextContent("$0.150");
    expect(screen.getByTestId("compare-change-cost")).toHaveTextContent("▲ $0.050");
  });

  it("AC-46, AC-34, AC-36: a metric or cost with no value on either side shows an em dash and no change", () => {
    const data = compare();
    data.older.run = { ...data.older.run, recall: null, cost_usd: null };
    h.q.data = data;
    render();
    expect(screen.getByTestId("compare-older-recall")).toHaveTextContent("—");
    expect(screen.getByTestId("compare-change-recall")).toHaveTextContent("—");
    expect(screen.getByTestId("compare-change-cost")).toHaveTextContent("—");
  });

  it("AC-47: the prompt diff marks removed words as <del> and added words as <ins>, as text", () => {
    render();
    const prompt = screen.getByTestId("compare-prompt");
    expect(within(prompt).getByText("strict", { selector: "del" })).toBeInTheDocument();
    expect(within(prompt).getByText("lenient", { selector: "ins" })).toBeInTheDocument();
    expect(within(prompt).getByText("and XSS", { selector: "ins" })).toBeInTheDocument();
    expect(within(prompt).getByText(/Be/, { selector: "span" })).toBeInTheDocument();
  });

  it("AC-47: prompt text is never interpreted as HTML", () => {
    const data = compare();
    data.newer.system_prompt = 'Be strict <img src=x onerror="alert(1)"> <b>bold</b>';
    h.q.data = data;
    render();
    const prompt = screen.getByTestId("compare-prompt");
    expect(prompt.querySelector("img")).toBeNull();
    expect(prompt.querySelector("b")).toBeNull();
    expect(prompt).toHaveTextContent('<img src=x onerror="alert(1)"> <b>bold</b>');
  });

  it("AC-47: identical prompts say so, and a missing prompt says it is not available", () => {
    const same = compare();
    same.newer.system_prompt = same.older.system_prompt;
    h.q.data = same;
    render();
    expect(screen.getByText("The system prompt is the same in both runs.")).toBeInTheDocument();
    cleanup();

    const missing = compare();
    missing.older.system_prompt = null;
    h.q.data = missing;
    render();
    expect(screen.getByText("A system prompt is not available for one of the runs.")).toBeInTheDocument();
  });

  it("AC-47: prompts that differ only in leading, trailing or inner whitespace are reported as the same", () => {
    const data = compare();
    data.older.system_prompt = "  Be strict\n about  SQL injection ";
    data.newer.system_prompt = "Be strict about SQL injection\n\n";
    h.q.data = data;
    render();
    expect(screen.getByText("The system prompt is the same in both runs.")).toBeInTheDocument();
    const prompt = screen.getByTestId("compare-prompt");
    expect(prompt.querySelector("ins, del")).toBeNull();
  });

  it("AC-47: a prompt that is whitespace only on one side and text on the other is a change", () => {
    const data = compare();
    data.older.system_prompt = "   ";
    data.newer.system_prompt = "Be strict";
    h.q.data = data;
    render();
    const prompt = screen.getByTestId("compare-prompt");
    expect(within(prompt).getByText("Be strict", { selector: "ins" })).toBeInTheDocument();
    expect(prompt.querySelector("del")).toBeNull();
    expect(screen.queryByText("The system prompt is the same in both runs.")).not.toBeInTheDocument();
  });

  it("AC-48: the version summary lists both agent versions, both models and each skill that changed, was added or removed", () => {
    const data = compare();
    data.older.run = {
      ...data.older.run,
      skill_versions: [
        { skill_id: "s1", name: "TS rules", version: 2 },
        { skill_id: "s2", name: "Same skill", version: 1 },
        { skill_id: "s3", name: "Dropped skill", version: 4 },
      ],
    };
    data.newer.run = {
      ...data.newer.run,
      skill_versions: [
        { skill_id: "s1", name: "TS rules", version: 3 },
        { skill_id: "s2", name: "Same skill", version: 1 },
        { skill_id: "s4", name: "New skill", version: 1 },
      ],
    };
    h.q.data = data;
    render();

    const versions = within(screen.getByTestId("compare-versions"));
    expect(versions.getByText("v1 → v2")).toBeInTheDocument();
    expect(versions.getByText("model-a → model-b")).toBeInTheDocument();
    expect(versions.getByText("TS rules: v2 → v3")).toBeInTheDocument();
    expect(versions.getByText("New skill: added (v1)")).toBeInTheDocument();
    expect(versions.getByText("Dropped skill: removed (was v4)")).toBeInTheDocument();
    expect(versions.queryByText(/Same skill/)).not.toBeInTheDocument();
  });

  it("AC-48, EC-7: with no skill version change it says there is none", () => {
    render();
    expect(within(screen.getByTestId("compare-versions")).getByText("No skill version changes")).toBeInTheDocument();
  });

  it("AC-49: each case whose outcome changed is listed with its direction; none says so", () => {
    h.q.data = compare({
      flipped: [
        { case_id: "c1", name: "must-find-key", from: "pass", to: "fail" },
        { case_id: "c2", name: "no-unused", from: "fail", to: "pass" },
      ],
    });
    render();
    expect(screen.getByTestId("flipped-c1")).toHaveTextContent("pass → fail");
    expect(screen.getByTestId("flipped-c2")).toHaveTextContent("fail → pass");
    expect(screen.getByText("must-find-key")).toBeInTheDocument();
    cleanup();

    h.q.data = compare();
    render();
    expect(screen.getByText("No case changed between pass and fail.")).toBeInTheDocument();
  });

  it("AC-50: runs of different case sets show 'Case sets differ' with both counts; the same set shows no banner", () => {
    h.q.data = compare({ case_sets_differ: true, only_in_older: 2, only_in_newer: 1 });
    render();
    const banner = screen.getByTestId("case-sets-differ");
    expect(banner).toHaveTextContent("Case sets differ");
    expect(banner).toHaveTextContent("2 cases only in the older run");
    expect(banner).toHaveTextContent("1 case only in the newer run");
    cleanup();

    h.q.data = compare();
    render();
    expect(screen.queryByTestId("case-sets-differ")).not.toBeInTheDocument();
  });

  it("AC-46: a failed load is shown with a retry, not a half-empty comparison", () => {
    h.q = { data: undefined, isError: true, refetch: vi.fn() };
    render();
    expect(screen.getByText("The runs could not be compared.")).toBeInTheDocument();
    expect(screen.queryByTestId("compare-metric-recall")).not.toBeInTheDocument();
  });

  it("NFR-6: Escape closes the view and focus returns to the control that opened it", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open compare
          </button>
          {open && <CompareView a="r-old" b="r-new" onClose={() => setOpen(false)} />}
        </>
      );
    }
    renderWithIntl(<Harness />);
    const opener = screen.getByRole("button", { name: "Open compare" });
    await user.click(opener);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("NFR-6: the Close button closes it", async () => {
    const user = userEvent.setup();
    const onClose = render();
    const footerClose = screen.getAllByRole("button", { name: "Close" }).at(-1)!;
    await user.click(footerClose);
    expect(onClose).toHaveBeenCalled();
  });
});
