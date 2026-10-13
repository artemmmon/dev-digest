/**
 * How eval:report groups records — no model.
 *   pnpm eval:static
 */

import { describe, expect, test } from "vitest";
import { groupSeries, type Row } from "./report.js";

const row = (nodeid: string, over: Partial<Row> = {}): Row => ({
  nodeid,
  label: "finds both violations in the checkout diff",
  outcome: true,
  num_turns: 3,
  ...over,
});

describe("groupSeries", () => {
  test("the same label from two eval files is two series, not one", () => {
    const strict = "/evals/agents/architecture-reviewer/architecture-reviewer.eval.ts > case";
    const lite = "/evals/agents/architecture-reviewer-lite/architecture-reviewer-lite.eval.ts > case";
    const { bySeries, heading } = groupSeries([row(strict), row(lite), row(strict), row(lite)]);
    expect([...bySeries.keys()]).toEqual([strict, lite]);
    expect(bySeries.get(strict)).toHaveLength(2);
    expect(heading(row(strict))).toContain("architecture-reviewer.eval.ts");
    expect(heading(row(lite))).toContain("architecture-reviewer-lite.eval.ts");
  });

  test("a label used once keeps a plain heading", () => {
    const { heading } = groupSeries([row("/w/review.eval.ts > a", { label: "group 1" })]);
    expect(heading(row("/w/review.eval.ts > a", { label: "group 1" }))).toBe("group 1");
  });

  test("a record without a node id is grouped by its label", () => {
    const { bySeries } = groupSeries([{ label: "old", outcome: true, num_turns: 1 }, { label: "old", outcome: false, num_turns: 1 }]);
    expect(bySeries.get("old")).toHaveLength(2);
  });
});
