import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, SmartDiff } from "@devdigest/shared";
import { buildRoleGroups, countFilesWithFindings } from "./helpers";

function prFile(path: string): PrFile {
  return { path, additions: 1, deletions: 0, patch: null };
}

function finding(file: string, id: string): FindingRecord {
  return {
    id,
    severity: "WARNING",
    category: "bug",
    title: "t",
    file,
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.5,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const SMART_DIFF: SmartDiff = {
  groups: [
    { role: "core", files: [{ path: "src/config.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "tests", files: [{ path: "src/config.test.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "wiring", files: [] },
    { role: "docs", files: [] },
    { role: "boilerplate", files: [{ path: "pnpm-lock.yaml", additions: 1, deletions: 0, finding_lines: [] }] },
  ],
  split_suggestion: { too_big: false, total_lines: 3, proposed_splits: [] },
};

describe("buildRoleGroups", () => {
  it("keeps GitHub's own file order inside a group and puts an unknown path in core", () => {
    // GitHub order: pnpm-lock.yaml first, then the two known files, then an
    // unclassified path the smart-diff response never saw.
    const files = [
      prFile("pnpm-lock.yaml"),
      prFile("src/config.ts"),
      prFile("src/config.test.ts"),
      prFile("src/new-file.ts"),
    ];
    const groups = buildRoleGroups(SMART_DIFF, files);

    expect(groups.map((g) => g.role)).toEqual(["core", "tests", "wiring", "docs", "boilerplate"]);
    // "core" keeps GitHub order (config.ts comes after the lock file in `files`)
    // and gains the unknown path instead of dropping it.
    expect(groups[0]!.files.map((f) => f.path)).toEqual(["src/config.ts", "src/new-file.ts"]);
    expect(groups[1]!.files.map((f) => f.path)).toEqual(["src/config.test.ts"]);
    expect(groups[2]!.files).toEqual([]); // wiring: empty
    expect(groups[4]!.files.map((f) => f.path)).toEqual(["pnpm-lock.yaml"]);
  });
});

describe("countFilesWithFindings", () => {
  it("counts files that have a finding, not the findings themselves", () => {
    const groupFiles = [prFile("a.ts"), prFile("b.ts"), prFile("c.ts")];
    const findings = [finding("a.ts", "f1"), finding("a.ts", "f2"), finding("b.ts", "f3")];
    expect(countFilesWithFindings(groupFiles, findings)).toBe(2);
    expect(countFilesWithFindings(groupFiles, [])).toBe(0);
    // A finding on a file outside this group doesn't count.
    expect(countFilesWithFindings(groupFiles, [finding("z.ts", "f4")])).toBe(0);
  });
});
