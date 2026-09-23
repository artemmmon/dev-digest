/**
 * CreateConventionSkillModal — prefilled from the server draft, editable body with a
 * Write/Preview toggle, agent select, read-only metadata, Cancel / Create payload.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Agent, ConventionSkillCreate, ConventionSkillDraft } from "@devdigest/shared";
import type * as ApiModule from "@/lib/api";
import { ApiError } from "@/lib/api";
import { renderWithIntl } from "@/test/render";
import { CreateConventionSkillModal } from "./CreateConventionSkillModal";

const h = vi.hoisted(() => ({
  post: vi.fn(),
  agents: [] as Agent[],
}));

vi.mock("@/lib/api", async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, post: h.post } };
});
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: h.agents, isLoading: false }),
}));

afterEach(() => {
  cleanup();
  h.post.mockReset();
  h.agents = [];
});

const DRAFT: ConventionSkillDraft = {
  name: "repo-conventions",
  description: "Apply the house rules of acme/api when writing server code.",
  type: "convention",
  body: "# Conventions\n\n- Throw AppError subclasses",
  evidence_files: ["server/src/platform/errors.ts", "server/src/app.ts"],
};

const AGENT = (id: string, name: string): Agent =>
  ({
    id,
    name,
    description: "",
    provider: "openai",
    model: "gpt-4.1",
    system_prompt: "",
    output_schema: null,
    strategy: "single-pass",
    ci_fail_on: "critical",
    repo_intel: true,
    enabled: true,
    version: 1,
  }) as Agent;

const IDS = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];

/** Answers the draft request, then whatever `create` resolves to. */
function serve(create: () => unknown = () => ({ skill_id: "s1", name: "repo-conventions", agent_id: null })) {
  h.post.mockImplementation((path: string) =>
    path.endsWith("/skill-draft") ? Promise.resolve(DRAFT) : Promise.resolve(create()),
  );
}

function setup() {
  const props = { repoId: "r1", repoName: "acme/api", conventionIds: IDS, onClose: vi.fn(), onCreated: vi.fn() };
  renderWithIntl(<CreateConventionSkillModal {...props} />);
  return props;
}

describe("CreateConventionSkillModal", () => {
  it("explains what it creates and requests the draft for the selected ids", async () => {
    serve();
    setup();
    expect(screen.getByText("Created from 2 accepted conventions of acme/api.")).toBeInTheDocument();
    await screen.findByLabelText("Name");
    expect(h.post).toHaveBeenCalledWith("/repos/r1/conventions/skill-draft", { convention_ids: IDS });
  });

  it("asks for the draft once even when the parent re-renders with a new ids array", async () => {
    serve();
    const props = { repoId: "r1", repoName: "acme/api", conventionIds: IDS, onClose: vi.fn(), onCreated: vi.fn() };
    const { rerender } = renderWithIntl(<CreateConventionSkillModal {...props} />);
    await screen.findByLabelText("Name");
    rerender(<CreateConventionSkillModal {...props} conventionIds={[...IDS]} />);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(h.post).toHaveBeenCalledTimes(1);
  });

  it("prefills name, description and body from the draft and lists the read-only metadata", async () => {
    serve();
    setup();
    expect(await screen.findByLabelText("Name")).toHaveValue("repo-conventions");
    expect(screen.getByLabelText("Description")).toHaveValue(DRAFT.description);
    expect(screen.getByDisplayValue(/Throw AppError subclasses/)).toBeInTheDocument();
    expect(screen.getByText("convention")).toBeInTheDocument();
    expect(screen.getByText("extracted")).toBeInTheDocument();
    expect(screen.getByText("server/src/platform/errors.ts")).toBeInTheDocument();
    expect(screen.getByText("server/src/app.ts")).toBeInTheDocument();
  });

  it("switches the body between Write and rendered Preview", async () => {
    const user = userEvent.setup();
    serve();
    setup();
    await screen.findByLabelText("Name");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByTestId("skill-body-preview")).toHaveTextContent("Throw AppError subclasses");
    expect(screen.queryByDisplayValue(/Throw AppError subclasses/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Write" }));
    expect(screen.getByDisplayValue(/Throw AppError subclasses/)).toBeInTheDocument();
  });

  it("offers 'Don't link to an agent' first, then every agent", async () => {
    h.agents = [AGENT("a1", "Security Reviewer"), AGENT("a2", "Mentor")];
    serve();
    setup();
    await screen.findByLabelText("Name");
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Don't link to an agent", "Security Reviewer", "Mentor"]);
  });

  it("creates with the edited fields and the chosen agent", async () => {
    const user = userEvent.setup();
    h.agents = [AGENT("a1", "Security Reviewer")];
    serve(() => ({ skill_id: "s1", name: "api-rules", agent_id: "a1" }));
    const p = setup();
    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "api-rules");
    await user.selectOptions(screen.getByRole("combobox"), "a1");
    await user.click(screen.getByRole("button", { name: "Create skill" }));

    await waitFor(() => expect(p.onCreated).toHaveBeenCalled());
    const call = h.post.mock.calls.find(([path]) => (path as string).endsWith("/conventions/skills"));
    expect(call?.[0]).toBe("/repos/r1/conventions/skills");
    expect(call?.[1] as ConventionSkillCreate).toEqual({
      convention_ids: IDS,
      name: "api-rules",
      description: DRAFT.description,
      body: DRAFT.body,
      agent_id: "a1",
    });
    expect(p.onCreated.mock.calls[0]![0]).toMatchObject({ skill_id: "s1" });
  });

  it("sends agent_id null when no agent is chosen", async () => {
    const user = userEvent.setup();
    serve();
    setup();
    await screen.findByLabelText("Name");
    await user.click(screen.getByRole("button", { name: "Create skill" }));
    await waitFor(() =>
      expect(h.post.mock.calls.some(([path]) => (path as string).endsWith("/conventions/skills"))).toBe(true),
    );
    const call = h.post.mock.calls.find(([path]) => (path as string).endsWith("/conventions/skills"));
    expect((call?.[1] as ConventionSkillCreate).agent_id).toBeNull();
  });

  it("Cancel closes without creating", async () => {
    const user = userEvent.setup();
    serve();
    const p = setup();
    await screen.findByLabelText("Name");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(h.post).toHaveBeenCalledTimes(1); // only the draft
  });

  it("disables Create while the name is empty", async () => {
    const user = userEvent.setup();
    serve();
    setup();
    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });

  it("shows the server's message inline when the draft fails, and retries", async () => {
    const user = userEvent.setup();
    h.post.mockRejectedValueOnce(new ApiError("No accepted conventions", 422, "validation_error"));
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("No accepted conventions");
    serve();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByLabelText("Name")).toHaveValue("repo-conventions");
  });

  it("shows an inline error when creating fails and stays open", async () => {
    const user = userEvent.setup();
    h.post.mockImplementation((path: string) =>
      path.endsWith("/skill-draft")
        ? Promise.resolve(DRAFT)
        : Promise.reject(new ApiError("Skill name already exists", 409, "conflict")),
    );
    const p = setup();
    await screen.findByLabelText("Name");
    await user.click(screen.getByRole("button", { name: "Create skill" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Skill name already exists");
    expect(p.onCreated).not.toHaveBeenCalled();
  });
});
