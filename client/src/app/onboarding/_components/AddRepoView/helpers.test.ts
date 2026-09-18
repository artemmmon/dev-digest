import { describe, it, expect } from "vitest";
import { ApiError } from "@/lib/api";
import { addRepoErrorMessage } from "./helpers";

describe("addRepoErrorMessage", () => {
  it("surfaces the first validation issue instead of the generic 422 text", () => {
    const e = new ApiError("Request validation failed", 422, "validation_error", [
      { message: "Expected https://github.com/<owner>/<repo>" },
    ]);
    expect(addRepoErrorMessage(e, "fallback")).toBe("Expected https://github.com/<owner>/<repo>");
  });

  it("uses the API message for other errors", () => {
    const e = new ApiError("Cannot reach the DevDigest engine", 0, "network_error");
    expect(addRepoErrorMessage(e, "fallback")).toBe("Cannot reach the DevDigest engine");
  });

  it("falls back for non-API errors", () => {
    expect(addRepoErrorMessage(new Error("boom"), "fallback")).toBe("fallback");
  });
});
