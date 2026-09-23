import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test/render";
import { ConfirmDialog } from "./ConfirmDialog";

afterEach(cleanup);

function setup(over: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const props = { title: "Delete it?", onConfirm: vi.fn(), onCancel: vi.fn(), ...over };
  renderWithIntl(<ConfirmDialog {...props} />);
  return props;
}

describe("ConfirmDialog", () => {
  it("shows the title and body with default Confirm / Cancel labels", () => {
    setup({ body: "This cannot be undone." });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Delete it?")).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("uses custom labels", () => {
    setup({ confirmLabel: "Delete", cancelLabel: "Keep" });
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep" })).toBeInTheDocument();
  });

  it("confirms only through the confirm button", async () => {
    const p = setup();
    await userEvent.setup().click(screen.getByRole("button", { name: "Confirm" }));
    expect(p.onConfirm).toHaveBeenCalledTimes(1);
    expect(p.onCancel).not.toHaveBeenCalled();
  });

  it("cancels from the Cancel button, the X and Escape", async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.keyboard("{Escape}");
    expect(p.onCancel).toHaveBeenCalledTimes(3);
    expect(p.onConfirm).not.toHaveBeenCalled();
  });

  it("locks everything while the confirmed action runs", async () => {
    const user = userEvent.setup();
    const p = setup({ pending: true });
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.keyboard("{Escape}");
    expect(p.onCancel).not.toHaveBeenCalled();
  });
});
