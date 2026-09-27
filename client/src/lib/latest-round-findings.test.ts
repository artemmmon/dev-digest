import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { latestRoundFindings } from "./latest-round-findings";

function finding(overrides: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rv1",
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    batch_id: null,
    agent_name: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    grounding: null,
    created_at: "2026-01-01T00:00:00Z",
    findings: [],
    ...overrides,
  };
}

describe("latestRoundFindings", () => {
  it("returns [] when there is no review", () => {
    expect(latestRoundFindings(undefined)).toEqual([]);
    expect(latestRoundFindings([])).toEqual([]);
  });

  it("collects findings across every review in the newest batch round, skipping older rounds", () => {
    const reviews = [
      review({ id: "rv-new-1", batch_id: "b2", findings: [finding({ id: "f1", review_id: "rv-new-1" })] }),
      review({ id: "rv-new-2", batch_id: "b2", findings: [finding({ id: "f2", review_id: "rv-new-2" })] }),
      review({ id: "rv-old", batch_id: "b1", findings: [finding({ id: "f3", review_id: "rv-old" })] }),
    ];
    const ids = latestRoundFindings(reviews).map((f) => f.id);
    expect(ids.sort()).toEqual(["f1", "f2"]);
  });

  it("falls back to the newest review alone when it has no batch_id", () => {
    const reviews = [
      review({ id: "rv-new", batch_id: null, findings: [finding({ id: "f1" })] }),
      review({ id: "rv-old", batch_id: null, findings: [finding({ id: "f2" })] }),
    ];
    expect(latestRoundFindings(reviews).map((f) => f.id)).toEqual(["f1"]);
  });

  it("sorts by severity, most severe first, unknown severities last", () => {
    const reviews = [
      review({
        id: "rv1",
        batch_id: "b1",
        findings: [
          finding({ id: "sugg", severity: "SUGGESTION" }),
          finding({ id: "crit", severity: "CRITICAL" }),
          finding({ id: "warn", severity: "WARNING" }),
        ],
      }),
    ];
    expect(latestRoundFindings(reviews).map((f) => f.id)).toEqual(["crit", "warn", "sugg"]);
  });

  it("skips a review that is not a `review` kind (e.g. a summary row) when picking the newest", () => {
    const reviews = [
      review({ id: "summary", kind: "summary", findings: [finding({ id: "should-not-appear" })] }),
      review({ id: "rv1", batch_id: null, findings: [finding({ id: "f1" })] }),
    ];
    expect(latestRoundFindings(reviews).map((f) => f.id)).toEqual(["f1"]);
  });
});
