import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import type { RunEvent } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";

// The SSE hook is the external system here; the tests drive what it reports and
// capture the options RunStatus hands it (the hook itself is tested in reviews.test.tsx).
const stream = vi.hoisted(() => ({
  running: false,
  options: undefined as { onEvent?: (e: RunEvent) => void; onSettled?: () => void } | undefined,
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: (_ids: string[], options: typeof stream.options) => {
    stream.options = options;
    return { events: [], running: stream.running };
  },
}));
const notify = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/lib/toast", async (orig) => ({ ...(await orig<object>()), notify }));

import { RunStatus } from "./RunStatus";

afterEach(() => {
  cleanup();
  stream.running = false;
  stream.options = undefined;
  notify.error.mockReset();
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

  it("hands its onDone to the stream as onSettled", () => {
    const onDone = vi.fn();
    renderWithIntl(<RunStatus runIds={["r1"]} onDone={onDone} />);
    stream.options!.onSettled!();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("toasts a runtime error event, and only errors", () => {
    renderWithIntl(<RunStatus runIds={["r1"]} />);
    const event = (kind: RunEvent["kind"], msg: string) => ({ runId: "r1", seq: 1, kind, msg, t: "00:00:01" });
    stream.options!.onEvent!(event("info", "fine"));
    stream.options!.onEvent!(event("error", "LLM quota exceeded"));
    expect(notify.error).toHaveBeenCalledTimes(1);
    expect(notify.error).toHaveBeenCalledWith("LLM quota exceeded");
  });
});
