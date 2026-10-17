import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FindingRecord } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";
import { FindingCard } from "./FindingCard";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("shows the outside-PR-scope badge only for an out_of_scope finding", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} />);
    expect(screen.queryByText("Outside PR scope")).not.toBeInTheDocument();
    cleanup();

    renderWithIntl(
      <FindingCard f={{ ...FINDING, kind: "out_of_scope" }} defaultExpanded onAction={() => {}} />,
    );
    expect(screen.getByText("Outside PR scope")).toBeInTheDocument();
  });

  it("fires accept/dismiss actions", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: /Accept/ }));
    expect(onAction).toHaveBeenCalledWith("accept");
    await user.click(screen.getByRole("button", { name: /Reject/ }));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard eval action (SPEC-13)", () => {
  const withMarkers = (over: Partial<FindingRecord>): FindingRecord => ({ ...FINDING, ...over });

  it("AC-1, AC-2: an available finding shows an enabled action whatever its decision; a click hands the finding to the parent", async () => {
    const user = userEvent.setup();
    for (const decision of [
      {},
      { accepted_at: "2026-10-10T10:00:00Z" },
      { dismissed_at: "2026-10-10T10:00:00Z" },
    ]) {
      const onTurn = vi.fn();
      const f = withMarkers({ eval_case_id: null, eval_unavailable_reason: null, ...decision });
      renderWithIntl(<FindingCard f={f} defaultExpanded onAction={() => {}} onTurnIntoEvalCase={onTurn} />);

      const button = screen.getByRole("button", { name: "Turn into eval case" });
      expect(button).toBeEnabled();
      await user.click(button);
      expect(onTurn).toHaveBeenCalledTimes(1);
      expect(onTurn).toHaveBeenCalledWith(f);
      cleanup();
    }
  });

  it("AC-8, EC-1: a finding with no agent shows the action disabled with the reason linked to it", async () => {
    const user = userEvent.setup();
    const onTurn = vi.fn();
    renderWithIntl(
      <FindingCard
        f={withMarkers({ eval_unavailable_reason: "no_agent" })}
        defaultExpanded
        onAction={() => {}}
        onTurnIntoEvalCase={onTurn}
      />,
    );
    const button = screen.getByRole("button", { name: "Turn into eval case" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("This finding has no agent");
    expect(screen.getByText("This finding has no agent")).toBeInTheDocument();
    await user.click(button);
    expect(onTurn).not.toHaveBeenCalled();
  });

  it("AC-8, EC-2: a finding whose diff is gone shows the disabled action with 'The diff of this finding is no longer available'", () => {
    renderWithIntl(
      <FindingCard
        f={withMarkers({ eval_unavailable_reason: "diff_unavailable" })}
        defaultExpanded
        onAction={() => {}}
        onTurnIntoEvalCase={() => {}}
      />,
    );
    const button = screen.getByRole("button", { name: "Turn into eval case" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("The diff of this finding is no longer available");
  });

  it("AC-65, EC-20: a finding on a generated or fixture file shows the disabled action with 'This file is excluded from review'", () => {
    renderWithIntl(
      <FindingCard
        f={withMarkers({ file: "pnpm-lock.yaml", eval_unavailable_reason: "file_excluded" })}
        defaultExpanded
        onAction={() => {}}
        onTurnIntoEvalCase={() => {}}
      />,
    );
    const button = screen.getByRole("button", { name: "Turn into eval case" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("This file is excluded from review");
  });

  it("AC-9, EC-3: a finding that seeded a case shows 'In eval set' in place of the action, even when dismissed", () => {
    renderWithIntl(
      <FindingCard
        f={withMarkers({ eval_case_id: "case-1", dismissed_at: "2026-10-10T10:00:00Z" })}
        defaultExpanded
        onAction={() => {}}
        onTurnIntoEvalCase={() => {}}
      />,
    );
    expect(screen.getByText("In eval set")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn into eval case" })).not.toBeInTheDocument();
  });

  it("AC-9: the case marker wins over an unavailable reason on the same finding", () => {
    renderWithIntl(
      <FindingCard
        f={withMarkers({ eval_case_id: "case-1", eval_unavailable_reason: "diff_unavailable" })}
        defaultExpanded
        onAction={() => {}}
        onTurnIntoEvalCase={() => {}}
      />,
    );
    expect(screen.getByText("In eval set")).toBeInTheDocument();
    expect(screen.queryByText("The diff of this finding is no longer available")).not.toBeInTheDocument();
  });
});
