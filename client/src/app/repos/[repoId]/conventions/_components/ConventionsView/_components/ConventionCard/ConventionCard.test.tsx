/**
 * ConventionCard — evidence link + numbered snippet, Accept / Reject, inline Edit (no
 * navigation), and the accepted state (badge, Undo, selection checkbox).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ConventionCandidate } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";
import { ConventionCard, type ConventionCardProps } from "./ConventionCard";

afterEach(cleanup);

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  repo_id: "r1",
  category: "error-handling",
  rule: "Throw AppError subclasses instead of bare Error",
  evidence_path: "server/src/platform/errors.ts",
  evidence_line: 19,
  evidence_end_line: 21,
  evidence_snippet: "export class NotFoundError extends AppError {\n  constructor() {}\n}",
  evidence_url: "https://github.com/acme/api/blob/abc1234/server/src/platform/errors.ts#L19-L21",
  confidence: 0.92,
  status: "pending",
  commit_sha: "abc1234",
  created_at: "2026-09-21T10:00:00Z",
  updated_at: "2026-09-21T10:00:00Z",
};

function setup(over: Partial<ConventionCardProps> = {}, candidate: Partial<ConventionCandidate> = {}) {
  const props: ConventionCardProps = {
    candidate: { ...CANDIDATE, ...candidate },
    onAccept: vi.fn(),
    onReject: vi.fn(),
    onUndo: vi.fn(),
    onSaveRule: vi.fn(),
    ...over,
  };
  renderWithIntl(<ConventionCard {...props} />);
  return props;
}

describe("ConventionCard", () => {
  it("shows the category, the rule and the confidence as a percentage", () => {
    setup();
    expect(screen.getByText("Error handling")).toBeInTheDocument();
    expect(screen.getByText("Throw AppError subclasses instead of bare Error")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
  });

  it("links path:line range to the GitHub permalink in a new tab", () => {
    setup();
    const link = screen.getByRole("link", { name: /server\/src\/platform\/errors\.ts:19-21/ });
    expect(link).toHaveAttribute("href", CANDIDATE.evidence_url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("shows plain text when there is no permalink", () => {
    setup({}, { evidence_url: null, evidence_end_line: null });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("server/src/platform/errors.ts:19")).toBeInTheDocument();
  });

  it("numbers the snippet lines from the evidence line", () => {
    setup();
    const code = screen.getByLabelText(/Evidence from/);
    expect(code).toHaveTextContent("19export class NotFoundError extends AppError {");
    expect(code).toHaveTextContent("20 constructor() {}");
    expect(code).toHaveTextContent("21}");
  });

  it("accepts and rejects through the callbacks", async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.click(screen.getByRole("button", { name: "Accept" }));
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(p.onAccept).toHaveBeenCalledTimes(1);
    expect(p.onReject).toHaveBeenCalledTimes(1);
  });

  it("edits the rule inline and saves the trimmed text", async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByDisplayValue(CANDIDATE.rule);
    await user.clear(box);
    await user.type(box, "  Use AppError everywhere  ");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(p.onSaveRule).toHaveBeenCalledWith("Use AppError everywhere");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });

  it("cancels an edit without saving", async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByDisplayValue(CANDIDATE.rule), " more");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(p.onSaveRule).not.toHaveBeenCalled();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });

  it("will not save a rule that is too short", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByDisplayValue(CANDIDATE.rule);
    await user.clear(box);
    await user.type(box, "ab");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("at least 3");
  });

  it("an accepted card shows the badge, Undo and a selection checkbox", async () => {
    const user = userEvent.setup();
    const onSelectedChange = vi.fn();
    const p = setup({ selected: true, onSelectedChange }, { status: "accepted" });
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    const box = screen.getByRole("checkbox", { name: "Include in the skill" });
    expect(box).toHaveAttribute("aria-checked", "true");
    await user.click(box);
    expect(onSelectedChange).toHaveBeenCalledWith(false);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(p.onUndo).toHaveBeenCalledTimes(1);
  });
});
