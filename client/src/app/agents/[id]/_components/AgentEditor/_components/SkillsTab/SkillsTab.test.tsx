import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { screen, cleanup, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";
import { countActive, moveBinding, moveBindingTo, orderedBindings, setBindingEnabled, toBindings } from "./helpers";

const mk = (id: string, over: Partial<Skill> = {}): Skill => ({
  id,
  name: `skill-${id}`,
  description: `Use when ${id}.`,
  type: "rubric",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
  ...over,
});

const h = vi.hoisted(() => ({
  skills: [] as Skill[],
  links: [] as AgentSkillLink[],
  mutate: vi.fn(),
  pending: false,
}));

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: h.skills, isError: false, refetch: vi.fn() }),
  useAgentSkills: () => ({ data: h.links, isError: false, refetch: vi.fn() }),
  useSetAgentSkills: () => ({ mutate: h.mutate, isPending: h.pending }),
}));

import { SkillsTab } from "./SkillsTab";

const AGENT = { id: "ag1", name: "Test Quality Reviewer" } as Agent;
const link = (skill_id: string, order: number, enabled = true): AgentSkillLink => ({
  agent_id: "ag1",
  skill_id,
  order,
  enabled,
});

beforeEach(() => {
  h.skills = [mk("a"), mk("b"), mk("c"), mk("d", { enabled: false })];
  h.links = [link("b", 0), link("a", 1), link("d", 2, false)];
  h.mutate.mockReset();
  h.pending = false;
});

// userEvent has no drag-and-drop support, so the native DnD events are fired directly.
function drag(fromId: string, toId: string) {
  const from = screen.getByTestId(`skill-row-${fromId}`);
  const to = screen.getByTestId(`skill-row-${toId}`);
  fireEvent.dragStart(from);
  fireEvent.dragOver(to);
  fireEvent.drop(to);
  fireEvent.dragEnd(from);
}
afterEach(cleanup);

const sw = (name: string) => screen.getByRole("switch", { name: `Use ${name} in this agent` });

