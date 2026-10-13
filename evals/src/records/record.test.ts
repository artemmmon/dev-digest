/**
 * Names of the saved answers — no model.
 *   pnpm eval:static
 */

import { describe, expect, test } from "vitest";
import { outputSlug } from "./record.js";

describe("outputSlug", () => {
  const label = "finds both violations in the checkout diff, rates them and cites a documented rule";

  test("the same case name under two eval files gets two files", () => {
    const strict = outputSlug(label, "/evals/agents/architecture-reviewer/architecture-reviewer.eval.ts > " + label);
    const lite = outputSlug(label, "/evals/agents/architecture-reviewer-lite/architecture-reviewer-lite.eval.ts > " + label);
    expect(strict).not.toBe(lite);
  });

  test("two long labels that differ only after the 80th character stay apart", () => {
    const base = "x".repeat(90);
    expect(outputSlug(`${base} [control]`, "n > a")).not.toBe(outputSlug(base, "n > a"));
  });

  test("the name is a file-safe slug", () => {
    expect(outputSlug("Group 1 · docs routing: INSIGHTS/README", "n")).toMatch(/^[a-z0-9-]+-[0-9a-f]{6}$/);
  });
});
