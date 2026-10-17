import { describe, expect, it } from "vitest";
import { DEFAULT_PERIOD, isUnfiltered, parseFilters } from "./helpers";

const UUID = "0b1f6d2e-7a3c-4c1e-9a55-3f2b8f9d1c10";
const none = { period: "7d", agent: null, repo: null, status: null };

describe("parseFilters", () => {
  it("keeps known values", () => {
    expect(parseFilters({ period: "30d", agent: UUID, repo: "octo/widgets", status: "failed" })).toEqual({
      period: "30d",
      agent_id: UUID,
      repo: "octo/widgets",
      status: "failed",
    });
  });

  it("drops an unknown period to the default", () => {
    expect(parseFilters({ ...none, period: "90d" }).period).toBe(DEFAULT_PERIOD);
    expect(parseFilters({ ...none, period: "" }).period).toBe(DEFAULT_PERIOD);
  });

  it("drops an unknown status", () => {
    expect(parseFilters({ ...none, status: "exploded" }).status).toBeNull();
  });

  it("drops an agent that is not a UUID", () => {
    expect(parseFilters({ ...none, agent: "not-a-uuid" }).agent_id).toBeNull();
    expect(parseFilters({ ...none, agent: `${UUID}; drop` }).agent_id).toBeNull();
  });

  it("drops a repository name over 200 characters", () => {
    expect(parseFilters({ ...none, repo: "a".repeat(201) }).repo).toBeNull();
    expect(parseFilters({ ...none, repo: "a".repeat(200) }).repo).toBe("a".repeat(200));
  });
});

describe("isUnfiltered", () => {
  it("is true only for the whole period with no other filter", () => {
    expect(isUnfiltered({ period: "all" })).toBe(true);
    expect(isUnfiltered({ period: "all", agent_id: null, repo: null, status: null })).toBe(true);
  });

  it("is false when the period or any other filter narrows the list", () => {
    expect(isUnfiltered({ period: "7d" })).toBe(false);
    expect(isUnfiltered({ period: "all", agent_id: UUID })).toBe(false);
    expect(isUnfiltered({ period: "all", repo: "octo/widgets" })).toBe(false);
    expect(isUnfiltered({ period: "all", status: "failed" })).toBe(false);
  });
});
