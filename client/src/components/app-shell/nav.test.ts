import { describe, it, expect } from "vitest";
import { NAV, SHORTCUTS, resolveHref } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";
import { NAV_LABEL_KEYS } from "./constants";
import evalMessages from "../../../messages/en/eval.json";
import ciMessages from "../../../messages/en/ci.json";
import agentPerformanceMessages from "../../../messages/en/agentPerformance.json";
import shellMessages from "../../../messages/en/shell.json";

describe("sidebar nav — Conventions", () => {
  it("sits in SKILLS LAB after Agents (Eval Dashboard follows), not in WORKSPACE", () => {
    const lab = NAV.find((g) => g.section === "SKILLS LAB")!;
    expect(lab.items.map((i) => i.key)).toEqual(["skills", "agents", "conventions", "eval"]);
    expect(NAV.find((g) => g.section === "WORKSPACE")!.items.map((i) => i.key)).not.toContain("conventions");
  });

  it("points at the repo-scoped route and resolves the active repo", () => {
    const item = NAV.flatMap((g) => g.items).find((i) => i.key === "conventions")!;
    expect(item).toMatchObject({ label: "Conventions", icon: "ListChecks", gKey: "c" });
    expect(resolveHref(item.href, "r1")).toBe("/repos/r1/conventions");
  });

  it("documents the g c shortcut and highlights the item on its route", () => {
    expect(SHORTCUTS).toContainEqual(expect.objectContaining({ keys: "g c", group: "Navigation" }));
    expect(activeKeyFor("/repos/r1/conventions")).toBe("conventions");
  });

  it("uses unique g-keys", () => {
    const keys = NAV.flatMap((g) => g.items).map((i) => i.gKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("sidebar nav — Eval Dashboard", () => {
  it("AC-41: the SKILLS LAB section shows 'Eval Dashboard' right after Conventions, linking to /eval", () => {
    const lab = NAV.find((g) => g.section === "SKILLS LAB")!;
    const keys = lab.items.map((i) => i.key);
    expect(keys.indexOf("eval")).toBe(keys.indexOf("conventions") + 1);
    const item = lab.items.find((i) => i.key === "eval")!;
    expect(item).toMatchObject({ href: "/eval" });
    // NFR-5: the text is not a literal in the vendored nav; it resolves from the eval namespace.
    expect(item.label).toBeUndefined();
    expect(NAV_LABEL_KEYS.eval).toBe("eval.nav.label");
    expect(evalMessages.nav.label).toBe("Eval Dashboard");
    expect(shellMessages.nav).not.toHaveProperty("eval");
    expect(activeKeyFor("/eval")).toBe("eval");
    expect(activeKeyFor("/eval/ag1")).toBe("eval");
  });
});

describe("sidebar nav — CI Runs", () => {
  it("AC-81/AC-82: the GLOBAL section shows 'CI Runs' (no literal label), linking to /ci-runs, after Multi-Agent Review when it is there", () => {
    const global = NAV.find((g) => g.section === "GLOBAL")!;
    const keys = global.items.map((i) => i.key);
    const item = global.items.find((i) => i.key === "ci-runs")!;
    expect(item).toMatchObject({ href: "/ci-runs", icon: "Workflow" });
    expect(item.label).toBeUndefined();
    if (keys.includes("multi-agent")) expect(keys.indexOf("ci-runs")).toBeGreaterThan(keys.indexOf("multi-agent"));
    expect(NAV_LABEL_KEYS["ci-runs"]).toBe("ci.nav.label");
    expect(ciMessages.nav.label).toBe("CI Runs");
  });

  it("is active on /ci-runs and not on other routes", () => {
    expect(activeKeyFor("/ci-runs")).toBe("ci-runs");
    expect(activeKeyFor("/eval")).not.toBe("ci-runs");
    expect(activeKeyFor("/agents")).not.toBe("ci-runs");
  });
});

describe("sidebar nav — Agent Performance", () => {
  it("AC-1 / AC-2: the GLOBAL section shows 'Agent Performance' (no literal label), linking to /agent-performance, before CI Runs", () => {
    const global = NAV.find((g) => g.section === "GLOBAL")!;
    const keys = global.items.map((i) => i.key);
    const item = global.items.find((i) => i.key === "agent-performance")!;
    expect(item).toMatchObject({ href: "/agent-performance", icon: "Activity" });
    // NFR-5: the text is not a literal in the vendored nav; it resolves from the agentPerformance namespace.
    expect(item.label).toBeUndefined();
    expect(keys.indexOf("agent-performance")).toBeLessThan(keys.indexOf("ci-runs"));
    expect(NAV_LABEL_KEYS["agent-performance"]).toBe("agentPerformance.nav.label");
    expect(agentPerformanceMessages.nav.label).toBe("Agent Performance");
  });

  it("AC-3: is active on /agent-performance and not on other routes", () => {
    expect(activeKeyFor("/agent-performance")).toBe("agent-performance");
    expect(activeKeyFor("/agents")).not.toBe("agent-performance");
    expect(activeKeyFor("/ci-runs")).not.toBe("agent-performance");
  });
});
