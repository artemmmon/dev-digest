import { describe, it, expect } from "vitest";
import type { BlastDownstream } from "../../helpers";
import { GRAPH, graphLayout, truncateLabel } from "./helpers";

const caller = (name: string, n = 1) => ({ name, file: `src/${name}.ts`, line: n });

function item(callers: number, endpoints: string[] = [], crons: string[] = []): BlastDownstream {
  return {
    symbol: "rateLimit",
    callers: Array.from({ length: callers }, (_, i) => caller(`caller${i}`, i + 1)),
    endpoints_affected: endpoints,
    crons_affected: crons,
  };
}

describe("graphLayout", () => {
  it("lays out one node per caller/endpoint/cron plus the root, on a 28px pitch", () => {
    const g = graphLayout(item(3, ["GET /a", "POST /b"], ["nightly"]));
    expect(g.nodes.filter((n) => n.kind === "root")).toHaveLength(1);
    expect(g.nodes.filter((n) => n.kind === "caller")).toHaveLength(3);
    expect(g.nodes.filter((n) => n.kind === "endpoint")).toHaveLength(2);
    expect(g.nodes.filter((n) => n.kind === "cron")).toHaveLength(1);
    // root → each leaf (faint) and root → each caller
    expect(g.edges).toHaveLength(3 + 3);

    const ys = g.nodes.filter((n) => n.kind === "caller").map((n) => n.y);
    expect(ys[1]! - ys[0]!).toBe(GRAPH.pitch);
    expect(ys[2]! - ys[1]!).toBe(GRAPH.pitch);
    expect(g.nodes[0]!.x).toBe(70);
  });

  it("grows the height with the tallest column and centres the root", () => {
    const small = graphLayout(item(1));
    const tall = graphLayout(item(2, ["a", "b", "c", "d", "e"]));
    expect(tall.height).toBeGreaterThan(small.height);
    expect(tall.height).toBe(5 * GRAPH.pitch + GRAPH.pad * 2);
    expect(tall.nodes[0]!.y).toBe(tall.height / 2);
  });

  it("cuts long labels to 16 chars with an ellipsis and keeps the full text as title", () => {
    const long = "GET /api/v1/organizations/:id/members";
    const g = graphLayout(item(0, [long]));
    const leaf = g.nodes.find((n) => n.kind === "endpoint")!;
    expect(leaf.label).toHaveLength(16);
    expect(leaf.label.endsWith("…")).toBe(true);
    expect(leaf.title).toBe(long);
    expect(truncateLabel("short")).toBe("short");
  });
});
