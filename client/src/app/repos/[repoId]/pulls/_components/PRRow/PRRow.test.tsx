/**
 * PRRow — the COST cell shows the latest review batch's spend, or "—" when the
 * PR has no priced run; the FINDINGS cell shows the latest run's severity
 * breakdown and previews it (read-only) on hover.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReviewRecord } from "@devdigest/shared";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../messages/en/common.json";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const reviews = vi.hoisted(() => ({ data: undefined as ReviewRecord[] | undefined }));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: (_prId: string, opts?: { enabled?: boolean }) => ({
    data: opts?.enabled ? reviews.data : undefined,
    isLoading: false,
  }),
}));

afterEach(() => {
  cleanup();
  reviews.data = undefined;
});

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit",
    base: "main",
    head_sha: "a1b2c3d4",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: null,
    updated_at: null,
    score: null,
    cost_usd: null,
    findings_by_severity: null,
    ...o,
  };
}

const REVIEW: ReviewRecord = {
  id: "rv-1",
  pr_id: "pr-1",
  agent_id: "a1",
  run_id: "run-1",
  agent_name: "Security Reviewer",
  batch_id: "batch-1",
  kind: "review",
  verdict: "request_changes",
  summary: null,
  score: 61,
  model: "gpt-4.1",
  created_at: new Date().toISOString(),
  findings: [
    {
      id: "f1",
      severity: "CRITICAL",
      category: "security",
      title: "Hardcoded Stripe secret key",
      file: "src/config.ts",
      start_line: 11,
      end_line: 11,
      rationale: "A **live** Stripe key is committed in `src/config.ts`.",
      suggestion: null,
      confidence: 0.95,
      kind: "finding",
      trifecta_components: null,
      evidence: null,
      review_id: "rv-1",
      accepted_at: null,
      dismissed_at: null,
    },
  ],
} as unknown as ReviewRecord;

function renderRow(p: PrMeta) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages, common }}>
        <PRRow pr={p} repoId="repo-1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("PRRow — cost cell", () => {
  it("shows the compact cost of the latest batch", () => {
    renderRow(pr({ score: 61, cost_usd: 0.014 }));
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows '—' for score and cost when the PR has no reviewed batch", () => {
    renderRow(pr({ score: null, cost_usd: null }));
    // score cell, cost cell, findings cell and "updated" (null date) render an em-dash
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});

/** A second agent of the SAME round — the newest review, and it found nothing. */
const CLEAN_REVIEW: ReviewRecord = {
  ...REVIEW,
  id: "rv-2",
  run_id: "run-2",
  agent_name: "Performance Reviewer",
  score: 100,
  findings: [],
} as unknown as ReviewRecord;

describe("PRRow — findings cell", () => {
  it("shows a count per severity present in the latest run", () => {
    renderRow(pr({ findings_by_severity: { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 } }));
    expect(screen.getByLabelText("2 Critical")).toBeInTheDocument();
    expect(screen.getByLabelText("1 Warning")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Suggestion/)).toBeNull();
  });

  it("shows '—' when the PR has never been reviewed", () => {
    renderRow(pr({ findings_by_severity: null }));
    expect(screen.queryByLabelText(/Critical/)).toBeNull();
  });

  it("opens a read-only popover on hover and closes it on leave", () => {
    reviews.data = [REVIEW];
    renderRow(pr({ findings_by_severity: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 } }));
    const cell = screen.getByLabelText("1 Critical").parentElement!.parentElement!;

    expect(screen.queryByText("1 findings in this run")).toBeNull();
    fireEvent.mouseEnter(cell);

    const popover = screen.getByText("1 findings in this run").parentElement!.parentElement!;
    expect(within(popover).getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(within(popover).getByText("src/config.ts:11")).toBeInTheDocument();
    expect(within(popover).getByText("95% conf")).toBeInTheDocument();
    // Markdown markers are stripped, not rendered.
    expect(
      within(popover).getByText("A live Stripe key is committed in src/config.ts."),
    ).toBeInTheDocument();
    // Criterion: previews are read-only — accept/reject live on the PR page.
    expect(within(popover).queryAllByRole("button")).toHaveLength(0);

    fireEvent.mouseLeave(cell);
    expect(screen.queryByText("1 findings in this run")).toBeNull();
  });

  it("previews the whole review round, not just the newest agent's review", () => {
    // Regression: the newest review of a round is an arbitrary agent — here a clean
    // Performance pass — and used to empty the popover while the icons showed 1.
    reviews.data = [CLEAN_REVIEW, REVIEW];
    renderRow(pr({ findings_by_severity: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 } }));
    fireEvent.mouseEnter(screen.getByLabelText("1 Critical").parentElement!.parentElement!);

    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.queryByText("No findings in this run")).toBeNull();
  });
});
