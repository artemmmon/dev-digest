import { describe, it, expect, afterEach, vi } from "vitest";

/** env.ts parses at import, so each case sets process.env first and imports a fresh copy. */
async function loadEnv(apiBase: string | undefined) {
  vi.resetModules();
  if (apiBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE;
  else process.env.NEXT_PUBLIC_API_BASE = apiBase;
  return (await import("./env")).env;
}

const original = process.env.NEXT_PUBLIC_API_BASE;
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_API_BASE;
  else process.env.NEXT_PUBLIC_API_BASE = original;
});

describe("env", () => {
  it("defaults to the local API", async () => {
    expect((await loadEnv(undefined)).apiBase).toBe("http://localhost:3001");
  });

  it("uses NEXT_PUBLIC_API_BASE and drops a trailing slash", async () => {
    expect((await loadEnv("https://api.example.test/")).apiBase).toBe("https://api.example.test");
  });

  it("rejects a value that is not a URL, with a message naming the variable", async () => {
    await expect(loadEnv("localhost:3001-oops")).rejects.toThrow(/NEXT_PUBLIC_API_BASE/);
  });
});
