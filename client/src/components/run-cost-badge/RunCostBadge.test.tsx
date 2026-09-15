/**
 * RunCostBadge — spend of a run (detailed) or a review batch (compact).
 * Missing data must read "—", never "$0.00".
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

function renderBadge(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RunCostBadge", () => {
  it("compact shows only the cost, or '—' without data", () => {
    renderBadge(<RunCostBadge variant="compact" costUsd={0.014} />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();

    cleanup();
    renderBadge(<RunCostBadge variant="compact" costUsd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("detailed shows locale-grouped tokens with the cost", () => {
    renderBadge(<RunCostBadge variant="detailed" tokens={9119} costUsd={0.0013} />);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("detailed falls back to the cost alone when tokens are unknown", () => {
    renderBadge(<RunCostBadge variant="detailed" tokens={null} costUsd={0.0013} />);
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();

    cleanup();
    renderBadge(<RunCostBadge variant="detailed" tokens={null} costUsd={undefined} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
