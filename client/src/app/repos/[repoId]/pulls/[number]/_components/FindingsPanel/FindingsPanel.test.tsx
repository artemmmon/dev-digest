import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FindingRecord } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";

const h = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: h.mutate, isPending: false }),
}));

// The Case Editor has its own tests; here it is a stand-in that is open while rendered.
vi.mock("../FindingCaseEditor", () => ({
  FindingCaseEditor: ({ onClose }: { onClose: () => void }) => (
    <div>
      <p>Case editor is open</p>
      <button type="button" onClick={onClose}>
        Close case editor
      </button>
    </div>
  ),
}));

import { FindingsPanel } from "./FindingsPanel";

beforeEach(() => {
  h.mutate.mockReset();
});
afterEach(cleanup);

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

const FINDINGS: FindingRecord[] = [
  finding({ id: "f1" }),
  finding({ id: "f2", severity: "WARNING", title: "Unbounded loop" }),
  finding({ id: "f3", severity: "WARNING", title: "Missing await", confidence: 0.4 }),
  finding({ id: "f4", severity: "SUGGESTION", title: "Rename variable" }),
];

/** Titles of the finding cards currently rendered (each card title is an h4-less span). */
function shownTitles(): string[] {
  return FINDINGS.map((f) => f.title).filter((title) => screen.queryByText(title) !== null);
}

function pill(severity: string) {
  return screen.getByRole("button", { name: new RegExp(`\\d+ ${severity}`, "i") });
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel severity counters", () => {
  it("shows one pill per present severity, with the finding count", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    const group = screen.getByRole("group", { name: "Filter findings by severity" });
    const pills = within(group).getAllByRole("button");
    expect(pills.map((p) => p.getAttribute("aria-label"))).toEqual([
      "1 Critical",
      "2 Warning",
      "1 Suggestion",
    ]);
  });

  it("omits severities that do not occur", () => {
    renderWithIntl(<FindingsPanel findings={[finding({ id: "f1" })]} prId="pr1" />);
    const group = screen.getByRole("group", { name: "Filter findings by severity" });
    expect(within(group).getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Warning/i })).toBeNull();
  });

  it("renders no pills at all when the run found nothing", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("group", { name: "Filter findings by severity" })).toBeNull();
  });

  it("counts only what is visible: hiding low confidence lowers the pill", async () => {
    const user = userEvent.setup();
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(pill("Warning")).toHaveAccessibleName("2 Warning");
    await user.click(screen.getByRole("switch"));
    expect(pill("Warning")).toHaveAccessibleName("1 Warning");
    expect(screen.queryByText("Missing await")).toBeNull();
  });
});

describe("FindingsPanel severity filter", () => {
  it("shows only the clicked severity, and its count matches the cards below", async () => {
    const user = userEvent.setup();
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    await user.click(pill("Warning"));

    expect(pill("Warning")).toHaveAttribute("aria-pressed", "true");
    expect(shownTitles()).toEqual(["Unbounded loop", "Missing await"]);
    expect(pill("Warning")).toHaveAccessibleName("2 Warning");
  });

  it("restores the full list when the active pill is clicked again", async () => {
    const user = userEvent.setup();
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    await user.click(pill("Suggestion"));
    expect(shownTitles()).toEqual(["Rename variable"]);

    await user.click(pill("Suggestion"));
    expect(pill("Suggestion")).toHaveAttribute("aria-pressed", "false");
    expect(shownTitles()).toHaveLength(FINDINGS.length);
  });

  it("switches severity on a single click (single-select)", async () => {
    const user = userEvent.setup();
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    await user.click(pill("Critical"));
    await user.click(pill("Suggestion"));
    expect(pill("Critical")).toHaveAttribute("aria-pressed", "false");
    expect(shownTitles()).toEqual(["Rename variable"]);
  });
});

describe("FindingsPanel keyboard shortcuts", () => {
  /** Move focus off every control, so a key goes to `document.body` like on an idle page. */
  function blurAll() {
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
  }

  it("with nothing open, a on the page accepts the focused finding and d dismisses it", async () => {
    const user = userEvent.setup();
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    blurAll();

    await user.keyboard("a");
    expect(h.mutate).toHaveBeenLastCalledWith({ findingId: "f1", action: "accept", prId: "pr1" });

    await user.keyboard("jd");
    expect(h.mutate).toHaveBeenLastCalledWith({ findingId: "f2", action: "dismiss", prId: "pr1" });
  });

  it("NFR-6: while the Case Editor is open, a, d, j and k are inert even when focus is on the page body", async () => {
    const user = userEvent.setup();
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    // the first card is expanded by default and offers the editor
    await user.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(screen.getByText("Case editor is open")).toBeInTheDocument();
    blurAll();

    await user.keyboard("a");
    await user.keyboard("d");
    await user.keyboard("j");
    await user.keyboard("k");
    expect(h.mutate).not.toHaveBeenCalled();

    // closing it brings the shortcuts back, and the cursor did not move while it was open
    await user.click(screen.getByRole("button", { name: "Close case editor" }));
    expect(screen.queryByText("Case editor is open")).not.toBeInTheDocument();
    blurAll();
    await user.keyboard("a");
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate).toHaveBeenCalledWith({ findingId: "f1", action: "accept", prId: "pr1" });
  });

  it("NFR-6: while any aria-modal element is on the page, a and d do nothing, and they work again once it is gone", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [modal, setModal] = React.useState(true);
      return (
        <>
          <FindingsPanel findings={FINDINGS} prId="pr1" />
          {modal && (
            <div role="dialog" aria-modal="true" aria-label="Some other modal">
              <button type="button" onClick={() => setModal(false)}>
                Dismiss modal
              </button>
            </div>
          )}
        </>
      );
    }
    renderWithIntl(<Harness />);
    blurAll();

    await user.keyboard("a");
    await user.keyboard("d");
    expect(h.mutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Dismiss modal" }));
    blurAll();
    await user.keyboard("d");
    expect(h.mutate).toHaveBeenCalledWith({ findingId: "f1", action: "dismiss", prId: "pr1" });
  });
});