describe("SkillsTab", () => {
  it("lists every skill once, the enabled ones first in prompt order", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows[0]).toContain("skill-b");
    expect(rows[1]).toContain("skill-a");
    expect(rows[2]).toContain("skill-d"); // bound but off
    expect(rows[3]).toContain("skill-c"); // never bound: last, off
    expect(rows).toHaveLength(4);
    expect(screen.getByText("2 of 4 enabled")).toBeInTheDocument();
    expect(screen.getByText(/earlier skills appear earlier/)).toBeInTheDocument();
  });

  it("puts enabled rows before disabled ones even when the saved order interleaves them", () => {
    h.links = [link("d", 0, false), link("a", 1), link("c", 2, false), link("b", 3)];
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(rows.map((r) => r.match(/skill-[a-d]/)![0])).toEqual(["skill-a", "skill-b", "skill-d", "skill-c"]);
  });

  it("shows a switch per row: on for the agent's skills, off for the others", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(sw("skill-b")).toHaveAttribute("aria-checked", "true");
    expect(sw("skill-d")).toHaveAttribute("aria-checked", "false");
    expect(sw("skill-c")).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("marks a globally disabled skill", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const row = screen.getByText("skill-d").closest("li")!;
    expect(within(row).getByText("disabled globally")).toBeInTheDocument();
  });

  it("switching a row off moves it to the start of the disabled block", async () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    await userEvent.setup().click(sw("skill-b"));
    expect(h.mutate).toHaveBeenCalledWith([
      { skill_id: "a", enabled: true },
      { skill_id: "b", enabled: false },
      { skill_id: "d", enabled: false },
      { skill_id: "c", enabled: false },
    ]);
  });

  it("switching a row on moves it to the end of the enabled block", async () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    await userEvent.setup().click(sw("skill-c"));
    expect(h.mutate).toHaveBeenCalledWith([
      { skill_id: "b", enabled: true },
      { skill_id: "a", enabled: true },
      { skill_id: "c", enabled: true },
      { skill_id: "d", enabled: false },
    ]);
  });

  it("drags an enabled skill over another and sends the new order", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    drag("a", "b"); // second → first
    expect(h.mutate).toHaveBeenCalledWith([
      { skill_id: "a", enabled: true },
      { skill_id: "b", enabled: true },
      { skill_id: "d", enabled: false },
      { skill_id: "c", enabled: false },
    ]);
  });

  it("does not save when a skill is dropped on itself", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    drag("a", "a");
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("makes disabled rows undraggable and gives them no keyboard grip", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByTestId("skill-row-b")).toHaveAttribute("draggable", "true");
    expect(screen.getByTestId("skill-row-d")).toHaveAttribute("draggable", "false"); // bound but off
    expect(screen.getByTestId("skill-row-c")).toHaveAttribute("draggable", "false"); // never bound
    expect(screen.queryByRole("button", { name: "Move skill-d" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move skill-c" })).not.toBeInTheDocument();
  });

  it("ignores a drag that starts on, or drops onto, a disabled row", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    drag("d", "b"); // from a disabled row
    drag("b", "d"); // onto a disabled row
    drag("a", "c"); // onto a never-bound row
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("does not show a drop line over a disabled row while dragging", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    fireEvent.dragStart(screen.getByTestId("skill-row-b"));
    fireEvent.dragOver(screen.getByTestId("skill-row-d"));
    expect(screen.getByTestId("skill-row-d").style.boxShadow).toBe("");
    fireEvent.dragOver(screen.getByTestId("skill-row-a"));
    expect(screen.getByTestId("skill-row-a").style.boxShadow).not.toBe("");
  });

  it("moves an enabled row with ArrowDown / ArrowUp on its grip, inside the enabled block", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SkillsTab agent={AGENT} />);
    screen.getByRole("button", { name: "Move skill-b" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(h.mutate).toHaveBeenLastCalledWith([
      { skill_id: "a", enabled: true },
      { skill_id: "b", enabled: true },
      { skill_id: "d", enabled: false },
      { skill_id: "c", enabled: false },
    ]);
    h.mutate.mockClear();

    // a is the last enabled row: it cannot move down into the disabled block
    screen.getByRole("button", { name: "Move skill-a" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("ignores an arrow key that would move a row off the top of the enabled block", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SkillsTab agent={AGENT} />);
    screen.getByRole("button", { name: "Move skill-b" }).focus();
    await user.keyboard("{ArrowUp}");
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("keeps the true prompt position when the filter hides rows", async () => {
    h.skills = [mk("a", { description: "visible" }), mk("b"), mk("c", { description: "visible" }), mk("d")];
    h.links = [link("b", 0), link("a", 1), link("c", 2), link("d", 3, false)];
    renderWithIntl(<SkillsTab agent={AGENT} />);
    await userEvent.setup().type(screen.getByRole("textbox", { name: "Filter skills…" }), "visible");
    expect(screen.queryByTestId("skill-row-b")).not.toBeInTheDocument();
    // a is first in the visible rows but second in the prompt; c lands in a's real place
    drag("c", "a");
    expect(h.mutate).toHaveBeenCalledWith([
      { skill_id: "b", enabled: true },
      { skill_id: "c", enabled: true },
      { skill_id: "a", enabled: true },
      { skill_id: "d", enabled: false },
    ]);
  });

  it("says so when the filter matches nothing", async () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    await userEvent.setup().type(screen.getByRole("textbox", { name: "Filter skills…" }), "zzz");
    expect(screen.getByText("No skills match “zzz”.")).toBeInTheDocument();
  });

  it("does not let rows be dragged, moved or switched while a save is running", async () => {
    h.pending = true;
    const user = userEvent.setup();
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByTestId("skill-row-b")).toHaveAttribute("draggable", "false");
    screen.getByRole("button", { name: "Move skill-b" }).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(sw("skill-c"));
    expect(h.mutate).not.toHaveBeenCalled();
  });
});

describe("binding helpers", () => {
  const b = (id: string, enabled = true) => ({ skill_id: id, enabled });

  it("toBindings sorts by order", () => {
    expect(toBindings([link("x", 2), link("y", 0)]).map((x) => x.skill_id)).toEqual(["y", "x"]);
  });
  it("orderedBindings puts enabled bindings first, then disabled ones, then unbound skills, and drops dead links", () => {
    const skills = [mk("a"), mk("b"), mk("c"), mk("e")];
    const links = [link("a", 0, false), link("gone", 1), link("b", 2), link("e", 3)];
    expect(orderedBindings(links, skills)).toEqual([b("b"), b("e"), b("a", false), b("c", false)]);
  });
  it("moveBinding swaps enabled neighbours and never crosses into the disabled block or off either end", () => {
    const list = [b("a"), b("b"), b("c"), b("x", false)];
    expect(moveBinding(list, 0, 1).map((x) => x.skill_id)).toEqual(["b", "a", "c", "x"]);
    expect(moveBinding(list, 2, -1).map((x) => x.skill_id)).toEqual(["a", "c", "b", "x"]);
    expect(moveBinding(list, 0, -1)).toBe(list);
    expect(moveBinding(list, 2, 1)).toBe(list); // next row is disabled
    expect(moveBinding(list, 3, -1)).toBe(list); // a disabled row does not move
  });
  it("moveBindingTo moves within the enabled block and returns the same array on any other move", () => {
    const list = [b("a"), b("b"), b("c"), b("d"), b("x", false), b("y", false)];
    expect(moveBindingTo(list, 3, 0).map((x) => x.skill_id)).toEqual(["d", "a", "b", "c", "x", "y"]);
    expect(moveBindingTo(list, 0, 2).map((x) => x.skill_id)).toEqual(["b", "c", "a", "d", "x", "y"]);
    expect(moveBindingTo(list, 1, 1)).toBe(list);
    expect(moveBindingTo(list, -1, 2)).toBe(list);
    expect(moveBindingTo(list, 0, 6)).toBe(list);
    expect(moveBindingTo(list, 0, 4)).toBe(list); // onto a disabled row
    expect(moveBindingTo(list, 4, 0)).toBe(list); // from a disabled row
    expect(moveBindingTo(list, 4, 5)).toBe(list); // between disabled rows
    expect(list.map((x) => x.skill_id)).toEqual(["a", "b", "c", "d", "x", "y"]); // input untouched
  });
  it("setBindingEnabled sends a row off to the start of the disabled block and on to the end of the enabled one", () => {
    const list = [b("a"), b("b"), b("c"), b("x", false), b("y", false)];
    expect(setBindingEnabled(list, "a", false).map((x) => `${x.skill_id}${x.enabled ? "+" : "-"}`)).toEqual([
      "b+", "c+", "a-", "x-", "y-",
    ]);
    expect(setBindingEnabled(list, "y", true).map((x) => `${x.skill_id}${x.enabled ? "+" : "-"}`)).toEqual([
      "a+", "b+", "c+", "y+", "x-",
    ]);
    expect(setBindingEnabled(list, "a", true)).toBe(list); // already on
    expect(setBindingEnabled(list, "nope", true)).toBe(list);
  });
  it("countActive needs the binding AND the skill on", () => {
    const skills = [mk("a"), mk("b", { enabled: false }), mk("c")];
    expect(countActive([b("a"), b("b"), b("c", false)], skills)).toBe(1);
  });
});
