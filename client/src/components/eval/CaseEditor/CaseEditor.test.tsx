import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EvalCaseRecord } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";
import { CaseEditor } from "./CaseEditor";
import { buildCaseSeed } from "./helpers";

afterEach(cleanup);

const PATCH = "@@ -10,3 +10,4 @@\n context a\n+added line\n-removed line\n context b";
const FINDING = {
  id: "f1",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 12,
  accepted_at: null,
  dismissed_at: null,
};
const META = { pr_title: "Add Stripe", pr_body: "Wire payments <b>now</b>" };
const seed = (over: Partial<typeof FINDING> = {}) => buildCaseSeed({ ...FINDING, ...over }, PATCH, META);

function caseRecord(id: string, name: string, file: string, start: number, end: number): EvalCaseRecord {
  return {
    id,
    owner_kind: "agent",
    owner_id: "a1",
    name,
    input_diff: "",
    input_meta: { pr_title: "", pr_body: "" },
    expected_output: { type: "must_find", file, start_line: start, end_line: end },
    source_finding_id: null,
    notes: null,
    created_at: "2026-10-10T10:00:00.000Z",
    latest: { status: "never_run", expected_count: 1, matched_count: null },
  };
}

function seeded(props: Partial<React.ComponentProps<typeof CaseEditor>> = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  renderWithIntl(
    <CaseEditor
      mode="seeded"
      seed={seed()}
      existingCases={[]}
      agentName="Security"
      onSave={onSave}
      onClose={onClose}
      {...(props as object)}
    />,
  );
  return { onSave, onClose };
}

