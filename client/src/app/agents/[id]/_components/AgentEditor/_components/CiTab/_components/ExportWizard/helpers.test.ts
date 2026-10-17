import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { canContinueFrom, formatBytes, installErrorText, isValidYaml, requestKey, toggleTrigger } from "./helpers";

describe("toggleTrigger", () => {
  it("adds a trigger in the order the Configure step lists them", () => {
    expect(toggleTrigger(["opened", "reopened"], "synchronize")).toEqual(["opened", "synchronize", "reopened"]);
  });

  it("removes a trigger that is already chosen", () => {
    expect(toggleTrigger(["opened", "synchronize"], "opened")).toEqual(["synchronize"]);
  });

  it("can leave none chosen", () => {
    expect(toggleTrigger(["opened"], "opened")).toEqual([]);
  });
});

describe("installErrorText", () => {
  it("is null without an error", () => {
    expect(installErrorText(null)).toBeNull();
    expect(installErrorText(undefined)).toBeNull();
  });

  it("maps github_workflow_scope to our text, whatever the server message", () => {
    expect(installErrorText(new ApiError("token lacks scope", 403, "github_workflow_scope"))).toEqual({
      key: "wizard.install.errors.workflowScope",
    });
  });

  it("shows the server's own message for another coded error", () => {
    expect(installErrorText(new ApiError("Replace not confirmed", 409, "ci_replace_unconfirmed"))).toEqual({
      message: "Replace not confirmed",
    });
  });

  it("falls back to the generic text for an API error without a message", () => {
    expect(installErrorText(new ApiError("", 500))).toEqual({ key: "wizard.install.errors.generic" });
  });

  it("falls back to the generic text for a non-API error", () => {
    expect(installErrorText(new TypeError("Failed to fetch"))).toEqual({ key: "wizard.install.errors.generic" });
  });
});

describe("requestKey", () => {
  it("joins the repository, triggers and post-as choice", () => {
    expect(requestKey("repo-1", ["opened", "synchronize"], "github_review")).toBe(
      "repo-1|opened,synchronize|github_review",
    );
  });

  it("differs when any choice differs", () => {
    const base = requestKey("repo-1", ["opened"], "none");
    expect(requestKey("repo-2", ["opened"], "none")).not.toBe(base);
    expect(requestKey("repo-1", ["reopened"], "none")).not.toBe(base);
    expect(requestKey("repo-1", ["opened"], "pr_comment")).not.toBe(base);
  });
});

describe("isValidYaml", () => {
  it("rejects an empty or blank text (AC-18)", () => {
    expect(isValidYaml("")).toBe(false);
    expect(isValidYaml("  \n ")).toBe(false);
  });

  it("rejects text that is not YAML", () => {
    expect(isValidYaml("a: [unclosed")).toBe(false);
  });

  it("accepts a workflow", () => {
    expect(isValidYaml("name: ci\non:\n  pull_request:\njobs: {}\n")).toBe(true);
  });
});

describe("formatBytes", () => {
  it("formats bytes, kilobytes and megabytes", () => {
    expect(formatBytes(12)).toBe("12 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(340 * 1024)).toBe("340 KB");
    expect(formatBytes(1.2 * 1024 * 1024)).toBe("1.2 MB");
  });
});

describe("canContinueFrom", () => {
  const ready = { hasRepo: true, previewPending: false, hasPreview: true, triggerCount: 2 };

  it("Target needs a repository and no generation running", () => {
    expect(canContinueFrom(0, { ...ready, hasPreview: false })).toBe(true);
    expect(canContinueFrom(0, { ...ready, hasRepo: false })).toBe(false);
    expect(canContinueFrom(0, { ...ready, previewPending: true })).toBe(false);
  });

  it("Preview needs generated files", () => {
    expect(canContinueFrom(1, ready)).toBe(true);
    expect(canContinueFrom(1, { ...ready, hasPreview: false })).toBe(false);
  });

  it("Configure needs a trigger, generated files and no generation running", () => {
    expect(canContinueFrom(2, ready)).toBe(true);
    expect(canContinueFrom(2, { ...ready, triggerCount: 0 })).toBe(false);
    expect(canContinueFrom(2, { ...ready, previewPending: true })).toBe(false);
    expect(canContinueFrom(2, { ...ready, hasPreview: false })).toBe(false);
  });

  it("Install has no Continue", () => {
    expect(canContinueFrom(3, ready)).toBe(false);
  });
});
