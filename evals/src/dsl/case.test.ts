/**
 * The trace assertions of a workflow case, on hand-made traces — no model.
 *   pnpm eval:static
 */

import { describe, expect, test } from "vitest";
import { traceMisses } from "./case.js";

type Trace = Parameters<typeof traceMisses>[1];
type TraceCase = Parameters<typeof traceMisses>[0];

const trace = (over: Partial<Trace> = {}): Trace => ({
  subagents: [],
  skillsInvoked: [],
  filesRead: [],
  isError: false,
  ...over,
});
const traceCase = (over: Partial<TraceCase>): TraceCase => ({ kind: "trace", name: "t", prompt: "p", ...over });

describe("traceMisses", () => {
  test("a trace that meets every expectation has no misses", () => {
    const c = traceCase({
      expectFilesRead: ["server/INSIGHTS.md"],
      expectSkills: ["engineering-insights"],
      expectSubagents: ["architecture-reviewer"],
    });
    const r = trace({
      filesRead: ["/repo/server/INSIGHTS.md"],
      skillsInvoked: ["engineering-insights"],
      subagents: ["architecture-reviewer"],
    });
    expect(traceMisses(c, r)).toEqual([]);
  });

  test("every missed expectation is reported, not only the first", () => {
    const c = traceCase({
      expectFilesRead: ["a.md", "b.md"],
      expectSkills: ["onion-architecture"],
      expectSubagents: ["researcher"],
    });
    const misses = traceMisses(c, trace({ filesRead: ["/repo/a.md"] }));
    expect(misses).toHaveLength(3);
    expect(misses.join("\n")).toContain("b.md");
    expect(misses.join("\n")).toContain("onion-architecture");
    expect(misses.join("\n")).toContain("researcher");
  });

  test("a skill counts as engaged when its SKILL.md was read, or by a plugin-prefixed call", () => {
    const c = traceCase({ expectSkills: ["zod"] });
    expect(traceMisses(c, trace({ filesRead: ["/r/.claude/skills/zod/SKILL.md"] }))).toEqual([]);
    expect(traceMisses(c, trace({ skillsInvoked: ["plugin:zod"] }))).toEqual([]);
    expect(traceMisses(c, trace())).toHaveLength(1);
  });

  test("absence expectations flag what must not happen", () => {
    const c = traceCase({
      expectNoSubagents: ["architecture-reviewer-lite"],
      expectNoSkills: ["engineering-insights"],
      expectNoFilesRead: ["TESTING.md"],
    });
    expect(traceMisses(c, trace())).toEqual([]);
    const misses = traceMisses(
      c,
      trace({
        subagents: ["architecture-reviewer-lite"],
        skillsInvoked: ["engineering-insights"],
        filesRead: ["/repo/TESTING.md"],
      }),
    );
    expect(misses).toHaveLength(3);
  });

  test("a session that ended in error is a miss even when the evidence is in", () => {
    const c = traceCase({ expectFilesRead: ["a.md"] });
    expect(traceMisses(c, trace({ filesRead: ["a.md"], isError: true }))).toHaveLength(1);
  });

  test("a near-miss path is not a read: the substring must be in the path", () => {
    const c = traceCase({ expectFilesRead: ["server/INSIGHTS.md"] });
    expect(traceMisses(c, trace({ filesRead: ["/repo/client/INSIGHTS.md"] }))).toHaveLength(1);
  });
});
