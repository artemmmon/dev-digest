import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Skill } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";

const h = vi.hoisted(() => ({ create: vi.fn(), pending: false }));
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: h.create, isPending: h.pending }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

const CREATED = { id: "new1", name: "my-skill" } as Skill;

function setup() {
  const props = { onClose: vi.fn(), onCreated: vi.fn() };
  renderWithIntl(<CreateSkillModal {...props} />);
  return props;
}

const fill = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByRole("textbox", { name: "Name" }), "my-skill");
  await user.type(screen.getByPlaceholderText(/Use when reviewing/), "Use when X: do Y.");
  await user.type(screen.getByPlaceholderText(/Describe how to apply/), "# Rule");
};

beforeEach(() => {
  h.create.mockReset();
  h.pending = false;
});
afterEach(cleanup);

describe("CreateSkillModal", () => {
  it("has name, description, type and a markdown body", () => {
    setup();
    expect(screen.getByRole("dialog")).toHaveTextContent("Create a skill");
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Use when reviewing/)).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Describe how to apply/)).toBeInTheDocument();
  });

  it("keeps Create off until name, description and body are filled", async () => {
    const user = userEvent.setup();
    setup();
    const submit = screen.getByRole("button", { name: "Create skill" });
    expect(submit).toBeDisabled();
    await fill(user);
    expect(submit).toBeEnabled();
  });

  it("creates the skill from the form and reports it", async () => {
    const user = userEvent.setup();
    const p = setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Create skill" }));
    expect(h.create).toHaveBeenCalledWith(
      { name: "my-skill", description: "Use when X: do Y.", type: "rubric", body: "# Rule", applies_to: null },
      expect.anything(),
    );
    act(() => h.create.mock.calls[0]![1].onSuccess(CREATED));
    expect(p.onCreated).toHaveBeenCalledWith(CREATED);
  });

  it("closes from Cancel and from the X without saving", async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(p.onClose).toHaveBeenCalledTimes(2);
    expect(h.create).not.toHaveBeenCalled();
  });
});
