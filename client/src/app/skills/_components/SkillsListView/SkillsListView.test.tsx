import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Skill } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";

const mk = (name: string, over: Partial<Skill> = {}): Skill => ({
  id: name,
  name,
  description: `Use when ${name}.`,
  type: "rubric",
  source: "manual",
  body: `# ${name}`,
  enabled: true,
  version: 1,
  ...over,
});

const h = vi.hoisted(() => ({
  skills: [] as Skill[],
  selected: null as string | null,
  setParams: vi.fn(),
  tab: null as string | null,
  toggle: vi.fn(),
}));

vi.mock("@/components/app-shell", () => ({ usePageCrumb: () => {} }));
vi.mock("@/lib/use-search-param-state", () => ({
  useSearchParamState: (key: string) => [key === "tab" ? h.tab : h.selected, vi.fn()],
  useSearchParamsUpdate: () => h.setParams,
}));
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: h.skills, isLoading: false, isError: false, refetch: vi.fn() }),
  useToggleSkill: () => ({ mutate: h.toggle, isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateSkill: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSkillAgents: () => ({ data: [], isError: false, refetch: vi.fn() }),
  useSkillVersions: () => ({ data: [], isError: false, refetch: vi.fn() }),
  usePreviewSkillImport: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillsListView } from "./SkillsListView";

const bodyBox = () => screen.getByRole("textbox", { name: "Body (Markdown)" });

beforeEach(() => {
  h.skills = [mk("branch-coverage"), mk("mocking-discipline", { enabled: false, type: "convention" })];
  h.selected = null;
  h.setParams.mockReset();
  h.tab = null;
  h.toggle.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SkillsListView", () => {
  it("opens the first skill in the editor when nothing is selected", () => {
    renderWithIntl(<SkillsListView />);
    expect(screen.getByRole("heading", { name: "branch-coverage" })).toBeInTheDocument();
    expect(bodyBox()).toHaveValue("# branch-coverage");
  });

  it("opens the skill named in ?skill=", () => {
    h.selected = "mocking-discipline";
    renderWithIntl(<SkillsListView />);
    expect(screen.getByRole("heading", { name: "mocking-discipline" })).toBeInTheDocument();
    expect(bodyBox()).toHaveValue("# mocking-discipline");
  });

  it("falls back to the first skill when ?skill= names one that is gone", () => {
    h.selected = "deleted";
    renderWithIntl(<SkillsListView />);
    expect(screen.getByRole("heading", { name: "branch-coverage" })).toBeInTheDocument();
  });

  it("opens an empty draft for ?skill=new", () => {
    h.selected = "new";
    renderWithIntl(<SkillsListView />);
    expect(screen.getByRole("heading", { name: "New skill" })).toBeInTheDocument();
    expect(bodyBox()).toHaveValue("");
  });

  it("opens the tab named in ?tab=, and writes a tab change to the URL", async () => {
    h.tab = "versions";
    renderWithIntl(<SkillsListView />);
    expect(screen.getByText("Version history")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Config" }));
    expect(h.setParams).toHaveBeenCalledWith({ tab: null }); // Config is the default: no param
  });

  it("puts the clicked skill's id in the URL", async () => {
    renderWithIntl(<SkillsListView />);
    await userEvent.setup().click(screen.getByRole("button", { name: "mocking-discipline" }));
    expect(h.setParams).toHaveBeenCalledWith({ skill: "mocking-discipline" }); // keeps the open tab
  });

  it("asks before leaving a skill with unsaved edits, and stays if declined", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderWithIntl(<SkillsListView />);
    await user.type(bodyBox(), "!");

    await user.click(screen.getByRole("button", { name: "mocking-discipline" }));
    expect(confirm).toHaveBeenCalledWith("Discard your unsaved changes?");
    expect(h.setParams).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "mocking-discipline" }));
    expect(h.setParams).toHaveBeenCalledWith({ skill: "mocking-discipline" }); // keeps the open tab
  });

  it("does not ask when nothing was edited", async () => {
    const confirm = vi.spyOn(window, "confirm");
    renderWithIntl(<SkillsListView />);
    await userEvent.setup().click(screen.getByRole("button", { name: "mocking-discipline" }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it("starts a draft from the Add menu", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SkillsListView />);
    await user.click(screen.getByRole("button", { name: /Add Skill/ }));
    await user.click(await screen.findByText("Create from scratch"));
    expect(h.setParams).toHaveBeenCalledWith({ skill: "new", tab: null });
  });

  it("opens the import dialog from the Add menu", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SkillsListView />);
    await user.click(screen.getByRole("button", { name: /Add Skill/ }));
    await user.click(await screen.findByText("Import from file"));
    expect(await screen.findByText("Import a skill")).toBeInTheDocument();
  });

  it("switches a skill on or off from its row", async () => {
    renderWithIntl(<SkillsListView />);
    await userEvent.setup().click(screen.getByRole("switch", { name: "Enable skill mocking-discipline" }));
    expect(h.toggle).toHaveBeenCalledWith({ id: "mocking-discipline", enabled: true });
  });

  it("shows an empty state when there are no skills", () => {
    h.skills = [];
    renderWithIntl(<SkillsListView />);
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
  });
});
