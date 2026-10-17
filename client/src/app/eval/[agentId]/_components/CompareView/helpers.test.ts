import { describe, expect, it } from "vitest";
import { skillChanges, wordDiff } from "./helpers";

/** Compare helpers: the word-level prompt diff (AC-47) and the skill version summary (AC-48). */

const marked = (tokens: ReturnType<typeof wordDiff>, kind: "add" | "del") =>
  tokens.filter((t) => t.kind === kind).map((t) => t.text.trim());

describe("wordDiff — AC-47", () => {
  it("AC-47: marks the removed and the added words", () => {
    const tokens = wordDiff("Be strict about SQL injection", "Be lenient about SQL injection and XSS");
    expect(marked(tokens, "del")).toEqual(["strict"]);
    expect(marked(tokens, "add")).toEqual(["lenient", "and XSS"]);
  });

  it("AC-47: joining the unchanged and added tokens rebuilds the newer text", () => {
    const newer = "Review the diff and report only defensible findings.";
    const tokens = wordDiff("Review the diff. Report anything you like.", newer);
    const rebuilt = tokens
      .filter((t) => t.kind !== "del")
      .map((t) => t.text)
      .join("");
    expect(rebuilt.replace(/\s+/g, " ").trim()).toBe(newer);
  });

  it("AC-47: identical prompts have no marked word, and an added word is only an addition", () => {
    expect(wordDiff("same words here", "same words here").every((t) => t.kind === "same")).toBe(true);
    const grown = wordDiff("one two", "one two three");
    expect(marked(grown, "add")).toEqual(["three"]);
    expect(marked(grown, "del")).toEqual([]);
  });

  it("AC-47: whitespace-only differences are not changes", () => {
    expect(wordDiff("a  b\n c", "a b c").every((t) => t.kind === "same")).toBe(true);
  });

  it("AC-47: leading whitespace that differs is not a change, and the common tail keeps the newer text", () => {
    const tokens = wordDiff("  a b", "a b");
    expect(tokens.every((t) => t.kind === "same")).toBe(true);
    expect(tokens.map((t) => t.text).join("")).toBe("a b");
    expect(wordDiff("a b", "\n\n  a b").every((t) => t.kind === "same")).toBe(true);
  });

  it("AC-47: trailing whitespace that differs is not a change", () => {
    expect(wordDiff("a b  \n", "a b").every((t) => t.kind === "same")).toBe(true);
    expect(wordDiff("a b", "a b \t\n\n").every((t) => t.kind === "same")).toBe(true);
  });

  it("AC-47: texts of whitespace only, against each other, have no change", () => {
    expect(wordDiff("   ", "\n\t").some((t) => t.kind !== "same")).toBe(false);
    expect(wordDiff("", "   ").some((t) => t.kind !== "same")).toBe(false);
    expect(wordDiff("  \n ", "").some((t) => t.kind !== "same")).toBe(false);
  });

  it("AC-47: a whitespace-only side is no removed text when the other side has words", () => {
    const grown = wordDiff("   ", "Be strict");
    expect(grown.map((t) => t.kind)).toEqual(["add"]);
    const shrunk = wordDiff("Be strict", "\n ");
    expect(shrunk.map((t) => t.kind)).toEqual(["del"]);
    expect(shrunk[0]!.text).toBe("Be strict");
  });

  it("AC-47: whitespace around a real change does not hide it", () => {
    const tokens = wordDiff("  Be strict  ", "Be lenient");
    expect(marked(tokens, "del")).toEqual(["strict"]);
    expect(marked(tokens, "add")).toEqual(["lenient"]);
  });

  it("AC-47: a diff too large for the table falls back to one removed block and one added block", () => {
    const older = Array.from({ length: 60 }, (_, i) => `old${i}`).join(" ");
    const newer = Array.from({ length: 60 }, (_, i) => `new${i}`).join(" ");
    const tokens = wordDiff(older, newer, 100);
    expect(tokens.map((t) => t.kind)).toEqual(["del", "add"]);
  });

  it("AC-47: an empty older or newer prompt is all added or all removed", () => {
    expect(wordDiff("", "brand new").map((t) => t.kind)).toEqual(["add"]);
    expect(wordDiff("gone now", "").map((t) => t.kind)).toEqual(["del"]);
  });
});

describe("skillChanges — AC-48", () => {
  it("AC-48: lists a skill whose version differs, one that was added and one that was removed", () => {
    const changes = skillChanges(
      [
        { skill_id: "s1", name: "TS rules", version: 2 },
        { skill_id: "s2", name: "Same", version: 1 },
        { skill_id: "s3", name: "Dropped", version: 4 },
      ],
      [
        { skill_id: "s1", name: "TS rules", version: 3 },
        { skill_id: "s2", name: "Same", version: 1 },
        { skill_id: "s4", name: "Added", version: 1 },
      ],
    );
    expect(changes).toEqual([
      { skill_id: "s4", name: "Added", change: "added", from: null, to: 1 },
      { skill_id: "s3", name: "Dropped", change: "removed", from: 4, to: null },
      { skill_id: "s1", name: "TS rules", change: "changed", from: 2, to: 3 },
    ]);
  });

  it("AC-48: runs with the same skills at the same versions list nothing", () => {
    const same = [{ skill_id: "s1", name: "TS rules", version: 2 }];
    expect(skillChanges(same, same)).toEqual([]);
  });
});
