import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FindingRecord } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

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
