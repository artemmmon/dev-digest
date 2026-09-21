import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test/render";
import { SkillForm } from "./SkillForm";
import { EMPTY_DRAFT, changedFields, isDraftValid } from "../helpers";

afterEach(cleanup);

describe("SkillForm", () => {
  it("tells the author to write the description as a directive", () => {
    renderWithIntl(<SkillForm initial={EMPTY_DRAFT} submitLabel="Create skill" onSubmit={() => {}} />);
    expect(screen.getByText(/write it as a directive/i)).toBeInTheDocument();
  });

  it("cannot be submitted until name, description and body have text", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithIntl(<SkillForm initial={EMPTY_DRAFT} submitLabel="Create skill" onSubmit={onSubmit} />);
    const submit = screen.getByRole("button", { name: "Create skill" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "Name" }), "my-skill");
    await user.type(screen.getByPlaceholderText(/Use when reviewing/), "Use when X: do Y.");
    expect(submit).toBeDisabled();
    await user.type(screen.getByPlaceholderText(/Describe how to apply/), "# Rule");
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({
      name: "my-skill",
      description: "Use when X: do Y.",
      type: "rubric",
      body: "# Rule",
    });
  });

  it("previews the body as rendered markdown", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <SkillForm
        initial={{ name: "n", description: "d", type: "custom", body: "# Heading\n\n**bold**" }}
        submitLabel="Save skill"
        onSubmit={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Describe how to apply/)).not.toBeInTheDocument();
  });
});

describe("skill draft helpers", () => {
  const base = { name: "a", description: "b", type: "rubric" as const, body: "c" };
  it("changedFields keeps only what differs", () => {
    expect(changedFields(base, { ...base })).toEqual({});
    expect(changedFields(base, { ...base, body: "d", type: "custom" })).toEqual({ body: "d", type: "custom" });
  });
  it("isDraftValid ignores whitespace-only fields", () => {
    expect(isDraftValid({ ...base, name: "  " })).toBe(false);
    expect(isDraftValid(base)).toBe(true);
  });
});
