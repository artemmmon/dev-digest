/* IntentCard — three flows: the full card; waiting for the head SHA → empty state → Derive;
   stale + missing context → Re-derive, then a failed load that must not look empty.
   Real hooks (usePrIntent/useDeriveIntent) over a mocked `api`, same pattern as
   ConventionsView.test.tsx: exercises the actual query/mutation wiring, not a stub. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as ApiModule from "@/lib/api";
import type { PrIntent, PrIntentResponse } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";
import { IntentCard } from "./IntentCard";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock("@/lib/api", async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: h.get, post: h.post } };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const INTENT: PrIntent = {
  summary: "Adds a rate limiter middleware to the public API.",
  in_scope: ["Add per-IP rate limiting", "Return 429 with Retry-After"],
  out_of_scope: ["Refactor the auth middleware"],
  pr_id: "pr1",
  confidence_tier: "high",
  basis: "documented",
  missing_context: false,
  sources: [{ id: "s1", kind: "body", ref: "body", status: "used" }],
  risk_areas: [
    { kind: "dependency", label: "new dependency ioredis", origin: "rule" },
    { kind: "performance", label: "Adds a Redis round-trip per request", origin: "model" },
  ],
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  head_sha: "abc1234def",
  tokens_in: 900,
  tokens_out: 120,
  cost_usd: 0.0004,
  derived_at: "2026-09-24T10:00:00Z",
};

function respond(response: PrIntentResponse) {
  h.get.mockResolvedValue(response);
}

describe("IntentCard", () => {
  it("renders the full card, and hides the incidental block when there is none", async () => {
    respond({
      intent: {
        ...INTENT,
        incidental_changes: [
          {
            path: "lib/data/lineups_api.dart",
            start_line: 14,
            end_line: 23,
            header: "@@ -14,6 +14,10 @@",
            reason: "unrelated error handling",
          },
        ],
      },
      stale: false,
      current_head_sha: "abc1234def",
    });
    const { unmount } = renderWithIntl(<IntentCard prId="pr1" headSha="abc1234def" />);

    expect(
      await screen.findByText("Adds a rate limiter middleware to the public API.", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText("Add per-IP rate limiting")).toBeInTheDocument();
    expect(screen.getByText("Refactor the auth middleware")).toBeInTheDocument();
    expect(screen.getByText("new dependency ioredis")).toBeInTheDocument();
    expect(screen.getByText("Adds a Redis round-trip per request")).toBeInTheDocument();
    expect(screen.getByText("lib/data/lineups_api.dart:14–23")).toBeInTheDocument();
    expect(screen.getByText("— unrelated error handling", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("High", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-derive intent" })).toBeInTheDocument();

    unmount();
    respond({ intent: INTENT, stale: false, current_head_sha: "abc1234def" });
    renderWithIntl(<IntentCard prId="pr1" headSha="abc1234def" />);
    await screen.findByText("Add per-IP rate limiting");
    expect(screen.queryByText("Incidental changes (treated as out of scope)")).not.toBeInTheDocument();
  });

  it("waits for the head SHA, then shows the empty state and derives on click", async () => {
    respond({ intent: null, stale: false, current_head_sha: "abc1234def" });
    h.post.mockResolvedValue(INTENT);
    const user = userEvent.setup();

    const { rerender } = renderWithIntl(<IntentCard prId="pr1" />);
    expect(h.get).not.toHaveBeenCalled(); // no head SHA yet → no fetch that could race the detail refresh

    rerender(<IntentCard prId="pr1" headSha="abc1234def" />);
    await user.click(await screen.findByRole("button", { name: "Derive intent" }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/pulls/pr1/intent"));
  });

  it("flags stale and missing context, re-derives on click, and shows an error (not the empty state) when loading fails", async () => {
    const stale: PrIntent = {
      ...INTENT,
      confidence_tier: "low",
      basis: "inferred",
      missing_context: true,
      sources: [
        { id: "s1", kind: "body", ref: "body", status: "used" },
        { id: "s2", kind: "doc", ref: "docs/plans/x.md", status: "not_found" },
      ],
    };
    respond({ intent: stale, stale: true, current_head_sha: "def5678abc" });
    h.post.mockResolvedValue(stale);
    const user = userEvent.setup();
    const { unmount } = renderWithIntl(<IntentCard prId="pr1" headSha="def5678abc" />);

    expect(await screen.findByText("Missing context", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("docs/plans/x.md", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("abc1234", { exact: false })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Re-derive intent" }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/pulls/pr1/intent"));

    unmount();
    h.get.mockRejectedValue(new Error("network down"));
    renderWithIntl(<IntentCard prId="pr1" headSha="def5678abc" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the intent");
    expect(screen.queryByRole("button", { name: "Derive intent" })).not.toBeInTheDocument();
  });
});
