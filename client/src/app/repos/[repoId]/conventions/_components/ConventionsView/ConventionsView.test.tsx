/**
 * ConventionsView — Run Scan on a first run, ReScan (behind a confirm) once there are
 * candidates, the loading hint during a scan, and Create skill only after an accept.
 * Real hooks over a mocked `api`, so the optimistic cache updates are exercised too.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  ConventionCandidate,
  ConventionList,
  ConventionScanReport,
  ConventionScanResult,
} from "@devdigest/shared";
import type * as ApiModule from "@/lib/api";
import { ApiError } from "@/lib/api";
import { renderWithIntl } from "@/test/render";
import { ConventionsView } from "./ConventionsView";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock("@/lib/api", async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: h.get, post: h.post, patch: h.patch } };
});
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/api" } }),
  useRepoNotFound: () => false,
}));

const cand = (id: string, over: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id,
  repo_id: "r1",
  category: "naming",
  rule: `Rule ${id}`,
  evidence_path: `src/${id}.ts`,
  evidence_line: 10,
  evidence_end_line: null,
  evidence_snippet: "const x = 1;",
  evidence_url: `https://github.com/acme/api/blob/abc1234/src/${id}.ts#L10`,
  confidence: 0.9,
  status: "pending",
  commit_sha: "abc1234",
  created_at: "2026-09-21T10:00:00Z",
  updated_at: "2026-09-21T10:00:00Z",
  ...over,
});

const REPORT: ConventionScanReport = {
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  commit_sha: "abc1234def",
  duration_ms: 12_300,
  config_files: ["package.json"],
  sampled_files: ["src/a.ts", "src/b.ts", "src/c.ts"],
  sample_source: "mixed",
  raw_candidates: 5,
  kept: 2,
  line_corrected: 1,
  dropped: {
    unknown_file: 0,
    snippet_not_found: 2,
    trivial_snippet: 0,
    duplicate: 1,
    known_decision: 0,
    category_cap: 0,
  },
  categories: { naming: 2 },
  tokens_in: 1000,
  tokens_out: 200,
  cost_usd: 0.0042,
};

const LAST_SCAN = { at: "2026-09-21T09:00:00Z", commit_sha: "abc1234def" };

function list(candidates: ConventionCandidate[], last_scan: ConventionList["last_scan"] = LAST_SCAN): ConventionList {
  return { candidates, last_scan };
}

/** Routes `/agents` to an empty list and everything else to `current`, which a test may swap. */
const served = { current: null as ConventionList | null };
function routeGet(path: string) {
  return Promise.resolve(path === "/agents" ? [] : served.current);
}

/** GET returns `initial`; PATCH echoes the candidate with the patch applied. */
function serve(initial: ConventionList) {
  served.current = initial;
  h.get.mockImplementation(routeGet);
  h.patch.mockImplementation((path: string, patch: Partial<ConventionCandidate>) => {
    const id = path.split("/").pop()!;
    const found = initial.candidates.find((c) => c.id === id)!;
    return Promise.resolve({ ...found, ...patch });
  });
}

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
  h.patch.mockReset();
});
afterEach(cleanup);

const render = () => renderWithIntl(<ConventionsView repoId="r1" />);

