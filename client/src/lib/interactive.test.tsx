import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { rowClickProps } from "./interactive";

/** rowClickProps only widens the mouse target: controls inside the row keep their own clicks. */

afterEach(cleanup);

function Row({ onRow, onLink, onButton }: { onRow: () => void; onLink: () => void; onButton: () => void }) {
  return (
    <div data-testid="row" {...rowClickProps(onRow)}>
      <span>plain text</span>
      <a href="#x" onClick={(e) => { e.preventDefault(); onLink(); }}>link</a>
      <button type="button" onClick={onButton}>button <b>bold</b></button>
      <div data-row-ignore>popover</div>
    </div>
  );
}

describe("rowClickProps", () => {
  it("activates on a click on the row itself or its plain content", async () => {
    const onRow = vi.fn();
    const user = userEvent.setup();
    render(<Row onRow={onRow} onLink={vi.fn()} onButton={vi.fn()} />);
    await user.click(screen.getByTestId("row"));
    await user.click(screen.getByText("plain text"));
    expect(onRow).toHaveBeenCalledTimes(2);
  });

  it("leaves clicks on a link, a button (and its children) and data-row-ignore areas to them", async () => {
    const onRow = vi.fn();
    const onLink = vi.fn();
    const onButton = vi.fn();
    const user = userEvent.setup();
    render(<Row onRow={onRow} onLink={onLink} onButton={onButton} />);
    await user.click(screen.getByText("link"));
    await user.click(screen.getByText("bold"));
    await user.click(screen.getByText("popover"));
    expect(onLink).toHaveBeenCalledTimes(1);
    expect(onButton).toHaveBeenCalledTimes(1);
    expect(onRow).not.toHaveBeenCalled();
  });

  it("marks the container presentational, so the real control inside is the accessible one", () => {
    render(<Row onRow={vi.fn()} onLink={vi.fn()} onButton={vi.fn()} />);
    expect(screen.getByTestId("row")).toHaveAttribute("role", "presentation");
  });
});
