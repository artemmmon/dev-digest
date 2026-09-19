import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api";
import { renderWithIntl } from "@/test/render";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push }) }));

const add = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock("@/lib/hooks", () => ({ useAddRepo: () => add }));

import { AddRepoView } from "./AddRepoView";

afterEach(() => {
  cleanup();
  nav.push.mockReset();
  add.mutateAsync.mockReset();
  add.isPending = false;
});

const urlField = () => screen.getByPlaceholderText("https://github.com/owner/repo");
const submit = () => screen.getByRole("button", { name: /Add repository/ });

describe("AddRepoView", () => {
  it("keeps Add disabled until a URL is typed", async () => {
    const user = userEvent.setup();
    renderWithIntl(<AddRepoView />);
    expect(submit()).toBeDisabled();
    await user.type(urlField(), "https://github.com/acme/widgets");
    expect(submit()).toBeEnabled();
  });

  it("adds the repo and opens its PR list", async () => {
    add.mutateAsync.mockResolvedValue({ id: "repo-9" });
    const user = userEvent.setup();
    renderWithIntl(<AddRepoView />);
    await user.type(urlField(), "  https://github.com/acme/widgets  ");
    await user.click(submit());
    expect(add.mutateAsync).toHaveBeenCalledWith("https://github.com/acme/widgets"); // trimmed
    expect(nav.push).toHaveBeenCalledWith("/repos/repo-9/pulls");
  });

  it("submits on Enter", async () => {
    add.mutateAsync.mockResolvedValue({ id: "r" });
    const user = userEvent.setup();
    renderWithIntl(<AddRepoView />);
    await user.type(urlField(), "https://github.com/a/b{Enter}");
    await waitFor(() => expect(add.mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("shows the API's validation message inline, and stays on the page", async () => {
    add.mutateAsync.mockRejectedValue(
      new ApiError("Request validation failed", 422, "validation_error", [
        { message: "Expected https://github.com/<owner>/<repo>" },
      ]),
    );
    const user = userEvent.setup();
    renderWithIntl(<AddRepoView />);
    await user.type(urlField(), "https://github.com/../x");
    await user.click(submit());
    expect(await screen.findByText("Expected https://github.com/<owner>/<repo>")).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("falls back to a translated message for an unexpected error", async () => {
    add.mutateAsync.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    renderWithIntl(<AddRepoView />);
    await user.type(urlField(), "https://github.com/a/b");
    await user.click(submit());
    expect(await screen.findByText("Could not add repository")).toBeInTheDocument();
  });

  it("Esc and Cancel go back to the app", async () => {
    const user = userEvent.setup();
    renderWithIntl(<AddRepoView />);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(nav.push).toHaveBeenCalledTimes(2);
    expect(nav.push).toHaveBeenCalledWith("/");
  });

  it("links to the API keys settings from the intro", () => {
    renderWithIntl(<AddRepoView />);
    expect(screen.getByRole("link", { name: "Settings → API Keys" })).toHaveAttribute("href", "/settings/api-keys");
  });
});
