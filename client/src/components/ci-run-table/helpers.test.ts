import { describe, expect, it } from "vitest";
import { formatDuration, prTarget, runCounts } from "./helpers";

describe("formatDuration", () => {
  it("is null for a run without a duration", () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
  });

  it("formats milliseconds as seconds with one decimal", () => {
    expect(formatDuration(7400)).toBe("7.4s");
    expect(formatDuration(0)).toBe("0.0s");
    expect(formatDuration(860)).toBe("0.9s");
  });
});

describe("runCounts", () => {
  it("maps the run's counts to the shared counter's severities", () => {
    expect(runCounts({ critical: 2, warning: 3, suggestion: 1 })).toEqual({ CRITICAL: 2, WARNING: 3, SUGGESTION: 1 });
  });

  it("reads a null count as zero", () => {
    expect(runCounts({ critical: null, warning: null, suggestion: null })).toEqual({
      CRITICAL: 0,
      WARNING: 0,
      SUGGESTION: 0,
    });
  });
});

describe("prTarget", () => {
  const repos = new Map([["octo/widgets", "repo-1"]]);

  it("is null for a run without a PR", () => {
    expect(prTarget({ repo: "octo/widgets", pr_number: null, pr_id: null }, repos)).toBeNull();
  });

  it("links to the DevDigest page when the PR is imported (AC-90)", () => {
    expect(prTarget({ repo: "octo/widgets", pr_number: 7, pr_id: "pr-1" }, repos)).toEqual({
      href: "/repos/repo-1/pulls/7",
      internal: true,
    });
  });

  it("links to GitHub when the PR is not imported (AC-91)", () => {
    expect(prTarget({ repo: "octo/widgets", pr_number: 7, pr_id: null }, repos)).toEqual({
      href: "https://github.com/octo/widgets/pull/7",
      internal: false,
    });
  });

  it("links to GitHub when the repository is not in the workspace", () => {
    expect(prTarget({ repo: "octo/other", pr_number: 3, pr_id: "pr-9" }, repos)).toEqual({
      href: "https://github.com/octo/other/pull/3",
      internal: false,
    });
  });
});