describe("CaseEditor seeded from a finding", () => {
  it("AC-3, AC-4: preselects the expectation type and pre-fills the name, file and lines", () => {
    seeded();
    expect(screen.getByLabelText("Name")).toHaveValue("must-find-hardcoded-stripe-secret-key");
    expect(screen.getByRole("button", { name: "Must find" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Must not flag" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("File")).toHaveValue("src/config.ts");
    expect(screen.getByLabelText("Start line")).toHaveValue("11");
    expect(screen.getByLabelText("End line")).toHaveValue("12");
  });

  it("AC-3, AC-4: a dismissed finding preselects Must not flag and the `no-` name", () => {
    seeded({ seed: seed({ dismissed_at: "2026-10-10T10:00:00Z" } as never) });
    expect(screen.getByLabelText("Name")).toHaveValue("no-hardcoded-stripe-secret-key");
    expect(screen.getByRole("button", { name: "Must not flag" })).toHaveAttribute("aria-pressed", "true");
  });

  it("AC-5: shows the stored patch under `--- a/<file>` / `+++ b/<file>` as a read-only preview, with no diff input", () => {
    seeded();
    const preview = screen.getByLabelText("Diff preview (read-only)");
    expect(preview).toHaveTextContent("--- a/src/config.ts");
    expect(preview).toHaveTextContent("+++ b/src/config.ts");
    expect(preview).toHaveTextContent("+added line");
    expect(screen.queryByRole("textbox", { name: "Diff" })).not.toBeInTheDocument();
  });

  it("AC-6: the PR meta tab shows the title and body read-only, as text", async () => {
    const user = userEvent.setup();
    seeded();
    await user.click(screen.getByRole("button", { name: "PR meta" }));
    expect(screen.getByText("Add Stripe")).toBeInTheDocument();
    // the body is text: the tag characters are shown, no element is created from them
    expect(screen.getByText("Wire payments <b>now</b>")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Body" })).not.toBeInTheDocument();
  });

  it("AC-2, AC-7: nothing is sent until Save; Save posts the seeded diff and meta with the edited name and expectation", async () => {
    const user = userEvent.setup();
    const { onSave } = seeded();
    expect(onSave).not.toHaveBeenCalled();

    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "  stripe-key-leak  ");
    await user.click(screen.getByRole("button", { name: "Must not flag" }));
    const end = screen.getByLabelText("End line");
    await user.clear(end);
    await user.type(end, "14");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      name: "stripe-key-leak",
      input_diff: `--- a/src/config.ts\n+++ b/src/config.ts\n${PATCH}`,
      input_meta: META,
      expected_output: { type: "must_not_flag", file: "src/config.ts", start_line: 11, end_line: 14 },
      source_finding_id: "f1",
    });
  });

  it("AC-11: an end line before the start line disables Save and says so", async () => {
    const user = userEvent.setup();
    const { onSave } = seeded();
    const end = screen.getByLabelText("End line");
    await user.clear(end);
    await user.type(end, "5");

    expect(screen.getByRole("alert")).toHaveTextContent(/End line must be greater than or equal/);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("AC-11: an empty name disables Save", async () => {
    const user = userEvent.setup();
    seeded();
    await user.clear(screen.getByLabelText("Name"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("AC-13: an expectation overlapping another case of the agent shows a warning naming it, and Save stays enabled", async () => {
    const user = userEvent.setup();
    seeded({
      existingCases: [
        caseRecord("c1", "must-find-old-key", "src/config.ts", 12, 20),
        caseRecord("c2", "elsewhere", "src/other.ts", 11, 12),
      ],
    });
    // lines 11-12 overlap c1 (12-20) in the same file
    expect(screen.getByText(/overlaps the case/)).toHaveTextContent("must-find-old-key");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    const end = screen.getByLabelText("End line");
    const start = screen.getByLabelText("Start line");
    await user.clear(start);
    await user.type(start, "1");
    await user.clear(end);
    await user.type(end, "11");
    expect(screen.queryByText(/overlaps the case/)).not.toBeInTheDocument();
  });

  it("AC-7: a server error is shown inline and the editor stays open", () => {
    const { onClose } = seeded({ error: "An eval case from this finding already exists." });
    expect(screen.getByRole("alert")).toHaveTextContent("An eval case from this finding already exists.");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("NFR-6: the controls are reachable by keyboard and Escape closes with focus back on the opener", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open editor
          </button>
          {open && (
            <CaseEditor
              mode="seeded"
              seed={seed()}
              existingCases={[]}
              onSave={() => {}}
              onClose={() => setOpen(false)}
            />
          )}
        </>
      );
    }
    renderWithIntl(<Harness />);
    const opener = screen.getByRole("button", { name: "Open editor" });
    await user.click(opener);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Name")).toHaveFocus(); // focus moves in
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe("CaseEditor new and edit modes (stretch a)", () => {
  it("AC-52: a new case opens empty with an editable diff, PR title, PR body, name and expectation", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CaseEditor mode="new" existingCases={[]} onSave={() => {}} onClose={() => {}} />);

    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("File")).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Diff" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "PR meta" }));
    expect(screen.getByRole("textbox", { name: "Title" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Body" })).toBeEnabled();
  });

  it("AC-53: a pasted diff gets a preview with added and removed lines marked apart from context lines", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CaseEditor mode="new" existingCases={[]} onSave={() => {}} onClose={() => {}} />);

    await user.click(screen.getByRole("textbox", { name: "Diff" }));
    await user.paste("--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n ctx\n+new\n-old");

    const preview = screen.getByLabelText("Preview");
    const styleOf = (text: string) =>
      within(preview).getByText(text, { exact: true }).getAttribute("style");
    expect(styleOf("+new")).toContain("--code-add");
    expect(styleOf("-old")).toContain("--code-del");
    expect(styleOf("ctx")).not.toContain("--code-add");
    expect(styleOf("ctx")).not.toContain("--code-del");
  });

  it("AC-52, AC-7: a hand-written case is saved with no source finding and the typed diff and PR text", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithIntl(<CaseEditor mode="new" existingCases={[]} onSave={onSave} onClose={() => {}} />);

    await user.type(screen.getByLabelText("Name"), "by-hand");
    await user.type(screen.getByLabelText("File"), "src/a.ts");
    await user.type(screen.getByLabelText("Start line"), "1");
    await user.type(screen.getByLabelText("End line"), "2");
    await user.click(screen.getByRole("textbox", { name: "Diff" }));
    await user.paste("--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n ctx\n+new");
    await user.click(screen.getByRole("button", { name: "PR meta" }));
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Typed title");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({
      name: "by-hand",
      input_diff: "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n ctx\n+new",
      input_meta: { pr_title: "Typed title", pr_body: "" },
      expected_output: { type: "must_find", file: "src/a.ts", start_line: 1, end_line: 2 },
      source_finding_id: null,
    });
  });

  it("AC-11: a diff over 100 000 characters disables Save and shows the limit", async () => {
    const user = userEvent.setup();
    renderWithIntl(<CaseEditor mode="new" existingCases={[]} onSave={() => {}} onClose={() => {}} />);
    await user.type(screen.getByLabelText("Name"), "n");
    await user.type(screen.getByLabelText("File"), "a.ts");
    await user.type(screen.getByLabelText("Start line"), "1");
    await user.type(screen.getByLabelText("End line"), "1");
    await user.click(screen.getByRole("textbox", { name: "Diff" }));
    await user.paste("x".repeat(100_001));

    expect(screen.getByRole("alert")).toHaveTextContent(/at most 100000 characters|at most 100,000 characters/);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("AC-54: editing a stored case starts from its values and the overlap check skips the case itself", () => {
    const stored = caseRecord("c1", "keep-me", "src/config.ts", 11, 12);
    stored.input_diff = "--- a/src/config.ts\n+++ b/src/config.ts\n@@ -1 +1 @@\n+x";
    renderWithIntl(
      <CaseEditor
        mode="edit"
        seed={{
          name: stored.name,
          expected_output: stored.expected_output,
          input_diff: stored.input_diff,
          input_meta: stored.input_meta,
          source_finding_id: "f9",
          case_id: stored.id,
        }}
        existingCases={[stored]}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByLabelText("Name")).toHaveValue("keep-me");
    expect(screen.queryByText(/overlaps the case/)).not.toBeInTheDocument(); // no self-overlap warning
    expect(screen.getByRole("textbox", { name: "Diff" })).toHaveValue(stored.input_diff);
  });
});
