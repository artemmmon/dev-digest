import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Skill } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";

const SKILL: Skill = {
  id: "s1",
  name: "branch-coverage",
  description: "Use when reviewing tests: flag branches.",
  type: "rubric",
  source: "manual",
  body: "# Rule\n\n**bold rule**",
  enabled: true,
  version: 3,
  agent_count: 1,
};

const h = vi.hoisted(() => ({
  skill: undefined as Skill | undefined,
  isError: false,
  tab: null as string | null,
  setTab: vi.fn(),
  push: vi.fn(),
  del: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, replace: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({ usePageCrumb: () => {} }));
vi.mock("@/lib/use-search-param-state", () => ({
  useSearchParamState: () => [h.tab, h.setTab],
}));
vi.mock("@/lib/hooks/skills", () => ({
  useSkill: () => ({ data: h.skill, isLoading: false, isError: h.isError, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: h.del, isPending: false }),
  useToggleSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useSkillAgents: () => ({ data: [], isError: false, refetch: vi.fn() }),
  useSkillVersions: () => ({
    data: [
      { version: 3, body: SKILL.body, message: "Tightened", created_at: "2026-05-03T10:00:00.000Z" },
      { version: 2, body: "old", message: null, created_at: "2026-05-02T10:00:00.000Z" },
    ],
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { SkillPageView } from "./SkillPageView";

beforeEach(() => {
  h.skill = SKILL;
  h.isError = false;
  h.tab = null;
  h.setTab.mockReset();
  h.push.mockReset();
  h.del.mockReset();
});
afterEach(cleanup);

describe("SkillPageView (/skills/<id>)", () => {
  it("shows the skill with Config, Preview and Versioning tabs (and Stats), Config first", () => {
    renderWithIntl(<SkillPageView id="s1" />);
    expect(screen.getByRole("heading", { name: "branch-coverage" })).toBeInTheDocument();
    for (const name of ["Config", "Preview", "Versioning", "Stats"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Versions" })).not.toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
  });

  it("links back to /skills", () => {
    renderWithIntl(<SkillPageView id="s1" />);
    expect(screen.getByRole("link", { name: "Skills" })).toHaveAttribute("href", "/skills");
  });

  it("writes a tab change to ?tab=, and Config (the default) clears it", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SkillPageView id="s1" />);
    await user.click(screen.getByRole("button", { name: "Versioning" }));
    expect(h.setTab).toHaveBeenLastCalledWith("versions");
    await user.click(screen.getByRole("button", { name: "Config" }));
    expect(h.setTab).toHaveBeenLastCalledWith(null);
  });

  it("renders the Preview tab as markdown", () => {
    h.tab = "preview";
    renderWithIntl(<SkillPageView id="s1" />);
    expect(screen.getByText("bold rule").tagName).toBe("STRONG");
    expect(screen.getByRole("heading", { name: "Rule" })).toBeInTheDocument();
  });

  it("lists every version on the Versioning tab with Diff and Restore, asking before a restore", async () => {
    h.tab = "versions";
    renderWithIntl(<SkillPageView id="s1" />);
    expect(screen.getByText("Version history")).toBeInTheDocument();
    expect(screen.getByText("2 versions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show changes of v2" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Restore v2" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Restore v2?");
  });

  it("asks in a dialog before deleting, then goes back to /skills", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SkillPageView id="s1" />);
    await user.click(screen.getByRole("button", { name: "Delete skill" }));
    expect(screen.getByRole("dialog")).toHaveTextContent('Delete skill "branch-coverage"?');
    expect(h.del).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(h.del).toHaveBeenCalledWith("s1", expect.anything());
    act(() => h.del.mock.calls[0]![1].onSuccess());
    expect(h.push).toHaveBeenCalledWith("/skills");
  });

  it("says so when the skill cannot be loaded", () => {
    h.skill = undefined;
    h.isError = true;
    renderWithIntl(<SkillPageView id="gone" />);
    expect(screen.getByText(/Could not load this skill/)).toBeInTheDocument();
  });
});
