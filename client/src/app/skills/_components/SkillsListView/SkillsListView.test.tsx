import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { screen, cleanup, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Skill } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";

const mk = (name: string, over: Partial<Skill> = {}): Skill => ({
  id: name,
  name,
  description: `Use when ${name}.`,
  type: "rubric",
  source: "manual",
  body: `# ${name}\n\n**bold rule**`,
  enabled: true,
  version: 1,
  ...over,
});

const h = vi.hoisted(() => ({
  skills: [] as Skill[],
  loading: false,
  params: {} as Record<string, string | null>,
  setParams: vi.fn(),
  push: vi.fn(),
  toggle: vi.fn(),
  del: vi.fn(),
  create: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, replace: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({ usePageCrumb: () => {} }));
vi.mock("@/lib/use-search-param-state", () => ({
  useSearchParamState: (key: string) => [h.params[key] ?? null, vi.fn()],
  useSearchParamsUpdate: () => h.setParams,
}));
// Partial mock: the import dialog brings its own hooks (real ones, over the test QueryClient).
vi.mock("@/lib/hooks/skills", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSkills: () => ({ data: h.loading ? undefined : h.skills, isLoading: h.loading, isError: false, refetch: vi.fn() }),
  useToggleSkill: () => ({ mutate: h.toggle, isPending: false }),
  useDeleteSkill: () => ({ mutate: h.del, isPending: false, variables: undefined }),
  useCreateSkill: () => ({ mutate: h.create, isPending: false }),
}));

import { SkillsListView } from "./SkillsListView";

beforeEach(() => {
  h.skills = [mk("branch-coverage", { version: 3, agent_count: 2 }), mk("mocking-discipline", { enabled: false, type: "convention" })];
  h.loading = false;
  h.params = {};
  Object.values(h).forEach((f) => typeof f === "function" && "mockReset" in f && (f as ReturnType<typeof vi.fn>).mockReset());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SkillsListView", () => {
  it("shows a card per skill and no preview drawer by default", () => {
    renderWithIntl(<SkillsListView />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "branch-coverage" })).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("puts the clicked card's id in ?skill=", async () => {
    renderWithIntl(<SkillsListView />);
    await userEvent.setup().click(screen.getByRole("button", { name: "mocking-discipline" }));
    expect(h.setParams).toHaveBeenCalledWith({ skill: "mocking-discipline" });
  });

  it("opens the side panel for the skill named in ?skill=, with the body rendered as markdown", () => {
    h.params = { skill: "branch-coverage" };
    renderWithIntl(<SkillsListView />);
    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getByRole("heading", { name: "branch-coverage" })).toBeInTheDocument(); // "# branch-coverage" rendered
    expect(within(drawer).getByText("bold rule").tagName).toBe("STRONG"); // rendered, not raw "**bold rule**"
    expect(within(drawer).getByRole("link", { name: "Open skill branch-coverage" })).toHaveAttribute(
      "href",
      "/skills/branch-coverage",
    );
  });

  it("closes the panel by clearing ?skill=", async () => {
    h.params = { skill: "branch-coverage" };
    renderWithIntl(<SkillsListView />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Close" }));
    expect(h.setParams).toHaveBeenCalledWith({ skill: null });
  });

  it("opens nothing for a ?skill= that names a deleted skill", () => {
    h.params = { skill: "deleted" };
    renderWithIntl(<SkillsListView />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers Create and Import in the Add menu; Create sets ?create=1", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SkillsListView />);
    await user.click(screen.getByRole("button", { name: /Add/ }));
    expect(await screen.findByText("Create")).toBeInTheDocument();
    expect(screen.getByText("Import")).toBeInTheDocument();
    await user.click(screen.getByText("Create"));
    expect(h.setParams).toHaveBeenCalledWith({ create: "1" });
  });

  it("opens the create dialog for ?create=1 and goes to the new skill's page after saving", async () => {
    h.params = { create: "1" };
    const user = userEvent.setup();
    renderWithIntl(<SkillsListView />);
    expect(screen.getByRole("dialog")).toHaveTextContent("Create a skill");
    await user.type(screen.getByRole("textbox", { name: "Name" }), "my-skill");
    await user.type(screen.getByPlaceholderText(/Use when reviewing/), "Use when X: do Y.");
    await user.type(screen.getByPlaceholderText(/Describe how to apply/), "# Rule");
    await user.click(screen.getByRole("button", { name: "Create skill" }));
    act(() => h.create.mock.calls[0]![1].onSuccess({ ...mk("my-skill"), id: "new1" }));
    expect(h.push).toHaveBeenCalledWith("/skills/new1");
  });

  it("closes the create dialog by clearing ?create=", async () => {
    h.params = { create: "1" };
    renderWithIntl(<SkillsListView />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }));
    expect(h.setParams).toHaveBeenCalledWith({ create: null });
  });

  it("opens the import dialog from the Add menu", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SkillsListView />);
    await user.click(screen.getByRole("button", { name: /Add/ }));
    await user.click(await screen.findByText("Import"));
    expect(await screen.findByText("Import a skill")).toBeInTheDocument();
  });

  it("switches a skill on or off from its card", async () => {
    renderWithIntl(<SkillsListView />);
    await userEvent.setup().click(screen.getByRole("switch", { name: "Enable skill mocking-discipline" }));
    expect(h.toggle).toHaveBeenCalledWith({ id: "mocking-discipline", enabled: true });
  });

  it("deletes after the dialog is confirmed, and closes the panel if that skill was open", async () => {
    h.params = { skill: "mocking-discipline" };
    const user = userEvent.setup();
    renderWithIntl(<SkillsListView />);
    // the drawer overlay sits above the grid visually, but the card is still in the DOM
    await user.click(screen.getByRole("button", { name: "Delete skill mocking-discipline" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(h.del).toHaveBeenCalledWith("mocking-discipline", expect.anything());
    act(() => h.del.mock.calls[0]![1].onSuccess());
    expect(h.setParams).toHaveBeenCalledWith({ skill: null });
  });

  it("shows an empty state when there are no skills", () => {
    h.skills = [];
    renderWithIntl(<SkillsListView />);
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
  });
});
