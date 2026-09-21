import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";

const h = vi.hoisted(() => ({ agents: undefined as undefined | Array<{ id: string; name: string }> }));
vi.mock("@/lib/hooks/skills", () => ({
  useSkillAgents: () => ({ data: h.agents, isError: false, refetch: vi.fn() }),
}));

import { StatsTab } from "./StatsTab";

const SKILL = { id: "s1", name: "x", agent_count: 2 } as Skill;

afterEach(cleanup);

describe("StatsTab", () => {
  it("counts the agents and links each one to its Skills tab", () => {
    h.agents = [
      { id: "a1", name: "Test Quality Reviewer" },
      { id: "a2", name: "API Contract Reviewer" },
    ];
    renderWithIntl(<StatsTab skill={SKILL} />);
    expect(screen.getByText("USED BY")).toBeInTheDocument();
    expect(screen.getByText("agents")).toBeInTheDocument();
    expect(screen.getByText("Test Quality Reviewer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open API Contract Reviewer" })).toHaveAttribute(
      "href",
      "/agents/a2?tab=skills",
    );
  });

  it("says so when no agent uses the skill", () => {
    h.agents = [];
    renderWithIntl(<StatsTab skill={{ ...SKILL, agent_count: 0 }} />);
    expect(screen.getByText("No agent has this skill switched on.")).toBeInTheDocument();
  });

  it("does not show metrics that have no data behind them", () => {
    h.agents = [];
    renderWithIntl(<StatsTab skill={SKILL} />);
    expect(screen.queryByText(/accept rate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pull frequency/i)).not.toBeInTheDocument();
  });
});
