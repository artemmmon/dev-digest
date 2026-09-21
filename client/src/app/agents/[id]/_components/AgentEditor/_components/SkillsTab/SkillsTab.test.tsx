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

describe("SkillsTab", () => {
  it("lists every skill once, the bound ones first in prompt order", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows[0]).toContain("skill-b");
    expect(rows[1]).toContain("skill-a");
    expect(rows[2]).toContain("skill-d");
    expect(rows[3]).toContain("skill-c"); // never bound: last, unchecked
    expect(rows).toHaveLength(4);
    expect(screen.getByText("2 of 4 enabled")).toBeInTheDocument();
    expect(screen.getByText(/earlier skills appear earlier/)).toBeInTheDocument();
    expect(screen.queryByText("Bound to this agent")).not.toBeInTheDocument();
  });

  it("checks the rows the agent uses and leaves the others unchecked", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByRole("checkbox", { name: "skill-b" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: "skill-d" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("checkbox", { name: "skill-c" })).toHaveAttribute("aria-checked", "false");
  });

  it("marks a globally disabled skill", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const row = screen.getByText("skill-d").closest("li")!;
    expect(within(row).getByText("disabled globally")).toBeInTheDocument();
  });

  it("unchecking sends the whole list with that row off and the order untouched", async () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    await userEvent.setup().click(screen.getByRole("checkbox", { name: "skill-b" }));
    expect(h.mutate).toHaveBeenCalledWith([
      { skill_id: "b", enabled: false },
      { skill_id: "a", enabled: true },
      { skill_id: "d", enabled: false },
      { skill_id: "c", enabled: false },
    ]);
  });

  it("checking a never-bound skill keeps its place at the end", async () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    await userEvent.setup().click(screen.getByRole("checkbox", { name: "skill-c" }));
    expect(h.mutate).toHaveBeenCalledWith([
      { skill_id: "b", enabled: true },
      { skill_id: "a", enabled: true },
      { skill_id: "d", enabled: false },
      { skill_id: "c", enabled: true },
    ]);
  });

  it("drags a skill over the whole list and sends the new order", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    drag("d", "b"); // third → first
    expect(h.mutate).toHaveBeenCalledWith([
      { skill_id: "d", enabled: false },
      { skill_id: "b", enabled: true },
      { skill_id: "a", enabled: true },
      { skill_id: "c", enabled: false },
    ]);
  });

  it("drags downwards, onto a never-bound row too", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    drag("b", "c"); // first → last
    expect(h.mutate).toHaveBeenCalledWith([
      { skill_id: "a", enabled: true },
      { skill_id: "d", enabled: false },
      { skill_id: "c", enabled: false },
      { skill_id: "b", enabled: true },
    ]);
  });

  it("does not save when a skill is dropped on itself", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    drag("a", "a");
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("moves a row with ArrowDown / ArrowUp on its grip", async () => {
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

    screen.getByRole("button", { name: "Move skill-d" }).focus();
    await user.keyboard("{ArrowUp}");
    expect(h.mutate).toHaveBeenLastCalledWith([
      { skill_id: "b", enabled: true },
      { skill_id: "d", enabled: false },
      { skill_id: "a", enabled: true },
      { skill_id: "c", enabled: false },
    ]);
  });

  it("ignores an arrow key that would move a row off either end", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SkillsTab agent={AGENT} />);
    screen.getByRole("button", { name: "Move skill-b" }).focus();
    await user.keyboard("{ArrowUp}");
    screen.getByRole("button", { name: "Move skill-c" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("keeps the true prompt position when the filter hides rows", async () => {
    h.skills = [mk("a", { description: "visible" }), mk("b"), mk("c"), mk("d", { enabled: false, description: "visible" })];
    renderWithIntl(<SkillsTab agent={AGENT} />);
    await userEvent.setup().type(screen.getByRole("textbox", { name: "Filter skills…" }), "visible");
    expect(screen.queryByTestId("skill-row-b")).not.toBeInTheDocument();
    // a is first in the visible rows but second in the prompt; d lands in a's real place
    drag("d", "a");
    expect(h.mutate).toHaveBeenCalledWith([
      { skill_id: "b", enabled: true },
      { skill_id: "d", enabled: false },
      { skill_id: "a", enabled: true },
      { skill_id: "c", enabled: false },
    ]);
  });

  it("says so when the filter matches nothing", async () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    await userEvent.setup().type(screen.getByRole("textbox", { name: "Filter skills…" }), "zzz");
    expect(screen.getByText("No skills match “zzz”.")).toBeInTheDocument();
  });

  it("does not let rows be dragged or moved while a save is running", async () => {
    h.pending = true;
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByTestId("skill-row-b")).toHaveAttribute("draggable", "false");
    screen.getByRole("button", { name: "Move skill-b" }).focus();
    await userEvent.setup().keyboard("{ArrowDown}");
    expect(h.mutate).not.toHaveBeenCalled();
  });
});

describe("binding helpers", () => {
  const b = (id: string, enabled = true) => ({ skill_id: id, enabled });

  it("toBindings sorts by order", () => {
    expect(toBindings([link("x", 2), link("y", 0)]).map((x) => x.skill_id)).toEqual(["y", "x"]);
  });
  it("orderedBindings puts bound skills first, then unbound ones unchecked, and drops dead links", () => {
    const skills = [mk("a"), mk("b"), mk("c")];
    const links = [link("b", 0), link("gone", 1), link("a", 2, false)];
    expect(orderedBindings(links, skills)).toEqual([b("b"), b("a", false), b("c", false)]);
  });
  it("moveBinding swaps neighbours and ignores moves off either end", () => {
    const list = [b("a"), b("b"), b("c")];
    expect(moveBinding(list, 0, 1).map((x) => x.skill_id)).toEqual(["b", "a", "c"]);
    expect(moveBinding(list, 2, -1).map((x) => x.skill_id)).toEqual(["a", "c", "b"]);
    expect(moveBinding(list, 0, -1)).toBe(list);
    expect(moveBinding(list, 2, 1)).toBe(list);
  });
  it("moveBindingTo moves to any position and returns the same array on a no-op", () => {
    const list = [b("a"), b("b"), b("c"), b("d")];
    expect(moveBindingTo(list, 3, 0).map((x) => x.skill_id)).toEqual(["d", "a", "b", "c"]);
    expect(moveBindingTo(list, 0, 2).map((x) => x.skill_id)).toEqual(["b", "c", "a", "d"]);
    expect(moveBindingTo(list, 1, 1)).toBe(list);
    expect(moveBindingTo(list, -1, 2)).toBe(list);
    expect(moveBindingTo(list, 0, 4)).toBe(list);
    expect(list.map((x) => x.skill_id)).toEqual(["a", "b", "c", "d"]); // input untouched
  });
  it("setBindingEnabled flips one binding", () => {
    expect(setBindingEnabled([b("a"), b("z")], "a", false)).toEqual([b("a", false), b("z")]);
  });
  it("countActive needs the binding AND the skill on", () => {
    const skills = [mk("a"), mk("b", { enabled: false }), mk("c")];
    expect(countActive([b("a"), b("b"), b("c", false)], skills)).toBe(1);
  });
});
