import { describe, it, expect } from "vitest";
import type { ConventionCandidate, ConventionScanReport } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { defaultSelection, formatReport, formatWhen, scanErrorKind, shortSha, splitByStatus } from "./helpers";

const c = (id: string, status: ConventionCandidate["status"], confidence: number): ConventionCandidate => ({
  id,
  repo_id: "r1",
  category: "naming",
  rule: id,
  evidence_path: "a.ts",
  evidence_line: 1,
  evidence_snippet: "x",
  confidence,
  status,
  created_at: "",
  updated_at: "",
});

describe("splitByStatus", () => {
  it("separates pending from accepted, most confident first, and ignores anything else", () => {
    const { pending, accepted } = splitByStatus([
      c("p1", "pending", 0.5),
      c("a1", "accepted", 0.6),
      c("p2", "pending", 0.9),
      c("r1", "rejected", 0.99),
      c("a2", "accepted", 0.8),
    ]);
    expect(pending.map((x) => x.id)).toEqual(["p2", "p1"]);
    expect(accepted.map((x) => x.id)).toEqual(["a2", "a1"]);
  });
});

describe("defaultSelection", () => {
  const accepted = [c("a", "accepted", 1), c("b", "accepted", 1)];
  it("selects every accepted candidate by default", () => {
    expect(defaultSelection(accepted, new Set())).toEqual(["a", "b"]);
  });
  it("leaves out the ones switched off", () => {
    expect(defaultSelection(accepted, new Set(["a"]))).toEqual(["b"]);
  });
});

describe("shortSha", () => {
  it("keeps 7 characters and tolerates a missing sha", () => {
    expect(shortSha("abcdef0123456")).toBe("abcdef0");
    expect(shortSha(null)).toBeNull();
  });
});

describe("formatWhen", () => {
  const now = Date.parse("2026-09-21T12:00:00Z");
  it("speaks in the largest whole unit", () => {
    expect(formatWhen("2026-09-21T09:00:00Z", now)).toBe("3 hours ago");
    expect(formatWhen("2026-09-20T12:00:00Z", now)).toBe("yesterday");
    expect(formatWhen("2026-09-21T11:58:00Z", now)).toBe("2 minutes ago");
    expect(formatWhen("2026-09-21T11:59:50Z", now)).toBe("now");
  });
  it("returns the input when it is not a date", () => {
    expect(formatWhen("garbage", now)).toBe("garbage");
  });
});

describe("formatReport", () => {
  const report: ConventionScanReport = {
    provider: "openrouter",
    model: "m",
    duration_ms: 12_340,
    config_files: [],
    sampled_files: ["a", "b"],
    sample_source: "fallback",
    raw_candidates: 4,
    kept: 1,
    line_corrected: 0,
    dropped: {
      unknown_file: 0,
      snippet_not_found: 2,
      trivial_snippet: 0,
      duplicate: 1,
      known_decision: 0,
      category_cap: 0,
    },
    categories: {},
    tokens_in: 10,
    tokens_out: 5,
  };
  it("counts files, keeps only the reasons that dropped something and rounds the duration", () => {
    const r = formatReport(report);
    expect(r.files).toBe(2);
    expect(r.dropped).toEqual([
      { reason: "snippet_not_found", count: 2 },
      { reason: "duplicate", count: 1 },
    ]);
    expect(r.model).toBe("openrouter/m");
    expect(r.seconds).toBe(12.3);
    expect(r.costUsd).toBeNull();
  });
});

describe("scanErrorKind", () => {
  it("recognises the errors the page has a message for", () => {
    expect(scanErrorKind(new ApiError("x", 409, "scan_in_progress"))).toBe("scanInProgress");
    expect(scanErrorKind(new ApiError("x", 409))).toBe("scanInProgress");
    expect(scanErrorKind(new ApiError("x", 500, "config_error"))).toBe("noApiKey");
    expect(scanErrorKind(new ApiError("x", 0, "network_error"))).toBe("network");
    expect(scanErrorKind(new ApiError("x", 502, "external_service_error"))).toBeNull();
    expect(scanErrorKind(new Error("x"))).toBeNull();
  });
});
