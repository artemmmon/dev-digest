import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Skill } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";

const h = vi.hoisted(() => ({
  create: vi.fn(),
  updateAsync: vi.fn(),
  del: vi.fn(),
  toggle: vi.fn(),
}));

vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: h.create, isPending: false }),
  useUpdateSkill: () => ({ mutateAsync: h.updateAsync, mutate: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: h.del, isPending: false }),
  useToggleSkill: () => ({ mutate: h.toggle, isPending: false }),
  useSkillAgents: () => ({ data: [{ id: "a1", name: "Test Quality Reviewer" }], isError: false, refetch: vi.fn() }),
  useSkillVersions: () => ({ data: [], isError: false, refetch: vi.fn() }),
}));

import { SkillDetail } from "./SkillDetail";

const SKILL: Skill = {
  id: "s1",
  name: "branch-coverage",
  description: "Use when reviewing tests: flag branches.",
  type: "rubric",
  source: "manual",
  body: "# Rule\n- one",
  enabled: true,
  version: 3,
  agent_count: 1,
  body_tokens: 42,
};

function setup(skill: Skill | null = SKILL, tab: "config" | "preview" | "stats" | "versions" = "config") {
  const props = { onTab: vi.fn(), onCreated: vi.fn(), onDeleted: vi.fn(), onDirtyChange: vi.fn() };
  renderWithIntl(<SkillDetail skill={skill} tab={tab} {...props} />);
  return props;
}

const body = () => screen.getByRole("textbox", { name: "Body (Markdown)" });
const save = () => screen.getByRole("button", { name: "Save" });

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset());
  h.updateAsync.mockResolvedValue({ ...SKILL, version: 4 });
});
afterEach(cleanup);

describe("SkillDetail", () => {
  it("shows the skill in the header and offers Config, Preview, Stats and Versions", () => {
    setup();
    expect(screen.getByRole("heading", { name: "branch-coverage" })).toBeInTheDocument();
    expect(screen.getAllByText("v3").length).toBeGreaterThan(0);
    for (const name of ["Config", "Preview", "Stats", "Versions"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Evals" })).not.toBeInTheDocument();
  });

  it("switches tabs through onTab", async () => {
    const p = setup();
    await userEvent.setup().click(screen.getByRole("button", { name: "Stats" }));
    expect(p.onTab).toHaveBeenCalledWith("stats");
  });

  it("offers only Config and Preview for a new draft", () => {
    setup(null);
    expect(screen.getByRole("heading", { name: "New skill" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stats" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Versions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete skill" })).not.toBeInTheDocument();
  });

  it("shows the server's token count for a saved body and an estimate once it is edited", async () => {
    setup();
    expect(screen.getByText("42 tokens")).toBeInTheDocument();
    await userEvent.setup().type(body(), "!");
    expect(screen.getByText(/^≈ \d+ tokens$/)).toBeInTheDocument();
  });

  it("keeps Save off until something changes, then shows the unsaved badge", async () => {
    const p = setup();
    expect(save()).toBeDisabled();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    await userEvent.setup().type(body(), "!");
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(save()).toBeEnabled();
    expect(p.onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it("saves only the changed fields, with no message when the body is untouched", async () => {
    const user = userEvent.setup();
    setup();
    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "branch-rubric");
    expect(screen.queryByRole("textbox", { name: "What changed? (optional)" })).not.toBeInTheDocument();
    await user.click(save());
    expect(h.updateAsync).toHaveBeenCalledWith({ id: "s1", patch: { name: "branch-rubric" } });
  });

  it("sends the change message along with a changed body", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(body(), " more");
    await user.type(screen.getByRole("textbox", { name: "What changed? (optional)" }), "Tightened the rule");
    await user.click(save());
    expect(h.updateAsync).toHaveBeenCalledWith({
      id: "s1",
      patch: { body: "# Rule\n- one more", message: "Tightened the rule" },
    });
  });

  it("discards the draft", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(body(), "!");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(body()).toHaveValue("# Rule\n- one");
    expect(save()).toBeDisabled();
  });

  it("keeps Save off while a required field is empty", async () => {
    const user = userEvent.setup();
    setup();
    await user.clear(screen.getByRole("textbox", { name: "Name" }));
    expect(save()).toBeDisabled();
  });

  it("creates a new skill from a draft and reports it", async () => {
    const user = userEvent.setup();
    const p = setup(null);
    await user.type(screen.getByRole("textbox", { name: "Name" }), "my-skill");
    await user.type(screen.getByRole("textbox", { name: "Description" }), "Use when X: do Y.");
    await user.type(body(), "# Rule");
    await user.click(save());
    expect(h.create).toHaveBeenCalledWith(
      { name: "my-skill", description: "Use when X: do Y.", type: "rubric", body: "# Rule" },
      expect.anything(),
    );
    const created = { ...SKILL, id: "new1", name: "my-skill" };
    h.create.mock.calls[0]![1].onSuccess(created);
    expect(p.onCreated).toHaveBeenCalledWith(created);
  });

  it("switches the skill on or off globally from Config", async () => {
    setup();
    await userEvent.setup().click(screen.getByRole("switch", { name: "Enabled" }));
    expect(h.toggle).toHaveBeenCalledWith({ id: "s1", enabled: false });
  });

  it("previews the unsaved body as rendered markdown", () => {
    setup({ ...SKILL, body: "# Heading\n\n**bold**" }, "preview");
    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(screen.getByText("Rendered as the reviewing agent receives it.")).toBeInTheDocument();
  });

  it("asks before deleting and only then deletes", async () => {
    const user = userEvent.setup();
    const p = setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Delete skill" }));
    expect(h.del).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete skill" }));
    expect(h.del).toHaveBeenCalledWith("s1", expect.anything());
    h.del.mock.calls[0]![1].onSuccess();
    expect(p.onDeleted).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("warns about a skill someone else wrote", () => {
    setup({ ...SKILL, source: "imported_file" });
    expect(screen.getByRole("note")).toHaveTextContent(/written by someone else/);
  });

  it("tells the author to write the description as a directive", () => {
    setup();
    expect(screen.getByText(/write it as a directive/i)).toBeInTheDocument();
  });
});
