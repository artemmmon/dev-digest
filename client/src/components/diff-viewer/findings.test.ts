import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { findingKey, partitionFindings, worstSeverity } from "./findings";

function finding(overrides: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "a.ts",
    start_line: 10,
    end_line: 10,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

describe("findingKey", () => {
  it("anchors to the RIGHT side at the finding's start line", () => {
    expect(findingKey(finding({ start_line: 12 }))).toBe("RIGHT:12");
  });
});

describe("partitionFindings", () => {
  it("splits findings that match a rendered line from those the diff doesn't render", () => {
    const renderedKeys = new Set(["RIGHT:10", "LEFT:5"]);
    const inPatch = finding({ id: "in", start_line: 10 });
    const outOfPatch = finding({ id: "out", start_line: 99 });
    const { matched, outOfPatch: outList } = partitionFindings([inPatch, outOfPatch], renderedKeys);
    expect(matched.get("RIGHT:10")).toEqual([inPatch]);
    expect(outList).toEqual([outOfPatch]);
  });

  it("groups multiple findings on the same line under one key", () => {
    const renderedKeys = new Set(["RIGHT:10"]);
    const a = finding({ id: "a", start_line: 10 });
    const b = finding({ id: "b", start_line: 10 });
    const { matched, outOfPatch } = partitionFindings([a, b], renderedKeys);
    expect(matched.get("RIGHT:10")).toEqual([a, b]);
    expect(outOfPatch).toEqual([]);
  });
});

describe("worstSeverity", () => {
  it("returns the most severe entry, CRITICAL first", () => {
    const list = [
      finding({ severity: "SUGGESTION" }),
      finding({ severity: "CRITICAL" }),
      finding({ severity: "WARNING" }),
    ];
    expect(worstSeverity(list)).toBe("CRITICAL");
  });

  it("returns null for an empty list", () => {
    expect(worstSeverity([])).toBeNull();
  });
});
