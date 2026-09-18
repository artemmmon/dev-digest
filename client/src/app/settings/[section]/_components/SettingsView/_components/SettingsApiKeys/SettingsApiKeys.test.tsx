import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api";
import { renderWithIntl } from "@/test/render";

const hooks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
  status: { openai: true, anthropic: false, openrouter: false, github: false } as Record<string, boolean> | undefined,
}));
vi.mock("@/lib/hooks", () => ({
  useTestConnection: () => ({ mutateAsync: hooks.mutateAsync, isPending: hooks.isPending }),
  useSecretsStatus: () => ({ data: hooks.status }),
}));

import { SettingsApiKeys } from "./SettingsApiKeys";

afterEach(() => {
  cleanup();
  hooks.mutateAsync.mockReset();
  hooks.isPending = false;
  hooks.status = { openai: true, anthropic: false, openrouter: false, github: false };
});

/** The row (label + input + button) of one provider, found by its label text. */
function row(label: string) {
  return screen.getByText(label).closest("div")!.parentElement as HTMLElement;
}

describe("SettingsApiKeys", () => {
  it("shows Configured / Not set per provider from the secrets status", () => {
    renderWithIntl(<SettingsApiKeys />);
    expect(screen.getAllByText("Configured")).toHaveLength(1);
    expect(screen.getAllByText("Not set")).toHaveLength(3);
  });

  it("shows no badge until the status has loaded", () => {
    hooks.status = undefined;
    renderWithIntl(<SettingsApiKeys />);
    expect(screen.queryByText("Configured")).toBeNull();
    expect(screen.queryByText("Not set")).toBeNull();
  });

  it("tests a typed key and shows the server's message", async () => {
    hooks.mutateAsync.mockResolvedValue({ provider: "openai", ok: true, message: "OK — 12 models available" });
    const user = userEvent.setup();
    renderWithIntl(<SettingsApiKeys />);
    const openai = within(row("OpenAI API key"));
    await user.type(openai.getByPlaceholderText(/stored via SecretsProvider/), "  sk-typed  ");
    await user.click(openai.getByRole("button", { name: "Test connection" }));
    expect(hooks.mutateAsync).toHaveBeenCalledWith({ provider: "openai", key: "sk-typed" }); // trimmed
    expect(await screen.findByText("OK — 12 models available")).toBeInTheDocument();
  });

  it("tests the stored key when nothing is typed (no key in the request)", async () => {
    hooks.mutateAsync.mockResolvedValue({ provider: "openai", ok: true, message: "fine" });
    const user = userEvent.setup();
    renderWithIntl(<SettingsApiKeys />);
    await user.click(within(row("OpenAI API key")).getByRole("button", { name: "Test connection" }));
    expect(hooks.mutateAsync).toHaveBeenCalledWith({ provider: "openai", key: undefined });
  });

  it("shows a failed test as a failure message, from the API or a generic one", async () => {
    hooks.mutateAsync.mockResolvedValueOnce({ provider: "openai", ok: false, message: "Incorrect API key" });
    const user = userEvent.setup();
    renderWithIntl(<SettingsApiKeys />);
    const button = within(row("OpenAI API key")).getByRole("button", { name: "Test connection" });
    await user.click(button);
    expect(await screen.findByText("Incorrect API key")).toBeInTheDocument();

    hooks.mutateAsync.mockRejectedValueOnce(new ApiError("Too many requests", 429));
    await user.click(button);
    expect(await screen.findByText("Too many requests")).toBeInTheDocument();

    hooks.mutateAsync.mockRejectedValueOnce(new Error("network"));
    await user.click(button);
    expect(await screen.findByText("Test failed")).toBeInTheDocument();
  });
});
