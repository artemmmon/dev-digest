/**
 * Which tool calls count as consulting a file — no model.
 *   pnpm eval:static
 */

import { describe, expect, test } from "vitest";
import { consultedFile } from "./run-claude.js";

describe("consultedFile", () => {
  test("a Read names its file", () => {
    expect(consultedFile("Read", { file_path: "/r/server/INSIGHTS.md" })).toBe("/r/server/INSIGHTS.md");
  });

  test("a Grep aimed at one file consults it: that is how a 40 KB INSIGHTS.md is meant to be used", () => {
    expect(consultedFile("Grep", { pattern: "repo-intel", path: "server/src/modules/repo-intel/INSIGHTS.md" })).toBe(
      "server/src/modules/repo-intel/INSIGHTS.md",
    );
  });

  test("a Grep over a directory, or with no path, names no file", () => {
    expect(consultedFile("Grep", { pattern: "x", path: "server/src/modules/repo-intel" })).toBeNull();
    expect(consultedFile("Grep", { pattern: "x" })).toBeNull();
  });

  test("other tools consult nothing", () => {
    expect(consultedFile("Glob", { pattern: "**/*.md", path: "/r/a.md" })).toBeNull();
    expect(consultedFile("Skill", { skill: "zod" })).toBeNull();
  });
});
