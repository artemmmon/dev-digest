/* config/env.ts — the one place that reads process.env for the app, validated once.
   NEXT_PUBLIC_* values are inlined at build time, so each is referenced literally.
   Plain checks, not zod: this module is in every page's bundle. */

const DEFAULT_API_BASE = "http://localhost:3001";

/** A full http(s) URL without a trailing slash, or a thrown error naming the variable. */
function httpUrl(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a full URL, e.g. ${DEFAULT_API_BASE} (got "${value}")`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must start with http:// or https:// (got "${value}")`);
  }
  return value.replace(/\/+$/, "");
}

export const env = {
  /** Base URL of the DevDigest API (REST + SSE). No trailing slash. */
  apiBase: httpUrl("NEXT_PUBLIC_API_BASE", process.env.NEXT_PUBLIC_API_BASE || DEFAULT_API_BASE),
};
