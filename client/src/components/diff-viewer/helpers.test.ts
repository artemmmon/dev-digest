import { describe, it, expect } from "vitest";
import { parsePatch, fileChip } from "./helpers";

describe("parsePatch", () => {
  it("returns an empty array for a missing patch", () => {
    expect(parsePatch(null)).toEqual([]);
    expect(parsePatch(undefined)).toEqual([]);
  });

  it("parses hunk header, added, removed and context lines with line numbers", () => {
    const patch = ["@@ -1,2 +1,3 @@", " context", "-old", "+new"].join("\n");
    expect(parsePatch(patch)).toEqual([
      { kind: "hunk", text: "@@ -1,2 +1,3 @@" },
      { kind: "ctx", text: "context", oldNo: 1, newNo: 1 },
      { kind: "del", text: "old", oldNo: 2 },
      { kind: "add", text: "new", newNo: 2 },
    ]);
  });
});

describe("fileChip", () => {
  it("resolves a recognised extension to its label and full name", () => {
    expect(fileChip("lib/main.dart")).toEqual({ label: "dart", name: "Dart", generated: false });
    expect(fileChip("src/App.tsx")).toEqual({ label: "tsx", name: "TypeScript (TSX)", generated: false });
  });

  it("flags a build_runner / codegen file as generated", () => {
    expect(fileChip("lib/models/user.g.dart")).toEqual({
      label: "dart",
      name: "Dart",
      generated: true,
    });
    expect(fileChip("lib/models/user.freezed.dart")?.generated).toBe(true);
  });

  it("returns null for an unrecognised or extensionless path", () => {
    expect(fileChip("LICENSE")).toBeNull();
    expect(fileChip("src/weird.zzz")).toBeNull();
  });
});
