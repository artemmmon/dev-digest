/**
 * What the trend reporter records — no model.
 *   pnpm eval:static
 */

import { describe, expect, test } from "vitest";
import { trendRows, type TaskLike } from "./trend-reporter.js";

const test_ = (name: string, state: string): TaskLike => ({ type: "test", name, result: { state } });

describe("trendRows", () => {
  test("a suite is not a test: two tests under one describe are two rows", () => {
    const files: TaskLike[] = [
      {
        name: "skills/x/x.eval.ts",
        tasks: [{ type: "suite", name: "skill:x", result: { state: "pass" }, tasks: [test_("a", "pass"), test_("b", "fail")] }],
      },
    ];
    const rows = trendRows(files, "run", "sha").map((r) => JSON.parse(r));
    expect(rows.map((r) => r.nodeid)).toEqual(["skills/x/x.eval.ts > a", "skills/x/x.eval.ts > b"]);
    expect(rows.map((r) => r.outcome)).toEqual(["pass", "fail"]);
  });

  test("a skipped test is not recorded", () => {
    const files: TaskLike[] = [{ name: "f.eval.ts", tasks: [test_("a", "skip"), test_("b", "pass")] }];
    expect(trendRows(files, "run", "sha")).toHaveLength(1);
  });
});
