import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Skill } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";
import { SkillPreviewDrawer } from "./SkillPreviewDrawer";

const SKILL: Skill = {
  id: "s1",
  name: "branch-coverage",
  description: "Use when reviewing tests: flag branches.",
  type: "security",
  source: "imported_file",
  body: "## Rule\n\n- **flag** every branch\n\n`code`",
  enabled: true,
  version: 4,
  agent_count: 3,
};

afterEach(cleanup);

describe("SkillPreviewDrawer", () => {
  it("shows the skill's type, version, source and agent count", () => {
    renderWithIntl(<SkillPreviewDrawer skill={SKILL} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("branch-coverage")).toBeInTheDocument();
    expect(within(dialog).getByText("security")).toBeInTheDocument();
    expect(within(dialog).getByText("v4")).toBeInTheDocument();
    expect(within(dialog).getByText("Imported file")).toBeInTheDocument();
    expect(within(dialog).getByText("3 agents")).toBeInTheDocument();
  });

  it("renders the body as markdown, not as source text", () => {
    renderWithIntl(<SkillPreviewDrawer skill={SKILL} onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Rule" })).toBeInTheDocument();
    expect(screen.getByText("flag").tagName).toBe("STRONG");
    expect(screen.queryByText(/\*\*flag\*\*/)).not.toBeInTheDocument();
  });

  it("links to the skill's full page", () => {
    renderWithIntl(<SkillPreviewDrawer skill={SKILL} onClose={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Open skill branch-coverage" })).toHaveAttribute("href", "/skills/s1");
  });

  it("closes from the X and Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithIntl(<SkillPreviewDrawer skill={SKILL} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
