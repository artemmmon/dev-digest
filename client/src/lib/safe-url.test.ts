import { describe, expect, it } from "vitest";
import { safeHttpsUrl } from "./safe-url";

describe("safeHttpsUrl", () => {
  it("keeps an https URL as given", () => {
    expect(safeHttpsUrl("https://github.com/o/r/pull/1")).toBe("https://github.com/o/r/pull/1");
  });

  it.each([
    ["http", "http://github.com/o/r"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["not a URL", "github.com/o/r"],
    ["empty string", ""],
  ])("rejects %s", (_name, url) => {
    expect(safeHttpsUrl(url)).toBeNull();
  });

  it("rejects null and undefined", () => {
    expect(safeHttpsUrl(null)).toBeNull();
    expect(safeHttpsUrl(undefined)).toBeNull();
  });
});
