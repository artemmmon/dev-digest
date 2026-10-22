import { describe, it, expect } from "vitest";
import {
  DEFAULT_STATS_PERIOD,
  SMALL_SAMPLE_DECISIONS,
  decisionsOf,
  isSmallSample,
  parseStatsPeriod,
  statsPeriodToApiQuery,
  statsPeriodToSearch,
  todayLocal,
  validateCustomRange,
} from "./stats-period";

const TODAY = "2026-10-21";

describe("parseStatsPeriod", () => {
  it("AC-5: no period in the URL is 30 days", () => {
    expect(parseStatsPeriod({}, TODAY)).toEqual({ period: "30d" });
    expect(parseStatsPeriod({ period: null, from: null, to: null }, TODAY)).toEqual(DEFAULT_STATS_PERIOD);
  });

  it("reads 1d and 30d, ignoring stray dates", () => {
    expect(parseStatsPeriod({ period: "1d", from: "2026-10-01", to: "2026-10-02" }, TODAY)).toEqual({ period: "1d" });
    expect(parseStatsPeriod({ period: "30d" }, TODAY)).toEqual({ period: "30d" });
  });

  it("AC-10: a valid custom range in the URL is kept", () => {
    expect(parseStatsPeriod({ period: "custom", from: "2026-10-01", to: "2026-10-07" }, TODAY)).toEqual({
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-07",
    });
  });

  it("AC-11 / EC-8: an unknown period falls back to 30 days", () => {
    expect(parseStatsPeriod({ period: "7d" }, TODAY)).toEqual({ period: "30d" });
    expect(parseStatsPeriod({ period: "" }, TODAY)).toEqual({ period: "30d" });
    expect(parseStatsPeriod({ period: "CUSTOM", from: "2026-10-01", to: "2026-10-07" }, TODAY)).toEqual({
      period: "30d",
    });
  });

  it("AC-11: an invalid custom range falls back to 30 days", () => {
    expect(parseStatsPeriod({ period: "custom" }, TODAY)).toEqual({ period: "30d" });
    expect(parseStatsPeriod({ period: "custom", from: "2026-10-01" }, TODAY)).toEqual({ period: "30d" });
    expect(parseStatsPeriod({ period: "custom", from: "2026-10-09", to: "2026-10-01" }, TODAY)).toEqual({
      period: "30d",
    });
    expect(parseStatsPeriod({ period: "custom", from: "2026-10-01", to: "2026-10-22" }, TODAY)).toEqual({
      period: "30d",
    });
    expect(parseStatsPeriod({ period: "custom", from: "yesterday", to: "today" }, TODAY)).toEqual({ period: "30d" });
  });
});

describe("validateCustomRange", () => {
  it("AC-8 / EC-7: start after end is rejected", () => {
    expect(validateCustomRange("2026-10-09", "2026-10-01", TODAY)).toBe("startAfterEnd");
  });

  it("AC-8 / EC-7: an end date after today is rejected, today itself is allowed", () => {
    expect(validateCustomRange("2026-10-01", "2026-10-22", TODAY)).toBe("endAfterToday");
    expect(validateCustomRange("2026-10-01", TODAY, TODAY)).toBeNull();
  });

  it("a missing or malformed date is 'missing'", () => {
    expect(validateCustomRange("", "2026-10-01", TODAY)).toBe("missing");
    expect(validateCustomRange("2026-10-01", "", TODAY)).toBe("missing");
    expect(validateCustomRange("2026-02-30", "2026-03-01", TODAY)).toBe("missing");
  });

  it("a one-day range (start = end) is valid", () => {
    expect(validateCustomRange("2026-10-05", "2026-10-05", TODAY)).toBeNull();
  });
});

describe("statsPeriodToSearch", () => {
  it("AC-10: a custom range puts its dates in the URL", () => {
    expect(statsPeriodToSearch({ period: "custom", from: "2026-10-01", to: "2026-10-07" })).toEqual({
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-07",
    });
  });

  it("a rolling period removes the date params", () => {
    expect(statsPeriodToSearch({ period: "1d" })).toEqual({ period: "1d", from: null, to: null });
  });
});

describe("statsPeriodToApiQuery", () => {
  it("sends only the period for 1d and 30d", () => {
    expect(statsPeriodToApiQuery({ period: "1d" })).toBe("period=1d");
    expect(statsPeriodToApiQuery({ period: "30d" })).toBe("period=30d");
  });

  it("AC-6: a custom range goes as the local start and end of the chosen days, as ISO instants", () => {
    const qs = new URLSearchParams(statsPeriodToApiQuery({ period: "custom", from: "2026-10-01", to: "2026-10-07" }));
    expect(qs.get("period")).toBe("custom");
    expect(qs.get("from")).toBe(new Date(2026, 9, 1, 0, 0, 0, 0).toISOString());
    expect(qs.get("to")).toBe(new Date(2026, 9, 7, 23, 59, 59, 999).toISOString());
    expect(Date.parse(qs.get("from")!)).toBeLessThan(Date.parse(qs.get("to")!));
  });
});

describe("todayLocal", () => {
  it("formats the local date as YYYY-MM-DD", () => {
    expect(todayLocal(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(todayLocal(new Date(2026, 11, 31, 0, 0))).toBe("2026-12-31");
  });
});

describe("small sample", () => {
  it("AC-38: fewer than 10 decisions is a small sample, 10 is not", () => {
    expect(SMALL_SAMPLE_DECISIONS).toBe(10);
    expect(isSmallSample({ accepted: 3, dismissed: 0 })).toBe(true);
    expect(isSmallSample({ accepted: 5, dismissed: 4 })).toBe(true);
    expect(isSmallSample({ accepted: 5, dismissed: 5 })).toBe(false);
    expect(decisionsOf({ accepted: 7, dismissed: 2 })).toBe(9);
  });
});
