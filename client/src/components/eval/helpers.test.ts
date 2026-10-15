import { describe, expect, it } from "vitest";
import type { EvalRunSummary } from "@devdigest/shared";
import {
  deltaPoints,
  formatMetric,
  isCounted,
  latestTwoCounted,
  passedOfCompleted,
  pct,
  regressions,
  runProgress,
} from "./helpers";

/** Eval helpers shared by the Evals tab, the dashboard and Compare (AC-34, AC-37, AC-40, AC-66). */

function run(over: Partial<EvalRunSummary> & { id: string }): EvalRunSummary {
  return {
    agent_id: "a1",
    agent_version: 1,
    skill_versions: [],
    status: "done",
    started_at: "2026-10-10T10:00:00.000Z",
    finished_at: "2026-10-10T10:05:00.000Z",
    cases_total: 4,
    cases_completed: 4,
    cases_errored: 0,
    cases_passed: 3,
    recall: 0.8,
    precision: 0.8,
    citation_accuracy: 0.8,
    unlabelled_findings: 0,
    cost_usd: 0.1,
    ...over,
  };
}

describe("isCounted — AC-66", () => {
  it("AC-66: only done and partial runs count; running and failed never do", () => {
    expect(isCounted({ status: "done" })).toBe(true);
    expect(isCounted({ status: "partial" })).toBe(true);
    expect(isCounted({ status: "running" })).toBe(false);
    expect(isCounted({ status: "failed" })).toBe(false);
  });

  it("AC-66: the latest pair skips newer running and failed runs, whatever order the list arrives in", () => {
    const runs = [
      run({ id: "running", status: "running", started_at: "2026-10-14T10:00:00.000Z" }),
      run({ id: "old", started_at: "2026-10-10T10:00:00.000Z" }),
      run({ id: "failed", status: "failed", started_at: "2026-10-13T10:00:00.000Z" }),
      run({ id: "new", status: "partial", started_at: "2026-10-12T10:00:00.000Z" }),
    ];
    const { latest, previous } = latestTwoCounted(runs);
    expect(latest?.id).toBe("new");
    expect(previous?.id).toBe("old");
  });

  it("AC-66: with no counted run both sides are null", () => {
    expect(latestTwoCounted([run({ id: "f", status: "failed" })])).toEqual({ latest: null, previous: null });
  });
});

describe("pct and formatMetric — AC-34, AC-37", () => {
  it("AC-37: a metric reads as a whole percentage", () => {
    expect(pct(0.756)).toBe(76);
    expect(formatMetric(0.5)).toBe("50%");
    expect(formatMetric(1)).toBe("100%");
    expect(formatMetric(0)).toBe("0%");
  });

  it("AC-34: a metric with no value reads as an em dash, never 0%", () => {
    expect(formatMetric(null)).toBe("—");
    expect(formatMetric(undefined)).toBe("—");
  });
});

describe("deltaPoints — AC-37", () => {
  it("AC-37: the change is the difference of the whole percentages, signed", () => {
    expect(deltaPoints(0.8, 0.5)).toBe(30);
    expect(deltaPoints(0.5, 0.8)).toBe(-30);
    expect(deltaPoints(0.5, 0.5)).toBe(0);
    // whole points: 0.756 → 76, 0.744 → 74
    expect(deltaPoints(0.756, 0.744)).toBe(2);
  });

  it("AC-34: no change is shown when either side has no value", () => {
    expect(deltaPoints(null, 0.5)).toBeNull();
    expect(deltaPoints(0.5, null)).toBeNull();
  });
});

describe("regressions — AC-40", () => {
  it("AC-40: names each metric that dropped by at least one whole point, with its drop", () => {
    const previous = run({ id: "p", recall: 0.9, precision: 0.8, citation_accuracy: 1 });
    const latest = run({ id: "l", recall: 0.7, precision: 0.8, citation_accuracy: 0.99 });
    expect(regressions(latest, previous)).toEqual([
      { metric: "recall", drop: 20 },
      { metric: "citation_accuracy", drop: 1 },
    ]);
  });

  it("AC-40: a drop under one whole point, a rise and an equal value raise no alert", () => {
    const previous = run({ id: "p", recall: 0.804, precision: 0.5, citation_accuracy: 0.8 });
    const latest = run({ id: "l", recall: 0.8, precision: 0.9, citation_accuracy: 0.8 });
    expect(regressions(latest, previous)).toEqual([]);
  });

  it("AC-40, AC-34: a metric that has no value on either side is never a regression; a missing run gives none", () => {
    const previous = run({ id: "p", recall: 0.9 });
    expect(regressions(run({ id: "l", recall: null }), previous)).toEqual([]);
    expect(regressions(null, previous)).toEqual([]);
    expect(regressions(previous, null)).toEqual([]);
  });
});

describe("run numbers — AC-22, AC-37, AC-38", () => {
  it("AC-22: progress k counts completed and errored cases", () => {
    expect(runProgress({ cases_completed: 2, cases_errored: 1 })).toBe(3);
  });

  it("AC-37, AC-38: passed over completed cases", () => {
    expect(passedOfCompleted({ cases_passed: 3, cases_completed: 5 })).toBe("3 / 5");
  });
});
