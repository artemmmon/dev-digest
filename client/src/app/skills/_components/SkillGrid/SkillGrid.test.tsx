import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Skill } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";
import { SkillGrid } from "./SkillGrid";
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

function setup(over: Partial<React.ComponentProps<typeof SkillGrid>> = {}) {
  const props = {
    skills: SKILLS,
    selectedId: null as string | null,
    onSelect: vi.fn(),
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    onCreate: vi.fn(),
    onImport: vi.fn(),
    ...over,
  };
  renderWithIntl(<SkillGrid {...props} />);
  return props;
}

afterEach(cleanup);

describe("SkillGrid", () => {
  it("renders a card per skill with its type, version and switch", () => {
    setup({ skills: [mk("branch-coverage", { version: 4 }), SKILLS[1]!] });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "branch-coverage" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "mocking-discipline" })).toBeInTheDocument();
    expect(screen.getByText("convention")).toBeInTheDocument();
    expect(screen.getByText("v4")).toBeInTheDocument();
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

  it("marks the card whose preview is open", () => {
    setup({ selectedId: "branch-coverage" });
    expect(screen.getByRole("button", { name: "branch-coverage" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "mocking-discipline" })).not.toHaveAttribute("aria-current");
  });

  it("selects a card by its name", async () => {
    const p = setup();
    await userEvent.setup().click(screen.getByRole("button", { name: "branch-coverage" }));
    expect(p.onSelect).toHaveBeenCalledWith("branch-coverage");
  });

  it("toggles a skill and deletes one (after confirming) without selecting it", async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.click(screen.getByRole("switch", { name: "Enable skill mocking-discipline" }));
    expect(p.onToggle).toHaveBeenCalledWith("mocking-discipline", true);
    await user.click(screen.getByRole("button", { name: "Delete skill branch-coverage" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(p.onDelete).toHaveBeenCalledWith("branch-coverage");
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
    // Announced through a live region that stays mounted, so screen readers pick the change up.
    const message = screen.getByText("No skills match “zzz”.");
    expect(message).toHaveAttribute("role", "status");
    expect(message).toHaveAttribute("aria-live", "polite");
    await user.clear(search);
    expect(screen.queryByText(/No skills match/)).not.toBeInTheDocument();
  });

  it("offers exactly Create and Import in the Add menu", async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.click(screen.getByRole("button", { name: /Add/ }));
    expect(await screen.findByText("Create")).toBeInTheDocument();
    expect(screen.getByText("Import")).toBeInTheDocument();
    await user.click(screen.getByText("Import"));
    expect(p.onImport).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /Add/ }));
    await user.click(await screen.findByText("Create"));
    expect(p.onCreate).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state that starts a new skill", async () => {
    const p = setup({ skills: [] });
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Create a skill" }));
    expect(p.onCreate).toHaveBeenCalledTimes(1);
  });

  it("shows placeholders while loading", () => {
    setup({ skills: [], loading: true });
    expect(screen.queryByText("No skills yet")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
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
