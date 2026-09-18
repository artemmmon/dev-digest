import { ApiError } from "@/lib/api";

/**
 * Message for the add-repo form. A 422 carries the generic "Request validation
 * failed" at the top level; the useful text ("Expected https://github.com/…")
 * is in the first validation issue.
 */
export function addRepoErrorMessage(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return fallback;
  if (e.code === "validation_error" && Array.isArray(e.details)) {
    const first = e.details[0] as { message?: unknown } | undefined;
    if (typeof first?.message === "string" && first.message) return first.message;
  }
  return e.message || fallback;
}
