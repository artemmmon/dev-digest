import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FindingRecord, PrFile, PrReviewComment, ReviewRecord, SmartDiff } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";

// Mock hook state, mutated per test — the same pattern RunTraceDrawer.test.tsx uses
// for a shared fixture, but with a helper to reset it (FindingsPanel.test.tsx:7 for
// the vi.mock-on-hooks approach itself).
const state = vi.hoisted(() => ({
  comments: [] as PrReviewComment[],
  reviews: [] as ReviewRecord[],
  smartDiff: undefined as SmartDiff | undefined,
  smartDiffLoading: false,
  mutate: vi.fn(),
  mutateAsync: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: state.comments }),
  useCreatePrComment: () => ({ mutateAsync: state.mutateAsync, isPending: false }),
  usePrReviews: () => ({ data: state.reviews }),
  useFindingAction: () => ({ mutate: state.mutate, isPending: false }),
}));
vi.mock("@/lib/hooks/core", () => ({
  usePrSmartDiff: () => ({
    data: state.smartDiff,
    isLoading: state.smartDiffLoading,
    isError: false,
  }),
}));

import { DiffTab } from "./DiffTab";

afterEach(cleanup);

function prFile(path: string): PrFile {
  return { path, additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n context\n+// change" };
}

function finding(overrides: Partial<FindingRecord> & { id: string; file: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "bug",
    title: "Off-by-one",
    start_line: 2,
    end_line: 2,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

function comment(overrides: Partial<PrReviewComment> & { id: number; path: string }): PrReviewComment {
  return {
    line: 2,
    original_line: 2,
    side: "RIGHT",
    body: "A comment.",
    user: "reviewer",
    created_at: "2026-09-26T00:00:00.000Z",
    html_url: "https://github.com/acme/repo/pull/1#comment",
    in_reply_to_id: null,
    is_outdated: false,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRecord> & { id: string }): ReviewRecord {
  return {
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    batch_id: "batch1",
    agent_name: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    grounding: null,
    created_at: "2026-09-26T00:00:00.000Z",
    findings: [],
    ...overrides,
  };
}

// GitHub order: boilerplate, core x2, tests, wiring, docs.
const FILES: PrFile[] = [
  prFile("pnpm-lock.yaml"),
  prFile("src/service.ts"),
  prFile("src/other.ts"),
  prFile("src/service.test.ts"),
  prFile("src/index.ts"),
  prFile("README.md"),
];

const SMART_DIFF: SmartDiff = {
  groups: [
    {
      role: "core",
      files: [
        { path: "src/service.ts", additions: 1, deletions: 0, finding_lines: [2] },
        { path: "src/other.ts", additions: 1, deletions: 0, finding_lines: [] },
      ],
    },
    { role: "tests", files: [{ path: "src/service.test.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "wiring", files: [{ path: "src/index.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "docs", files: [{ path: "README.md", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "boilerplate", files: [{ path: "pnpm-lock.yaml", additions: 1, deletions: 0, finding_lines: [] }] },
  ],
  split_suggestion: { too_big: false, total_lines: 6, proposed_splits: [] },
};

beforeEach(() => {
  state.comments = [];
  state.reviews = [];
  state.smartDiff = undefined;
  state.smartDiffLoading = false;
  state.mutate = vi.fn();
  state.mutateAsync = vi.fn().mockResolvedValue({});
});

describe("DiffTab — Smart Diff role groups", () => {
  it("groups files by role in order, keeps docs/boilerplate collapsed, and expands boilerplate on click", async () => {
    state.smartDiff = SMART_DIFF;
    const user = userEvent.setup();
    renderWithIntl(<DiffTab prId="pr1" filesCount={FILES.length} files={FILES} />);

    const roleHeaders = screen
      .getAllByRole("button")
      .filter((h) => /^(Core logic|Tests|Wiring|Docs|Boilerplate)/.test(h.textContent ?? ""));
    expect(roleHeaders.map((h) => h.textContent?.match(/^(Core logic|Tests|Wiring|Docs|Boilerplate)/)?.[0])).toEqual([
      "Core logic",
      "Tests",
      "Wiring",
      "Docs",
      "Boilerplate",
    ]);

    expect(screen.getByRole("button", { name: /Core logic/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Tests/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Wiring/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Docs/ })).toHaveAttribute("aria-expanded", "false");
    const boilerplateHeader = screen.getByRole("button", { name: /Boilerplate/ });
    expect(boilerplateHeader).toHaveAttribute("aria-expanded", "false");

    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
    await user.click(boilerplateHeader);
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
  });

  it("shows a group counter and a file dot for findings, renders the finding under its line, and Accept calls the mutation", async () => {
    state.smartDiff = SMART_DIFF;
    state.reviews = [
      review({
        id: "r1",
        findings: [
          finding({ id: "f1", file: "src/service.ts", start_line: 2, title: "Off-by-one" }),
          finding({ id: "f2", file: "src/service.ts", start_line: 2, title: "Missing null check", severity: "WARNING" }),
          finding({ id: "f3", file: "src/other.ts", start_line: 2, title: "Unused import", severity: "SUGGESTION" }),
        ],
      }),
    ];
    const user = userEvent.setup();
    renderWithIntl(<DiffTab prId="pr1" filesCount={FILES.length} files={FILES} />);

    // 2 files with findings (service.ts + other.ts), not the 3 findings.
    const coreHeader = screen.getByRole("button", { name: /Core logic/ });
    expect(within(coreHeader).getByLabelText("2 files with findings")).toHaveTextContent("● 2");
    expect(screen.getAllByRole("img", { name: "This file has review findings" })).toHaveLength(2);

    expect(screen.getByText("Off-by-one")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Accept" })[0]!);
    expect(state.mutate).toHaveBeenCalledWith({ findingId: "f1", action: "accept", prId: "pr1" });
  });

  it("switches to Original order and lists every file in the GitHub PrFile[] order", async () => {
    state.smartDiff = SMART_DIFF;
    const user = userEvent.setup();
    renderWithIntl(<DiffTab prId="pr1" filesCount={FILES.length} files={FILES} />);

    await user.click(screen.getByRole("button", { name: "Original" }));
    const pathRegex = /^(pnpm-lock\.yaml|src\/service\.ts|src\/other\.ts|src\/service\.test\.ts|src\/index\.ts|README\.md)$/;
    const paths = screen.getAllByText(pathRegex);
    expect(paths.map((el) => el.textContent)).toEqual(FILES.map((f) => f.path));
  });

  it("hides comments and inline findings together when the toggle is switched off", async () => {
    state.smartDiff = SMART_DIFF;
    state.comments = [comment({ id: 1, path: "src/service.ts" })];
    state.reviews = [review({ id: "r1", findings: [finding({ id: "f1", file: "src/service.ts", start_line: 2 })] })];
    const user = userEvent.setup();
    renderWithIntl(<DiffTab prId="pr1" filesCount={FILES.length} files={FILES} />);

    // A round with findings starts shown (P1.5 / P2.7).
    expect(screen.getByText("Off-by-one")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Hide comments/ }));
    expect(screen.queryByText("Off-by-one")).not.toBeInTheDocument();
  });

  it("shows the review-not-run notice and no counter when no review has run yet", () => {
    state.smartDiff = SMART_DIFF;
    renderWithIntl(<DiffTab prId="pr1" filesCount={FILES.length} files={FILES} />);
    expect(screen.getByText("Run a review to see findings inline in Files changed.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/files with findings/)).not.toBeInTheDocument();
  });
});
