import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderWithIntl } from "@/test/render";
import { RepoStackLabel } from "./RepoStackLabel";

afterEach(cleanup);

const STACK = {
  frameworks: [{ name: "Flutter", path: "" }],
  languages: [{ name: "Dart", share: 0.92 }],
  packages: ["flutter_bloc"],
  detected_at: "2026-09-23T00:00:00.000Z",
};

describe("RepoStackLabel", () => {
  it("renders the formatted stack when detected", () => {
    renderWithIntl(<RepoStackLabel stack={STACK} />);
    expect(screen.getByText("Flutter · Dart 92% · flutter_bloc")).toBeInTheDocument();
  });

  it("shows a pending message when detection hasn't run yet (`null`)", () => {
    renderWithIntl(<RepoStackLabel stack={null} />);
    expect(screen.getByText("Stack not detected yet")).toBeInTheDocument();
  });

  it("renders nothing while the repo itself hasn't loaded (`undefined`)", () => {
    // `renderWithIntl` mounts a `ToastProvider`, which always renders an (empty) host
    // div, so assert on text content rather than the whole container being empty.
    const { container } = renderWithIntl(<RepoStackLabel stack={undefined} />);
    expect(container).toHaveTextContent("");
  });

  it("renders nothing when detection found nothing (non-null but empty)", () => {
    const { container } = renderWithIntl(
      <RepoStackLabel stack={{ frameworks: [], languages: [], packages: [], detected_at: "x" }} />,
    );
    expect(container).toHaveTextContent("");
  });
});
