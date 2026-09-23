import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PrFile } from "@/lib/types";
import { renderWithIntl } from "@/test/render";
import { FileCard } from "./FileCard";

afterEach(cleanup);

function prFile(overrides: Partial<PrFile>): PrFile {
  return {
    path: "src/config.ts",
    additions: 1,
    deletions: 0,
    patch: "@@ -1,1 +1,2 @@\n context\n+// change",
    ...overrides,
  };
}

describe("FileCard", () => {
  it("shows a language chip for a recognised file and expands by default", () => {
    renderWithIntl(<FileCard file={prFile({ path: "src/config.ts" })} />);
    expect(screen.getByText("ts")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });

  it("marks a generated Dart file as `dart · gen` and starts it collapsed", () => {
    renderWithIntl(<FileCard file={prFile({ path: "lib/models/user.g.dart" })} />);
    expect(screen.getByText("dart · gen")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("shows no chip for an unrecognised path", () => {
    renderWithIntl(<FileCard file={prFile({ path: "LICENSE" })} />);
    expect(screen.queryByText("ts")).not.toBeInTheDocument();
  });

  it("still opens a collapsed generated file on click", async () => {
    const user = userEvent.setup();
    renderWithIntl(<FileCard file={prFile({ path: "lib/models/user.g.dart" })} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-expanded", "false");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });
});