describe("ConventionsView — header and empty state", () => {
  it("shows the repo name, last scan time and short sha", async () => {
    serve(list([cand("a")]));
    render();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Conventions in acme/api");
    expect(await screen.findByText(/Last scan/)).toBeInTheDocument();
    expect(screen.getByText("commit abc1234")).toBeInTheDocument();
  });

  it("offers Run Scan (and no ReScan) when there are no candidates", async () => {
    serve(list([], null));
    render();
    expect(await screen.findByRole("button", { name: "Run Scan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ReScan" })).not.toBeInTheDocument();
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();
  });

  it("offers ReScan (and no Run Scan) when there are candidates", async () => {
    serve(list([cand("a")]));
    render();
    expect(await screen.findByRole("button", { name: "ReScan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run Scan" })).not.toBeInTheDocument();
  });

  it("shows an error state with Retry when the list cannot be loaded", async () => {
    h.get.mockRejectedValue(new ApiError("boom", 404, "not_found"));
    render();
    expect(await screen.findByText("Could not load conventions.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("ConventionsView — scanning", () => {
  it("Run Scan posts the extract request, shows the loading hint, then the results and the report", async () => {
    const user = userEvent.setup();
    serve(list([], null));
    let finish!: (r: ConventionScanResult) => void;
    h.post.mockReturnValue(new Promise<ConventionScanResult>((r) => (finish = r)));
    render();

    await user.click(await screen.findByRole("button", { name: "Run Scan" }));
    expect(h.post).toHaveBeenCalledWith("/repos/r1/conventions/extract");
    expect(await screen.findByText(/a few minutes/)).toBeInTheDocument();

    served.current = list([cand("a"), cand("b")]);
    finish({ candidates: [cand("a"), cand("b")], report: REPORT });
    expect(await screen.findByText("Rule a")).toBeInTheDocument();
    expect(screen.getByText("Rule b")).toBeInTheDocument();
    expect(screen.queryByText(/a few minutes/)).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /Scan report/ });
    expect(toggle).toHaveTextContent("3 sampled files · 2 kept of 5 proposed");
    await user.click(toggle);
    expect(screen.getByText(/snippet not found in the file: 2/)).toBeInTheDocument();
    expect(screen.getByText("openrouter/deepseek/deepseek-v4-flash")).toBeInTheDocument();
    expect(screen.getByText("$0.0042")).toBeInTheDocument();
  });

  it("ReScan asks first, and does nothing when cancelled", async () => {
    const user = userEvent.setup();
    serve(list([cand("a")]));
    render();
    await user.click(await screen.findByRole("button", { name: "ReScan" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Pending candidates will be replaced");
    expect(dialog).toHaveTextContent("Accepted conventions are kept");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(h.post).not.toHaveBeenCalled();
  });

  it("ReScan runs the scan once confirmed", async () => {
    const user = userEvent.setup();
    serve(list([cand("a")]));
    h.post.mockResolvedValue({ candidates: [cand("z")], report: REPORT });
    render();
    await user.click(await screen.findByRole("button", { name: "ReScan" }));
    served.current = list([cand("z")]);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "ReScan" }));
    expect(h.post).toHaveBeenCalledWith("/repos/r1/conventions/extract");
    expect(await screen.findByText("Rule z")).toBeInTheDocument();
    expect(screen.queryByText("Rule a")).not.toBeInTheDocument();
  });

  it.each([
    [new ApiError("A scan is already running", 409, "scan_in_progress"), /already running for this repository/],
    [new ApiError("OPENROUTER_API_KEY is not configured", 500, "config_error"), /No API key is configured/],
  ])("explains a failed scan inline (%#)", async (error, message) => {
    const user = userEvent.setup();
    serve(list([], null));
    h.post.mockRejectedValue(error);
    render();
    await user.click(await screen.findByRole("button", { name: "Run Scan" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Scan failed");
    expect(alert).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Run Scan" })).toBeEnabled();
  });
});

describe("ConventionsView — reviewing candidates", () => {
  it("Accept moves a card to Accepted and only then shows Create skill", async () => {
    const user = userEvent.setup();
    serve(list([cand("a"), cand("b", { confidence: 0.5 })]));
    render();
    await screen.findByText("Rule a");
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();

    const card = screen.getByRole("article", { name: "Rule a" });
    await user.click(within(card).getByRole("button", { name: "Accept" }));

    expect(await screen.findByRole("button", { name: "Create skill" })).toBeEnabled();
    expect(h.patch).toHaveBeenCalledWith("/repos/r1/conventions/a", { status: "accepted" });
    const accepted = screen.getByRole("region", { name: "Accepted" });
    expect(within(accepted).getByText("Rule a")).toBeInTheDocument();
    const pending = screen.getByRole("region", { name: "Pending review" });
    expect(within(pending).queryByText("Rule a")).not.toBeInTheDocument();
    expect(within(pending).getByText("Rule b")).toBeInTheDocument();
  });

  it("Reject removes the card at once", async () => {
    const user = userEvent.setup();
    serve(list([cand("a"), cand("b")]));
    render();
    await screen.findByText("Rule a");
    await user.click(within(screen.getByRole("article", { name: "Rule a" })).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(screen.queryByText("Rule a")).not.toBeInTheDocument());
    expect(h.patch).toHaveBeenCalledWith("/repos/r1/conventions/a", { status: "rejected" });
    expect(screen.getByText("Rule b")).toBeInTheDocument();
  });

  it("Undo sends an accepted card back to pending and hides Create skill again", async () => {
    const user = userEvent.setup();
    serve(list([cand("a", { status: "accepted" })]));
    render();
    expect(await screen.findByRole("button", { name: "Create skill" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument());
    expect(h.patch).toHaveBeenCalledWith("/repos/r1/conventions/a", { status: "pending" });
  });

  it("Edit rewords the rule in place", async () => {
    const user = userEvent.setup();
    serve(list([cand("a")]));
    render();
    await screen.findByText("Rule a");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByDisplayValue("Rule a");
    await user.clear(box);
    await user.type(box, "Better rule");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Better rule")).toBeInTheDocument();
    expect(h.patch).toHaveBeenCalledWith("/repos/r1/conventions/a", { rule: "Better rule" });
  });
});

describe("ConventionsView — Create skill", () => {
  const DRAFT = {
    name: "repo-conventions",
    description: "Apply the house rules.",
    type: "convention",
    body: "# Rules",
    evidence_files: ["src/a.ts"],
  };

  it("opens the modal with every accepted candidate selected", async () => {
    const user = userEvent.setup();
    serve(list([cand("a", { status: "accepted" }), cand("b", { status: "accepted" }), cand("c")]));
    h.post.mockResolvedValue(DRAFT);
    render();
    await user.click(await screen.findByRole("button", { name: "Create skill" }));
    expect(await screen.findByText("Created from 2 accepted conventions of acme/api.")).toBeInTheDocument();
    expect(h.post).toHaveBeenCalledWith("/repos/r1/conventions/skill-draft", { convention_ids: ["a", "b"] });
  });

  it("builds the skill only from the ticked candidates", async () => {
    const user = userEvent.setup();
    serve(list([cand("a", { status: "accepted" }), cand("b", { status: "accepted", confidence: 0.4 })]));
    h.post.mockResolvedValue(DRAFT);
    render();
    await screen.findByText("Rule a");
    const card = screen.getByRole("article", { name: "Rule b" });
    await user.click(within(card).getByRole("checkbox"));
    expect(screen.getByText("1 of 2 selected for the skill")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create skill" }));
    await screen.findByText("Created from 1 accepted convention of acme/api.");
    expect(h.post).toHaveBeenCalledWith("/repos/r1/conventions/skill-draft", { convention_ids: ["a"] });
  });

  it("after creating, confirms with a link to /skills and clears the selection", async () => {
    const user = userEvent.setup();
    serve(list([cand("a", { status: "accepted" })]));
    h.post.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith("/skill-draft") ? DRAFT : { skill_id: "s1", name: "repo-conventions", agent_id: null }),
    );
    render();
    await user.click(await screen.findByRole("button", { name: "Create skill" }));
    await screen.findByLabelText("Name");
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Create skill" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const notice = screen.getAllByRole("status").find((n) => n.textContent?.includes("Open Skills"))!;
    expect(within(notice).getByRole("link", { name: "Open Skills" })).toHaveAttribute("href", "/skills");
    expect(screen.getByText("0 of 1 selected for the skill")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });
});
