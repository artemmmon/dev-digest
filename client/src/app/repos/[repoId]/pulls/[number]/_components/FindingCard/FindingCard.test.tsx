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
