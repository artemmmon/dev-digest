import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { renderWithIntl } from "@/test/render";
import type { DiffFindingApi } from "../findings";
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

function finding(overrides: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "bug",
    title: "t",
    file: "src/config.ts",
    start_line: 2,
    end_line: 2,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
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

  it("shows the dot, the inline finding and the out-of-patch block when shown, and hides the two finding slots (keeping the dot and label) when `show` is false", () => {
    const inPatch = finding({ id: "in", start_line: 2 });
    const outOfPatch = finding({ id: "out", start_line: 99 });
    const findings: DiffFindingApi = {
      findings: [inPatch, outOfPatch],
      show: true,
      renderFinding: (f) => <div data-testid={`finding-${f.id}`}>{f.title}</div>,
    };
    const { rerender } = renderWithIntl(
      <FileCard file={prFile({ path: "src/config.ts" })} findings={findings} />,
    );
    expect(screen.getByRole("img", { name: "This file has review findings" })).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByTestId("finding-in")).toBeInTheDocument();
    expect(screen.getByTestId("finding-out")).toBeInTheDocument();

    rerender(
      <FileCard file={prFile({ path: "src/config.ts" })} findings={{ ...findings, show: false }} />,
    );
    expect(screen.getByRole("img", { name: "This file has review findings" })).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.queryByTestId("finding-in")).not.toBeInTheDocument();
    expect(screen.queryByTestId("finding-out")).not.toBeInTheDocument();
  });
});
