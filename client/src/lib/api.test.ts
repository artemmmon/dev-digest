import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ApiError, api, apiFetch } from "./api";

/** apiFetch is the one place fetch is called; every hook's error handling depends on how it normalises failures. */

const respond = (body: BodyInit | null, init: ResponseInit = {}) =>
  new Response(body, { headers: { "content-type": "application/json" }, ...init });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("apiFetch", () => {
  it("returns parsed JSON and calls the API base", async () => {
    fetchMock.mockResolvedValue(respond(JSON.stringify([{ id: "r1" }])));
    expect(await apiFetch<{ id: string }[]>("/repos")).toEqual([{ id: "r1" }]);
    expect(fetchMock.mock.calls[0]![0]).toBe("http://localhost:3001/repos");
  });

  it("returns undefined for 204", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await apiFetch("/x")).toBeUndefined();
  });

  it("declares JSON only when a body is sent", async () => {
    fetchMock.mockImplementation(async () => respond("{}")); // a fresh Response per call
    await api.post("/pulls/1/refresh");
    await api.post("/repos", { url: "u" });
    const headersOf = (i: number) => (fetchMock.mock.calls[i]![1] as RequestInit).headers as Record<string, string>;
    expect(headersOf(0)["content-type"]).toBeUndefined(); // Fastify rejects an empty JSON body
    expect(headersOf(1)["content-type"]).toBe("application/json");
    expect((fetchMock.mock.calls[1]![1] as RequestInit).body).toBe('{"url":"u"}');
  });

  it("turns the API error envelope into an ApiError with status, code and details", async () => {
    fetchMock.mockResolvedValue(
      respond(JSON.stringify({ error: { code: "validation_error", message: "Request validation failed", details: [{ message: "bad" }] } }), { status: 422 }),
    );
    const err = await apiFetch("/repos").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 422,
      code: "validation_error",
      message: "Request validation failed",
      details: [{ message: "bad" }],
    });
  });

  it("falls back to the status line when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502, statusText: "Bad Gateway" }));
    const err = (await apiFetch("/x").catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(502);
    expect(err.message).toBe("502 Bad Gateway");
    expect(err.code).toBeUndefined();
  });

  it("reports an unreachable API as status 0 / network_error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = (await apiFetch("/x").catch((e: unknown) => e)) as ApiError;
    expect(err).toMatchObject({ status: 0, code: "network_error" });
    expect(err.message).toContain("Is the API running?");
  });

  it("api.del sends DELETE and api.put PUT with a body", async () => {
    fetchMock.mockImplementation(async () => respond("{}"));
    await api.del("/runs/1");
    await api.put("/settings", { theme: "dark" });
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("DELETE");
    expect((fetchMock.mock.calls[1]![1] as RequestInit).method).toBe("PUT");
  });
});
