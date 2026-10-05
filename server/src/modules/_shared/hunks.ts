import { INTENT_LIMITS } from '@devdigest/shared';

/**
 * Hunk helpers shared by the intent and brief modules. They read only the
 * `@@ … @@` header lines of a bare `pr_files.patch` (no `diff --git` / `+++`
 * line, so `parseUnifiedDiff` cannot be used); hunk bodies are never returned.
 * Every regex is anchored and bounded.
 */

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@.*$/;
/** Captures the new-side start and the optional new-side line count. */
const NEW_SIDE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/** Pull the `@@ … @@` header lines out of one file's patch text (`pr_files.patch`). */
export function extractHunkHeaders(patch: string): string[] {
  const headers: string[] = [];
  for (const line of patch.split('\n')) {
    if (!HUNK_HEADER.test(line)) continue;
    headers.push(line.slice(0, INTENT_LIMITS.hunkHeaderChars));
    if (headers.length >= INTENT_LIMITS.maxHunkHeadersPerFile) break;
  }
  return headers;
}

export interface LineRange {
  start: number;
  end: number;
}

/**
 * New-side line ranges of a patch, one per `@@` header: `newStart` to
 * `newStart + newLines - 1` (context lines count). No range when `newLines`
 * is 0; a missing count means 1.
 */
export function newSideRanges(patch: string): LineRange[] {
  const ranges: LineRange[] = [];
  for (const line of patch.split('\n')) {
    const m = NEW_SIDE.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count <= 0) continue;
    ranges.push({ start, end: start + count - 1 });
  }
  return ranges;
}
