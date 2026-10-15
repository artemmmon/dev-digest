import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FindingRecord } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";

/**
 * "Turn into eval case" glue on the PR page (AC-2, AC-5, AC-6, AC-7): the editor is seeded from the PR
 * detail and the finding's review, and nothing is saved until Save.
 */

const hooks = vi.hoisted(() => ({
  detail: {} as { data?: unknown; isError?: boolean },
  reviews: {} as { data?: unknown; isError?: boolean },
  cases: { data: [] as unknown[] },
  mutate: vi.fn(),
  error: null as unknown,
}));

vi.mock("@/lib/hooks/core", () => ({ usePullDetail: () => hooks.detail }));
vi.mock("@/lib/hooks/reviews", () => ({ usePrReviews: () => hooks.reviews }));
vi.mock("@/lib/hooks/eval", () => ({
  useEvalCases: () => hooks.cases,
  useCreateEvalCase: () => ({ mutate: hooks.mutate, isPending: false, error: hooks.error }),
}));

import { FindingCaseEditor } from "./FindingCaseEditor";

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 12,
  rationale: "r",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

beforeEach(() => {
  hooks.detail = {
    data: {
      title: "Add Stripe",
      body: "Wire up payments",
      files: [{ path: "src/config.ts", patch: "@@ -10,3 +10,4 @@\n ctx\n+key" }],
    },
  };
  hooks.reviews = { data: [{ id: "r1", agent_id: "agent-1", agent_name: "Security" }] };
  hooks.cases = { data: [] };
  hooks.mutate.mockReset();
  hooks.error = null;
});
afterEach(cleanup);

describe("FindingCaseEditor", () => {
  it("AC-2, AC-5, AC-6: opens the editor seeded from the finding, its file patch and the PR title and body, saving nothing", async () => {
    const user = userEvent.setup();
    renderWithIntl(<FindingCaseEditor finding={FINDING} prId="pr1" onClose={() => {}} />);

    expect(screen.getByLabelText("Name")).toHaveValue("must-find-hardcoded-stripe-secret-key");
    expect(screen.getByLabelText("Diff preview (read-only)")).toHaveTextContent("--- a/src/config.ts");
    await user.click(screen.getByRole("button", { name: "PR meta" }));
    expect(screen.getByText("Add Stripe")).toBeInTheDocument();
    expect(screen.getByText("Wire up payments")).toBeInTheDocument();
    expect(hooks.mutate).not.toHaveBeenCalled();
  });

  it("AC-7: Save posts the seeded diff, the PR meta as they are now and the finding id", async () => {
    const user = userEvent.setup();
    renderWithIntl(<FindingCaseEditor finding={FINDING} prId="pr1" onClose={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(hooks.mutate).toHaveBeenCalledTimes(1);
    expect(hooks.mutate.mock.calls[0]![0]).toMatchObject({
      input_diff: "--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,3 +10,4 @@\n ctx\n+key",
      input_meta: { pr_title: "Add Stripe", pr_body: "Wire up payments" },
      expected_output: { type: "must_find", file: "src/config.ts", start_line: 11, end_line: 12 },
      source_finding_id: "f1",
    });
  });

  it("AC-8: a finding whose review has no agent (or whose patch is gone) gets a dialog, not an editor", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    hooks.reviews = { data: [{ id: "r1", agent_id: null, agent_name: null }] };
    renderWithIntl(<FindingCaseEditor finding={FINDING} prId="pr1" onClose={onClose} />);

    expect(screen.getByText("The diff of this finding is no longer available")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(onClose).toHaveBeenCalled();
  });

  it("AC-7: a server error from a save is shown inline in the editor", () => {
    hooks.error = new Error("boom");
    renderWithIntl(<FindingCaseEditor finding={FINDING} prId="pr1" onClose={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("The case could not be saved.");
  });

  it("AC-13: an existing case of the agent on the same lines is named in the warning", () => {
    hooks.cases = {
      data: [
        {
          id: "c9",
          name: "older-stripe-case",
          expected_output: { type: "must_find", file: "src/config.ts", start_line: 12, end_line: 14 },
        },
      ],
    };
    renderWithIntl(<FindingCaseEditor finding={FINDING} prId="pr1" onClose={() => {}} />);
    expect(screen.getByText(/overlaps the case/)).toHaveTextContent("older-stripe-case");
  });
});
