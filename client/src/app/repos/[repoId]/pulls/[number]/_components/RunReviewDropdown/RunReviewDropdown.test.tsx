import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test/render";

const h = vi.hoisted(() => ({ mutateAsync: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: vi.fn() }),
  useParams: () => ({ repoId: "r1" }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({
    data: [
      { id: "a1", name: "Security", model: "gpt-4.1", enabled: true },
      { id: "a2", name: "Style", model: "gpt-4.1", enabled: true },
      { id: "a3", name: "Dormant", model: "gpt-4.1", enabled: false },
    ],
  }),
}));
vi.mock("@/lib/hooks/multi-agent", () => ({
  useReviewEstimates: () => ({ data: [] }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

beforeEach(() => {
  h.mutateAsync.mockReset();
  h.push.mockReset();
});
afterEach(cleanup);

describe("RunReviewDropdown", () => {
  it("renders the trigger label", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" prNumber={7} />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
  });

  it("AC-31: lists the enabled agents with every checkbox checked when it opens", async () => {
    const user = userEvent.setup();
    renderWithIntl(<RunReviewDropdown prId="pr1" prNumber={7} />);
    await user.click(screen.getByRole("button", { name: "Run Review" }));
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    boxes.forEach((b) => expect(b).toHaveAttribute("aria-checked", "true"));
    expect(screen.queryByText("Dormant")).not.toBeInTheDocument();
  });

  it("AC-32: two or more checked agents open the Multi-Agent Review page on the new run", async () => {
    const user = userEvent.setup();
    h.mutateAsync.mockResolvedValue({ pr_id: "pr1", runs: [], reviews: [], skipped_agents: [], multi_agent_run_id: "b1" });
    renderWithIntl(<RunReviewDropdown prId="pr1" prNumber={7} />);
    await user.click(screen.getByRole("button", { name: "Run Review" }));
    await user.click(screen.getByRole("button", { name: "Run multi-agent review (2)" }));
    expect(h.mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1", "a2"] });
    expect(h.push).toHaveBeenCalledWith("/repos/r1/multi-agent?pr=7&run=b1");
  });

  it("AC-33: exactly one checked agent keeps the single-run flow", async () => {
    const user = userEvent.setup();
    const onRunsStarted = vi.fn();
    h.mutateAsync.mockResolvedValue({
      pr_id: "pr1",
      runs: [{ run_id: "run1" }],
      reviews: [],
      skipped_agents: [],
      multi_agent_run_id: "run1",
    });
    renderWithIntl(<RunReviewDropdown prId="pr1" prNumber={7} onRunsStarted={onRunsStarted} />);
    await user.click(screen.getByRole("button", { name: "Run Review" }));
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    await user.click(screen.getByRole("checkbox", { name: /Security/ }));
    await user.click(screen.getByRole("button", { name: "Run Security" }));
    expect(h.mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1"] });
    expect(onRunsStarted).toHaveBeenCalledWith(["run1"]);
    expect(h.push).not.toHaveBeenCalled();
  });
});
