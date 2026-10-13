/**
 * Pure statistics math on fixed arrays — no model.
 *   pnpm vitest run src/records/stats.test.ts
 */

import { describe, expect, test } from "vitest";
import { aggregate, calcStats, computeFlags, type EvalRecord } from "./stats.js";

const series = (passed: number, total: number) => ({ passed, total, rate: total ? passed / total : 0 });

describe("calcStats", () => {
  test("mean / min / max / sample stddev of a known array", () => {
    const s = calcStats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(s.mean).toBe(5);
    expect(s.min).toBe(2);
    expect(s.max).toBe(9);
    // sample stddev (n−1) of this classic array ≈ 2.138 (population would be 2.0)
    expect(s.stddev).toBeCloseTo(2.138, 3);
    expect(s.n).toBe(8);
  });

  test("empty → zeros with n=0; singleton → stddev 0", () => {
    expect(calcStats([])).toEqual({ mean: 0, stddev: 0, min: 0, max: 0, n: 0 });
    expect(calcStats([42])).toEqual({ mean: 42, stddev: 0, min: 42, max: 42, n: 1 });
  });
});

describe("computeFlags", () => {
  test("non_discriminating: 100% in both", () => {
    expect(computeFlags(series(5, 5), series(5, 5))).toContain("non_discriminating");
  });

  test("always_failing (n>0, rate 0) is NOT missing_data", () => {
    const flags = computeFlags(series(0, 5), series(0, 5));
    expect(flags).toContain("always_failing");
    expect(flags).not.toContain("missing_data");
  });

  test("missing_data (n=0) is NOT always_failing", () => {
    const flags = computeFlags(series(0, 0), series(0, 5));
    expect(flags).toContain("missing_data");
    expect(flags).not.toContain("always_failing");
  });

  test("flaky is exclusive of the 20% and 80% boundaries", () => {
    expect(computeFlags(series(1, 2), series(5, 5))).toContain("flaky"); // 50%
    expect(computeFlags(series(1, 5), series(5, 5))).not.toContain("flaky"); // exactly 20%
    expect(computeFlags(series(4, 5), series(5, 5))).not.toContain("flaky"); // exactly 80%
  });

  test("cost_regression when candidate tokens exceed 125% of baseline", () => {
    expect(computeFlags(series(5, 5), series(5, 5), { candTokens: 130, baseTokens: 100 })).toContain(
      "cost_regression",
    );
    expect(computeFlags(series(5, 5), series(5, 5), { candTokens: 120, baseTokens: 100 })).not.toContain(
      "cost_regression",
    );
  });
});

describe("aggregate", () => {
  const row = (over: Partial<EvalRecord>): EvalRecord => ({
    schema: 1,
    run_id: "r",
    git_sha: "x",
    dirty: false,
    config: "candidate",
    nodeid: "f.eval.ts > case",
    label: "case",
    outcome: true,
    practices: [],
    num_turns: 1,
    metrics: { durationMs: 1, inputTokens: 0, outputTokens: 0, toolCallCount: 0 },
    trace: { tools: [], subagents: [], skills: [], reads: [] },
    output_file: "o.md",
    ...over,
  });

  test("a control row does not pool into its treatment's pass rate", () => {
    const agg = aggregate([
      row({ outcome: true }),
      row({ outcome: false, control: true, label: "case [control]" }),
      row({ outcome: true }),
    ]);
    expect(agg["f.eval.ts > case"].pass).toMatchObject({ passed: 2, total: 2 });
    expect(agg["f.eval.ts > case"].label).toBe("case");
  });

  test("a series that has only control rows (EVAL_CONTROL=only) is kept", () => {
    const agg = aggregate([row({ outcome: false, control: true }), row({ outcome: true, control: true })]);
    expect(agg["f.eval.ts > case"].pass).toMatchObject({ passed: 1, total: 2 });
  });
});
