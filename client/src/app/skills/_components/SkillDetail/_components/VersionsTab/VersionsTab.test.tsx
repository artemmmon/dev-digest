import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";
import { dayOf, lineDiff } from "./helpers";

const h = vi.hoisted(() => ({ versions: [] as SkillVersion[], updateAsync: vi.fn() }));
vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: h.versions, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutateAsync: h.updateAsync, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

const SKILL = { id: "s1", name: "x", version: 3, body: "# Rule\nkeep\nnew line" } as Skill;
const v = (version: number, message: string | null, body: string): SkillVersion => ({
  version,
  body,
  message,
  created_at: `2026-05-0${version}T10:00:00.000Z`,
});

beforeEach(() => {
  h.versions = [v(3, "Tightened scope", SKILL.body), v(2, null, "# Rule\nkeep\nold line"), v(1, null, "# Rule\nkeep")];
  h.updateAsync.mockReset();
  h.updateAsync.mockResolvedValue({ ...SKILL, version: 4 });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("VersionsTab", () => {
  it("lists versions newest first with message, day and a Current badge on the newest", () => {
    renderWithIntl(<VersionsTab skill={SKILL} dirty={false} />);
    expect(screen.getByText("3 versions")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Tightened scope");
    expect(rows[0]).toHaveTextContent("Current");
    expect(rows[0]).toHaveTextContent("2026-05-03");
    expect(rows[1]).toHaveTextContent("Version 2"); // no message
    expect(rows[2]).toHaveTextContent("Initial version");
    expect(within(rows[0]!).queryByRole("button", { name: /Restore/ })).not.toBeInTheDocument();
  });

  it("shows a diff against the current body: added lines come back, removed ones go away", async () => {
    const user = userEvent.setup();
    renderWithIntl(<VersionsTab skill={SKILL} dirty={false} />);
    await user.click(screen.getByRole("button", { name: "Show changes of v2" }));
    // The sign in front of each line says what happens to it: " " kept, "−" goes away, "+" comes back.
    const diff = screen.getByRole("list", { name: "Show changes of v2" });
    expect(within(diff).getAllByRole("listitem").map((l) => l.textContent)).toEqual([
      " # Rule",
      " keep",
      "−new line",
      "+old line",
    ]);
    await user.click(screen.getByRole("button", { name: "Show changes of v2" }));
    expect(screen.queryByRole("list", { name: "Show changes of v2" })).not.toBeInTheDocument();
  });

  it("restores an older version as a new save, after the dialog is confirmed", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm");
    renderWithIntl(<VersionsTab skill={SKILL} dirty={false} />);
    await user.click(screen.getByRole("button", { name: "Restore v1" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Restore v1? Its text is saved again as a new version");
    expect(h.updateAsync).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(h.updateAsync).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Restore v1" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restore" }));
    expect(h.updateAsync).toHaveBeenCalledWith({ id: "s1", patch: { body: "# Rule\nkeep", message: "Restored v1" } });
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("blocks Restore while Config has unsaved edits", () => {
    renderWithIntl(<VersionsTab skill={SKILL} dirty />);
    expect(screen.getByRole("button", { name: "Restore v1" })).toBeDisabled();
    expect(screen.getAllByText(/Save or discard your unsaved changes/).length).toBeGreaterThan(0);
  });
});

describe("lineDiff", () => {
  const compact = (a: string, b: string) => lineDiff(a, b).map((l) => `${l.kind[0]}:${l.text}`);

  it("marks identical text as unchanged", () => {
    expect(compact("a\nb", "a\nb")).toEqual(["s:a", "s:b"]);
  });
  it("finds inserted, removed and replaced lines in the middle", () => {
    expect(compact("a\nb\nc", "a\nc")).toEqual(["s:a", "d:b", "s:c"]);
    expect(compact("a\nc", "a\nb\nc")).toEqual(["s:a", "a:b", "s:c"]);
    expect(compact("a\nb\nc", "a\nx\nc")).toEqual(["s:a", "d:b", "a:x", "s:c"]);
  });
  it("handles a completely different text and an empty side", () => {
    expect(compact("a", "b")).toEqual(["d:a", "a:b"]);
    expect(compact("", "a")).toEqual(["d:", "a:a"]);
  });
});

describe("dayOf", () => {
  it("keeps the calendar day of an ISO timestamp", () => {
    expect(dayOf("2026-05-30T23:59:59.000Z")).toBe("2026-05-30");
  });
});
