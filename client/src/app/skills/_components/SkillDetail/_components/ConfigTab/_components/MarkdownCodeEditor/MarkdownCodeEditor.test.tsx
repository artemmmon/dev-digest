import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkdownCodeEditor } from "./MarkdownCodeEditor";
import { lineStyle } from "./helpers";

afterEach(cleanup);

describe("MarkdownCodeEditor", () => {
  it("numbers one row per line of the value", () => {
    render(<MarkdownCodeEditor value={"# Title\n\n- item"} onChange={() => {}} label="Body" />);
    // The numbers are aria-hidden, which getByText does not filter on.
    expect(screen.getAllByText(/^\d+$/).map((n) => n.textContent)).toEqual(["1", "2", "3"]);
  });

  it("shows the placeholder as the only line while empty", () => {
    render(<MarkdownCodeEditor value="" onChange={() => {}} label="Body" placeholder="# Rule" />);
    expect(screen.getAllByText(/^\d+$/)).toHaveLength(1);
    expect(screen.getByText("# Rule")).toBeInTheDocument();
  });

  it("reports what is typed into the text area", async () => {
    const onChange = vi.fn();
    render(<MarkdownCodeEditor value="" onChange={onChange} label="Body" />);
    await userEvent.setup().type(screen.getByRole("textbox", { name: "Body" }), "a");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("renders the value it is given", () => {
    render(<MarkdownCodeEditor value={"# Rule"} onChange={() => {}} label="Body" />);
    expect(screen.getByRole("textbox", { name: "Body" })).toHaveValue("# Rule");
    expect(screen.getByText("# Rule", { ignore: "textarea" })).toBeInTheDocument(); // the coloured line
  });
});

describe("lineStyle", () => {
  it("colours headings in the accent and list items dimmed", () => {
    expect(lineStyle("# H")).toMatchObject({ color: "var(--accent-text)", fontWeight: 600 });
    expect(lineStyle("- item")).toMatchObject({ color: "var(--text-secondary)" });
    expect(lineStyle("text")).toMatchObject({ color: "var(--text-primary)" });
  });
});
