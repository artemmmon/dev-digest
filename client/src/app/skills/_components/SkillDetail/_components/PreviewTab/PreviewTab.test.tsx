import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithIntl } from "@/test/render";
import { PreviewTab } from "./PreviewTab";

afterEach(cleanup);

describe("PreviewTab", () => {
  it("renders the body as markdown", () => {
    renderWithIntl(<PreviewTab body={"# Rule title\n\nKeep functions small."} />);
    expect(screen.getByRole("heading", { name: "Rule title" })).toBeInTheDocument();
    expect(screen.getByText("Keep functions small.")).toBeInTheDocument();
  });

  it("shows the placeholder while the body is blank", () => {
    renderWithIntl(<PreviewTab body={"  \n "} />);
    expect(screen.getByText("Nothing to preview yet.")).toBeInTheDocument();
  });
});
