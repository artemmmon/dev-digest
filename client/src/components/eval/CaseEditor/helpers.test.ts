import { describe, expect, it } from "vitest";
import type { EvalCaseRecord } from "@devdigest/shared";
import { buildCaseSeed, overlappingCase, parseLine, seedName, seedType, slugify } from "./helpers";

/** Seeding a case from a finding (AC-3, AC-4, AC-5, AC-6, EC-5) and the overlap check (AC-13). */

const finding = (over: Record<string, unknown> = {}) => ({
  id: "f1",
  title: "SQL injection in the user query",
  file: "src/db.ts",
  start_line: 11,
  end_line: 14,
  accepted_at: null as string | null,
  dismissed_at: null as string | null,
  ...over,
});

const meta = { pr_title: "Add query", pr_body: "Body text" };

describe("seedType — AC-3", () => {
  it("AC-3: an open or accepted finding seeds must_find, a dismissed one must_not_flag", () => {
    expect(seedType(finding())).toBe("must_find");
    expect(seedType(finding({ accepted_at: "2026-10-10T10:00:00Z" }))).toBe("must_find");
    expect(seedType(finding({ dismissed_at: "2026-10-10T10:00:00Z" }))).toBe("must_not_flag");
  });
});

describe("seedName — AC-4, EC-5", () => {
  it("AC-4: must-find-<slug> for must_find and no-<slug> for must_not_flag, lower-case kebab", () => {
    expect(seedName("must_find", "SQL injection in the user query")).toBe(
      "must-find-sql-injection-in-the-user-query",
    );
    expect(seedName("must_not_flag", "Unused import")).toBe("no-unused-import");
  });

  it("EC-5: a long title is cut to the first 34 slug characters", () => {
    const name = seedName("must_find", "A".repeat(80));
    expect(name).toBe(`must-find-${"a".repeat(34)}`);
    expect(slugify("Hello,   World!!")).toBe("hello-world");
  });

  it("EC-5: a title that leaves an empty slug falls back to `finding`", () => {
    expect(seedName("must_find", "")).toBe("must-find-finding");
    expect(seedName("must_not_flag", "!!! ???")).toBe("no-finding");
    expect(seedName("must_find", "дрібниці")).toBe("must-find-finding");
  });
});

describe("buildCaseSeed — AC-3, AC-4, AC-5, AC-6", () => {
  it("AC-5: the diff is the stored patch headed by `--- a/<file>` and `+++ b/<file>`", () => {
    const seed = buildCaseSeed(finding(), "@@ -10,3 +10,4 @@\n context\n+added", meta);
    expect(seed.input_diff).toBe(
      "--- a/src/db.ts\n+++ b/src/db.ts\n@@ -10,3 +10,4 @@\n context\n+added",
    );
  });

  it("AC-3, AC-4, AC-6: type, name, the finding's file and lines, PR meta and the source finding id", () => {
    const seed = buildCaseSeed(finding({ dismissed_at: "2026-10-10T10:00:00Z" }), "@@ -1 +1 @@", meta);
    expect(seed).toMatchObject({
      name: "no-sql-injection-in-the-user-query",
      expected_output: { type: "must_not_flag", file: "src/db.ts", start_line: 11, end_line: 14 },
      input_meta: meta,
      source_finding_id: "f1",
    });
  });
});

describe("overlappingCase — AC-13", () => {
  const caseAt = (id: string, file: string, start: number, end: number): EvalCaseRecord =>
    ({
      id,
      name: `case ${id}`,
      expected_output: { type: "must_find", file, start_line: start, end_line: end },
    }) as EvalCaseRecord;
  const cases = [caseAt("c1", "src/db.ts", 10, 12), caseAt("c2", "src/other.ts", 10, 12)];

  it("AC-13: a case in the same file sharing a line (bounds inclusive) is returned", () => {
    expect(overlappingCase(cases, { file: "src/db.ts", start_line: 12, end_line: 20 })?.id).toBe("c1");
    expect(overlappingCase(cases, { file: "src/db.ts", start_line: 1, end_line: 10 })?.id).toBe("c1");
  });

  it("AC-13: another file, or a range one line away, does not overlap", () => {
    expect(overlappingCase(cases, { file: "src/db.ts", start_line: 13, end_line: 20 })).toBeNull();
    expect(overlappingCase(cases, { file: "src/new.ts", start_line: 10, end_line: 12 })).toBeNull();
  });

  it("AC-13: the case being edited is skipped", () => {
    expect(overlappingCase(cases, { file: "src/db.ts", start_line: 10, end_line: 12 }, "c1")).toBeNull();
  });
});

describe("parseLine — AC-11", () => {
  it("AC-11: only whole numbers of at least 1 are lines", () => {
    expect(parseLine("12")).toBe(12);
    expect(parseLine(" 7 ")).toBe(7);
    expect(parseLine("0")).toBeNull();
    expect(parseLine("-3")).toBeNull();
    expect(parseLine("1.5")).toBeNull();
    expect(parseLine("")).toBeNull();
  });
});
