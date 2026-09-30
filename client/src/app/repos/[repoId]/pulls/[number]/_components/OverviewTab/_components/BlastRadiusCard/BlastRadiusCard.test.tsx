/* BlastRadiusCard — three flows: the full map (tree, then graph); a degraded index with Resync
   (and no Resync when indexing is off); a failed GET. Real hooks over a mocked `api`. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as ApiModule from "@/lib/api";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { renderWithIntl } from "@/test/render";
import { BlastRadiusCard } from "./BlastRadiusCard";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock("@/lib/api", async (orig) => {
  const actual = await orig<typeof ApiModule>();
  return { ...actual, api: { ...actual.api, get: h.get, post: h.post } };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SHA = "abc1234def";

const FULL: BlastRadiusResponse = {
  blast: {
    changed_symbols: [
      { name: "rateLimit", file: "src/rate.ts", kind: "function" },
      { name: "bucketKey", file: "src/rate.ts", kind: "function" },
    ],
    downstream: [
      {
        symbol: "rateLimit",
        callers: [
          { name: "authMiddleware", file: "src/auth.ts", line: 12 },
          { name: "publicRouter", file: "src/router.ts", line: 40 },
        ],
        endpoints_affected: ["GET /users"],
        crons_affected: ["nightly-sync"],
      },
      {
        symbol: "bucketKey",
        callers: [{ name: "limiterStore", file: "src/store.ts", line: 7 }],
        endpoints_affected: [],
        crons_affected: [],
      },
    ],
    summary: "2 changed symbols reach 3 callers, 1 endpoint and 1 cron job.",
  },
  head_sha: SHA,
  index: { status: "full", degraded: false, reason: null, indexed_sha: SHA },
  limits: { max_callers_per_symbol: 20 },
  counts: { changed_files: 2, symbols: 2, callers: 3, endpoints: 1, crons: 1 },
  truncated: false,
};

const EMPTY_BLAST = { changed_symbols: [], downstream: [], summary: "No indexed symbols in the changed files." };

function degraded(reason: "no_data" | "flag_off"): BlastRadiusResponse {
  return {
    ...FULL,
    blast: EMPTY_BLAST,
    index: { status: "degraded", degraded: true, reason, indexed_sha: null },
    counts: { changed_files: 2, symbols: 0, callers: 0, endpoints: 0, crons: 0 },
  };
}

function renderCard() {
  return renderWithIntl(
    <BlastRadiusCard prId="pr1" repoId="repo1" repoFullName="acme/widgets" headSha={SHA} />,
  );
}

function mockGets(blast: BlastRadiusResponse) {
  h.get.mockImplementation(async (path?: string) => {
    if (path?.endsWith("/index-state")) return { status: "degraded", updatedAt: "t1" };
    return blast;
  });
}

describe("BlastRadiusCard", () => {
  it("shows the counts, opens the first symbol, toggles another and switches to the graph", async () => {
    const user = userEvent.setup();
    mockGets(FULL);
    renderCard();

    expect(await screen.findByText("authMiddleware")).toBeInTheDocument();
    expect(screen.getByText("cron/jobs")).toBeInTheDocument();
    expect(screen.getByText("GET /users")).toBeInTheDocument();
    expect(screen.getByText("nightly-sync")).toBeInTheDocument();
    // the server's summary sentence is not printed
    expect(screen.queryByText(/reach 3 callers/)).not.toBeInTheDocument();

    // The path is split into per-segment spans so it wraps only at `/`; jsdom (no default
    // stylesheet) puts a space between element children in the computed name, real browsers don't.
    const link = screen.getByRole("link", { name: /^src\/\s?auth\.ts:12$/ });
    expect(link).toHaveTextContent(/^src\/auth\.ts:12$/);
    expect(link.getAttribute("href")).toContain(`/blob/${SHA}/`);
    expect(link.getAttribute("href")).toContain("#L12");
    // the row's wrapper carries the full ref for a path clipped at narrow widths
    expect(link.parentElement).toHaveAttribute("title", "src/auth.ts:12");

    const first = screen.getByRole("button", { name: /rateLimit/ });
    const second = screen.getByRole("button", { name: /bucketKey/ });
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(second).toHaveAttribute("aria-expanded", "false");
    await user.click(second);
    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("limiterStore")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "graph" }));
    const svg = screen.getByRole("img", { name: /rateLimit/ });
    expect(within(svg).getByText("authMiddleware")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "bucketKey" }));
    const svg2 = screen.getByRole("img", { name: /bucketKey/ });
    expect(within(svg2).getByText("limiterStore")).toBeInTheDocument();
    expect(within(svg2).queryByText("authMiddleware")).not.toBeInTheDocument();
  });

  it("explains a missing index and offers Resync, except when indexing is off", async () => {
    const user = userEvent.setup();
    mockGets(degraded("no_data"));
    h.post.mockResolvedValue({ status: "accepted" });
    renderCard();

    expect(await screen.findByText(/no index data yet/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resync index" }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/repos/repo1/resync"));

    cleanup();
    mockGets(degraded("flag_off"));
    renderCard();
    expect(await screen.findByText(/indexing is turned off/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resync/i })).not.toBeInTheDocument();
  });

  it("shows an error state, not an empty map, when the GET fails", async () => {
    h.get.mockRejectedValue(new Error("boom"));
    renderCard();
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load the blast radius/i);
    expect(screen.queryByText(/no indexed symbols/i)).not.toBeInTheDocument();
  });
});
