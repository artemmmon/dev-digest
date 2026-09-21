import { describe, it, expect } from "vitest";
import { NAV, SHORTCUTS, resolveHref } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

describe("sidebar nav — Conventions", () => {
  it("sits in SKILLS LAB after Agents, not in WORKSPACE", () => {
    const lab = NAV.find((g) => g.section === "SKILLS LAB")!;
    expect(lab.items.map((i) => i.key)).toEqual(["skills", "agents", "conventions"]);
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
