import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test/render";
import type { Agent } from "@devdigest/shared";

const h = vi.hoisted(() => ({ del: vi.fn(), pending: false }));
vi.mock("@/lib/hooks/agents", () => ({
  useDeleteAgent: () => ({ mutate: h.del, isPending: h.pending }),
}));

import { AgentCard } from "./AgentCard";

beforeEach(() => {
  h.del.mockReset();
  h.pending = false;
});

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

describe("AgentCard (smoke)", () => {
  it("renders the agent name, model chip and skill count", () => {
    renderWithIntl(<AgentCard ag={AGENT} skillCount={3} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("3 skills")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });
});

describe("AgentCard delete", () => {
  it("asks in a dialog, never with window.confirm, and deletes only after Delete", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm");
    renderWithIntl(<AgentCard ag={AGENT} />);
    await user.click(screen.getByRole("button", { name: "Delete agent" }));
    expect(screen.getByRole("dialog")).toHaveTextContent('Delete agent "Security Reviewer"? This cannot be undone.');
    expect(h.del).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(h.del).toHaveBeenCalledWith("ag1", expect.anything());
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("keeps the agent when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    renderWithIntl(<AgentCard ag={AGENT} />);
    await user.click(screen.getByRole("button", { name: "Delete agent" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(h.del).not.toHaveBeenCalled();
  });

  it("does not open the agent when the dialog is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithIntl(<AgentCard ag={AGENT} onClick={onClick} />);
    await user.click(screen.getByRole("button", { name: "Delete agent" }));
    await user.click(screen.getByText("Delete agent?"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
