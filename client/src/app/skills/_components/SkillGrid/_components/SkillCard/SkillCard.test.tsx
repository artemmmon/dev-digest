import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Skill } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";
import { SkillCard } from "./SkillCard";

const SKILL: Skill = {
  id: "s1",
  name: "branch-coverage",
  description: "Use when reviewing tests: flag branches.",
  type: "rubric",
  source: "manual",
  body: "b",
  enabled: true,
  version: 3,
  agent_count: 2,
};

function setup(over: Partial<React.ComponentProps<typeof SkillCard>> = {}, skill: Skill = SKILL) {
  const props = { active: false, onSelect: vi.fn(), onToggle: vi.fn(), onDelete: vi.fn(), ...over };
  renderWithIntl(
    <ul>
      <SkillCard skill={skill} {...props} />
    </ul>,
  );
  return props;
}

afterEach(cleanup);

describe("SkillCard", () => {
  it("shows name, type chip, description, version, agent count and the switch", () => {
    setup();
    expect(screen.getByRole("button", { name: "branch-coverage" })).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Use when reviewing tests: flag branches.")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Enable skill branch-coverage" })).toHaveAttribute("aria-checked", "true");
  });

  it("selects on a click on the name or on the card body", async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.click(screen.getByRole("button", { name: "branch-coverage" }));
    await user.click(screen.getByText("Use when reviewing tests: flag branches."));
    expect(p.onSelect).toHaveBeenCalledTimes(2);
  });

  it("flips the switch without selecting the card", async () => {
    const p = setup();
    await userEvent.setup().click(screen.getByRole("switch", { name: "Enable skill branch-coverage" }));
    expect(p.onToggle).toHaveBeenCalledWith(false);
    expect(p.onSelect).not.toHaveBeenCalled();
  });

  it("asks in a dialog, never window.confirm, and deletes only after confirming", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm");
    const p = setup();
    await user.click(screen.getByRole("button", { name: "Delete skill branch-coverage" }));
    expect(screen.getByRole("dialog")).toHaveTextContent('Delete skill "branch-coverage"?');
    expect(p.onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(p.onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(p.onSelect).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("keeps the skill when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.click(screen.getByRole("button", { name: "Delete skill branch-coverage" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(p.onDelete).not.toHaveBeenCalled();
  });

  it("does not select the card when the dialog is clicked", async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.click(screen.getByRole("button", { name: "Delete skill branch-coverage" }));
    await user.click(screen.getByText("Delete skill?"));
    expect(p.onSelect).not.toHaveBeenCalled();
  });
});
