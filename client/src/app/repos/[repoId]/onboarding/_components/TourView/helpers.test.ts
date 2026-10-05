import { describe, it, expect } from "vitest";
import type { Tour } from "@devdigest/shared";
import { isSectionEmpty, isTourStale, stripImageEmbeds, tourToMarkdown, type TourMarkdownLabels } from "./helpers";

const LABELS: TourMarkdownLabels = {
  heading: "Onboarding for",
  sections: {
    architecture_overview: "Architecture overview",
    critical_paths: "Critical paths",
    how_to_run: "How to run locally",
    guided_reading: "Guided reading path",
    first_tasks: "First tasks",
  },
  empty: "Nothing found for this section",
  source: "Source",
  complexity: { low: "Low complexity", medium: "Medium complexity", high: "High complexity" },
};

function tour(overrides: Partial<Record<string, unknown>> = {}): Tour {
  return {
    repo_id: "00000000-0000-4000-8000-000000000001",
    generated_at: "2026-10-05T10:00:00.000Z",
    commit_sha: "abc123",
    files_indexed: 12,
    limited_index: false,
    provider: "openrouter",
    model: "m",
    tokens_in: 1,
    tokens_out: 1,
    cost_usd: null,
    dropped_items: 0,
    sections: [
      { kind: "architecture_overview", body: "An API and a web app.", diagram: "flowchart LR\n  a --> b" },
      { kind: "critical_paths", files: [{ path: "src/server.ts", note: "App bootstrap" }] },
      { kind: "how_to_run", steps: [{ command: "pnpm dev", source: "package.json" }] },
      { kind: "guided_reading", reading: [{ path: "README.md", why: "Start here" }] },
      { kind: "first_tasks", tasks: [{ title: "Add a health route", scope: "src/api", complexity: "low" }] },
    ],
    ...overrides,
  } as Tour;
}

describe("stripImageEmbeds", () => {
  it("replaces a markdown image with its alt text", () => {
    expect(stripImageEmbeds("See ![logo](https://evil.test/a.png) here")).toBe("See logo here");
  });

  it("handles a url with nested parentheses and a title", () => {
    expect(stripImageEmbeds('![](https://evil.test/a_(1).png "t") end')).toBe(" end");
  });

  it("replaces reference-style and shortcut images", () => {
    expect(stripImageEmbeds("![r][x] and ![s]")).toBe("r and s");
  });

  it("removes raw img tags, including one rebuilt from the pieces of another", () => {
    const out = stripImageEmbeds('a <img src="https://evil.test/p.png"> b <im<img>g src=x> c');
    expect(out).not.toMatch(/<img/i);
    expect(out).not.toContain("evil.test");
  });

  it("removes an image that only appears after a tag is stripped, however deep the nesting", () => {
    const nested = "!" + "<im".repeat(8) + "<img>" + "g>".repeat(8) + "[x](https://evil.test/y.png)";
    const out = stripImageEmbeds(nested);
    expect(out).not.toContain("![");
    expect(out).not.toMatch(/<img/i);
  });

  it("leaves text without images unchanged", () => {
    expect(stripImageEmbeds("A [link](https://example.com) and `code`.")).toBe("A [link](https://example.com) and `code`.");
  });
});

describe("isSectionEmpty", () => {
  it("is true for an overview with blank body and no diagram", () => {
    expect(isSectionEmpty({ kind: "architecture_overview", body: "  ", diagram: null })).toBe(true);
  });

  it("is false for an overview that has only a diagram", () => {
    expect(isSectionEmpty({ kind: "architecture_overview", body: "", diagram: "flowchart LR" })).toBe(false);
  });

  it("is true for a list section with no items", () => {
    expect(isSectionEmpty({ kind: "critical_paths", files: [] })).toBe(true);
    expect(isSectionEmpty({ kind: "first_tasks", tasks: [] })).toBe(true);
  });
});

describe("isTourStale", () => {
  it("is true only when an indexed commit exists and differs", () => {
    expect(isTourStale("def456", "abc123")).toBe(true);
    expect(isTourStale("abc123", "abc123")).toBe(false);
  });

  it("is false when the repository has no indexed commit", () => {
    expect(isTourStale(null, "abc123")).toBe(false);
    expect(isTourStale(undefined, "abc123")).toBe(false);
    expect(isTourStale("", "abc123")).toBe(false);
  });
});

describe("tourToMarkdown", () => {
  it("writes the title and the five sections in order with every item", () => {
    const md = tourToMarkdown(tour(), "acme/app", LABELS);
    const headings = md.split("\n").filter((line) => line.startsWith("#"));
    expect(headings).toEqual([
      "# Onboarding for acme/app",
      "## Architecture overview",
      "## Critical paths",
      "## How to run locally",
      "## Guided reading path",
      "## First tasks",
    ]);
    expect(md).toContain("- `src/server.ts` — App bootstrap");
    expect(md).toContain("1. `pnpm dev`\n   Source: `package.json`");
    expect(md).toContain("1. `README.md`\n   Start here");
    expect(md).toContain("- **Add a health route** — `src/api` (Low complexity)");
    expect(md).toContain("```mermaid\nflowchart LR\n  a --> b\n```");
  });

  it("says a section is empty instead of leaving it blank", () => {
    const t = tour();
    t.sections[1] = { kind: "critical_paths", files: [] };
    expect(tourToMarkdown(t, "acme/app", LABELS)).toContain("## Critical paths\n\nNothing found for this section");
  });

  it("wraps a command that contains backticks in a longer code span", () => {
    const t = tour();
    t.sections[2] = { kind: "how_to_run", steps: [{ command: "echo `date`", source: "README.md" }] };
    expect(tourToMarkdown(t, "acme/app", LABELS)).toContain("1. `` echo `date` ``");
  });

  it("uses a fence longer than any backtick run inside the diagram", () => {
    const t = tour();
    t.sections[0] = { kind: "architecture_overview", body: "x", diagram: "a\n```\nb" };
    expect(tourToMarkdown(t, "acme/app", LABELS)).toContain("````mermaid\na\n```\nb\n````");
  });

  it("strips image embeds from the overview body", () => {
    const t = tour();
    t.sections[0] = { kind: "architecture_overview", body: "Hi ![x](https://evil.test/p.png)", diagram: null };
    const md = tourToMarkdown(t, "acme/app", LABELS);
    expect(md).not.toContain("evil.test");
    expect(md).toContain("Hi x");
  });
});
