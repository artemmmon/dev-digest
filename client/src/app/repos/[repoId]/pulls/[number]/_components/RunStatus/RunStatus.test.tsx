import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render";

// The SSE hook is the external system here; each test drives its `running` flag.
const stream = vi.hoisted(() => ({ running: false }));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: stream.running }),
}));

import { RunStatus } from "./RunStatus";

afterEach(() => {
  cleanup();
  stream.running = false;
});

describe("RunStatus", () => {
  it("renders nothing when there are no run ids", () => {
    renderWithIntl(<RunStatus runIds={[]} />);
    expect(screen.queryByPlaceholderText("Filter log…")).toBeNull();
  });

  it("renders the live log while runs stream", () => {
    stream.running = true;
    renderWithIntl(<RunStatus runIds={["r1"]} />);
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });

  it("calls onDone once when the streams finish, even if the parent keeps re-rendering", () => {
    const onDone = vi.fn();
    stream.running = true;
    // A fresh arrow per render, like the PR page passes.
    const { rerender } = renderWithIntl(<RunStatus runIds={["r1"]} onDone={() => onDone()} />);
    expect(onDone).not.toHaveBeenCalled();

    stream.running = false;
    rerender(<RunStatus runIds={["r1"]} onDone={() => onDone()} />);
    rerender(<RunStatus runIds={["r1"]} onDone={() => onDone()} />);
    rerender(<RunStatus runIds={["r1"]} onDone={() => onDone()} />);

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does not call onDone for streams that never ran", () => {
    const onDone = vi.fn();
    renderWithIntl(<RunStatus runIds={["r1"]} onDone={onDone} />);
    expect(onDone).not.toHaveBeenCalled();
  });
});
