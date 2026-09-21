import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Skill } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";
import { SkillList } from "./SkillList";
import { filterSkills } from "./helpers";

const mk = (name: string, over: Partial<Skill> = {}): Skill => ({
  id: name,
  name,
  description: `Use when ${name}.`,
  type: "rubric",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
  ...over,
});

const SKILLS = [mk("branch-coverage"), mk("mocking-discipline", { enabled: false, type: "convention" })];

function setup(over: Partial<React.ComponentProps<typeof SkillList>> = {}) {
  const props = {
    skills: SKILLS,
    selectedId: null as string | null,
    onSelect: vi.fn(),
    onToggle: vi.fn(),
    onCreate: vi.fn(),
    onImport: vi.fn(),
    ...over,
  };
  renderWithIntl(<SkillList {...props} />);
  return props;
}

afterEach(cleanup);

describe("SkillList", () => {
  it("renders a row per skill with its type and switch", () => {
    setup();
    expect(screen.getByRole("button", { name: "branch-coverage" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "mocking-discipline" })).toBeInTheDocument();
    expect(screen.getByText("convention")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Enable skill mocking-discipline" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("shows how many agents use each skill", () => {
    setup({ skills: [mk("one", { agent_count: 1 }), mk("many", { agent_count: 3 }), mk("unknown")] });
    expect(screen.getByText("1 agent")).toBeInTheDocument();
    expect(screen.getByText("3 agents")).toBeInTheDocument();
  });

  it("marks the selected row", () => {
    setup({ selectedId: "branch-coverage" });
    expect(screen.getByRole("button", { name: "branch-coverage" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "mocking-discipline" })).not.toHaveAttribute("aria-current");
  });

  it("selects a row by its name", async () => {
    const p = setup();
    await userEvent.setup().click(screen.getByRole("button", { name: "branch-coverage" }));
    expect(p.onSelect).toHaveBeenCalledWith("branch-coverage");
  });

  it("toggles a skill without selecting it", async () => {
    const p = setup();
    await userEvent.setup().click(screen.getByRole("switch", { name: "Enable skill mocking-discipline" }));
    expect(p.onToggle).toHaveBeenCalledWith("mocking-discipline", true);
    expect(p.onSelect).not.toHaveBeenCalled();
  });

  it("filters by search text and says when nothing matches", async () => {
    const user = userEvent.setup();
    setup();
    const search = screen.getByRole("textbox", { name: "Search skills…" });
    await user.type(search, "mocking");
    expect(screen.queryByText("branch-coverage")).not.toBeInTheDocument();
    expect(screen.getByText("mocking-discipline")).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "zzz");
    expect(screen.getByText("No skills match “zzz”.")).toBeInTheDocument();
  });

  it("offers import and create-from-scratch in the Add menu", async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.click(screen.getByRole("button", { name: /Add Skill/ }));
    await user.click(await screen.findByText("Import from file"));
    expect(p.onImport).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /Add Skill/ }));
    await user.click(await screen.findByText("Create from scratch"));
    expect(p.onCreate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Import from URL")).not.toBeInTheDocument();
  });
});

describe("filterSkills", () => {
  it("matches name, description and type, ignoring case", () => {
    const list = [mk("alpha"), mk("beta", { type: "security" })];
    expect(filterSkills(list, "")).toHaveLength(2);
    expect(filterSkills(list, "ALP").map((s) => s.name)).toEqual(["alpha"]);
    expect(filterSkills(list, "security").map((s) => s.name)).toEqual(["beta"]);
  });
});
