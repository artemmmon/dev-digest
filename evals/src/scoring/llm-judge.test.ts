/**
 * How a judge reply is turned into a score — no model.
 *   pnpm eval:static
 */

import { describe, expect, test } from "vitest";
import { scoreVerdict } from "./llm-judge.js";

const P = ["a is stated", "b is stated", "c is stated"];
const r = (practice: string, passed: unknown, evidence = "q") => ({ practice, passed, evidence }) as never;

describe("scoreVerdict", () => {
  test("all asked practices passed is 1.0", () => {
    const v = scoreVerdict(P, P.map((p) => r(p, true)));
    expect(v).toMatchObject({ passed: 3, total: 3, score: 1 });
  });

  test("a practice the judge left out is a failure, not a smaller denominator", () => {
    const v = scoreVerdict(P, [r(P[0], true)]);
    expect(v.total).toBe(3);
    expect(v.score).toBeCloseTo(1 / 3);
    expect(v.results.filter((x) => !x.passed).map((x) => x.practice)).toEqual([P[1], P[2]]);
  });

  test("an empty reply scores 0, not 1", () => {
    expect(scoreVerdict(P, []).score).toBe(0);
  });

  test("results are matched by text, so a reordered reply keeps its meaning", () => {
    const v = scoreVerdict(P, [r(P[2], false), r(P[0], true), r(P[1], true)]);
    expect(v.results.map((x) => x.passed)).toEqual([true, true, false]);
  });

  test("when the count matches and the judge paraphrased, the position decides", () => {
    const v = scoreVerdict(P, [r("A is stated", true), r("B is stated", false), r("C is stated", true)]);
    expect(v.results.map((x) => x.passed)).toEqual([true, false, true]);
  });

  test('the string "false" is not a pass', () => {
    expect(scoreVerdict(P, P.map((p) => r(p, "false"))).score).toBe(0);
  });
});
