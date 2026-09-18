import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

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

function withIntl(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("RunStatus", () => {
  it("renders nothing when there are no run ids", () => {
    const { container } = render(withIntl(<RunStatus runIds={[]} />));
    expect(container.firstChild).toBeNull();
  });

  it("calls onDone once when the streams finish, even if the parent keeps re-rendering", () => {
    const onDone = vi.fn();
    stream.running = true;
    // A fresh arrow per render, like the PR page passes.
    const { rerender } = render(withIntl(<RunStatus runIds={["r1"]} onDone={() => onDone()} />));
    expect(onDone).not.toHaveBeenCalled();

    stream.running = false;
    rerender(withIntl(<RunStatus runIds={["r1"]} onDone={() => onDone()} />));
    rerender(withIntl(<RunStatus runIds={["r1"]} onDone={() => onDone()} />));
    rerender(withIntl(<RunStatus runIds={["r1"]} onDone={() => onDone()} />));

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does not call onDone for streams that never ran", () => {
    const onDone = vi.fn();
    render(withIntl(<RunStatus runIds={["r1"]} onDone={onDone} />));
    expect(onDone).not.toHaveBeenCalled();
  });
});
