import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "a1", name: "Security", model: "gpt-4.1", enabled: true }] }),
}));
const h = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

afterEach(cleanup);

describe("RunReviewDropdown (smoke)", () => {
  it("renders the trigger label", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
  });

  it('toasts which agents "Run all" skipped (applies_to matched no changed file)', async () => {
    const user = userEvent.setup();
    h.mutateAsync.mockResolvedValue({
      pr_id: "pr1",
      runs: [],
      reviews: [],
      skipped_agents: [{ agent_id: "a2", agent_name: "Flutter Reviewer" }],
    });
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    await user.click(screen.getByRole("button", { name: "Run Review" }));
    await user.click(screen.getByText("Run all enabled agents"));
    expect(
      await screen.findByText('Skipped (no changed file matches their "applies to"): Flutter Reviewer'),
    ).toBeInTheDocument();
  });
});
