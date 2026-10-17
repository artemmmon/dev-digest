import { describe, it, expect } from "vitest";
import { NAV, SHORTCUTS, resolveHref } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";
import { NAV_LABEL_KEYS } from "./constants";
import evalMessages from "../../../messages/en/eval.json";
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
    expect(NAV_LABEL_KEYS.eval).toBe("nav.label");
    expect(evalMessages.nav.label).toBe("Eval Dashboard");
    expect(shellMessages.nav).not.toHaveProperty("eval");
    expect(activeKeyFor("/eval")).toBe("eval");
    expect(activeKeyFor("/eval/ag1")).toBe("eval");
  });
});
