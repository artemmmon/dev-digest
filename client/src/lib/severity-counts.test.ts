import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { countBySeverity, isEmptyCounts, SEVERITY_LIST } from "./severity-counts";

function f(severity: string): FindingRecord {
  return { severity } as unknown as FindingRecord;
}

describe("countBySeverity", () => {
  it("tallies each severity", () => {
    expect(countBySeverity([f("CRITICAL"), f("WARNING"), f("WARNING")])).toEqual({
      CRITICAL: 1,
      WARNING: 2,
      SUGGESTION: 0,
    });
  });

  it("returns zeros for an empty list", () => {
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });

  it("ignores severities outside the contract (e.g. INFO)", () => {
    expect(countBySeverity([f("INFO"), f("CRITICAL")]).CRITICAL).toBe(1);
  });
});

describe("isEmptyCounts", () => {
  it("is true for null, undefined and all-zero counts", () => {
    expect(isEmptyCounts(null)).toBe(true);
    expect(isEmptyCounts(undefined)).toBe(true);
    expect(isEmptyCounts({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 })).toBe(true);
  });

  it("is false as soon as one severity is present", () => {
    expect(isEmptyCounts({ CRITICAL: 0, WARNING: 0, SUGGESTION: 1 })).toBe(false);
  });
});

describe("SEVERITY_LIST", () => {
  it("is ordered most severe first", () => {
    expect([...SEVERITY_LIST]).toEqual(["CRITICAL", "WARNING", "SUGGESTION"]);
  });
});
