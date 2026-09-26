import type { UnifiedDiff } from '@devdigest/shared';
import { INTENT_LIMITS } from '@devdigest/shared';

/**
 * Hunk-header extraction (D11): only the `@@ … @@ <context>` lines, never diff
 * bodies. At most `maxHunkHeadersPerFile` headers per file (each capped at
 * `hunkHeaderChars`), at most `maxFiles` files.
 */

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@.*$/;
/** Same as HUNK_HEADER, capturing the optional old/new line counts. */
const HUNK_COUNTS = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;
const FILE_HEADER = /^diff --git a\/(.+?) b\/(.+)$/;

export interface FileHunkHeaders {
  path: string;
  headers: string[];
}

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

/** Build the per-file hunk-header list from `pr_files` rows. */
export function hunksFromFiles(
  files: { path: string; patch?: string | null }[],
): FileHunkHeaders[] {
  return files
    .slice(0, INTENT_LIMITS.maxFiles)
    .map((f) => ({ path: f.path, headers: f.patch ? extractHunkHeaders(f.patch) : [] }));
}

/**
 * Build the per-file hunk-header list from a run's raw unified diff, when
 * `pr_files` is empty (a freshly-imported PR, `server/INSIGHTS.md:39`).
 *
 * Hunk bodies are skipped by counting the old/new line totals from each `@@`
 * header, so an added body line whose text is `++ x` (rendered `+++ x`) or a
 * removed `-- x` is never mistaken for a file header — body text must never
 * reach the classifier prompt, not even as a "path".
 */
export function hunksFromRawDiff(diff: UnifiedDiff): FileHunkHeaders[] {
  const byFile = new Map<string, string[]>();
  let currentPath: string | null = null;
  let oldLeft = 0;
  let newLeft = 0;
  for (const line of diff.raw.split('\n')) {
    if (oldLeft > 0 || newLeft > 0) {
      // Inside a hunk body: consume one line and never interpret it.
      if (line.startsWith('-')) oldLeft--;
      else if (line.startsWith('+')) newLeft--;
      else if (!line.startsWith('\\')) {
        // context line (or an empty line standing for one)
        oldLeft--;
        newLeft--;
      }
      continue;
    }
    const fileHeader = line.match(FILE_HEADER);
    if (fileHeader) {
      currentPath = fileHeader[2] ?? null;
      continue;
    }
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).replace(/^b\//, '').trim();
      if (p !== '/dev/null') currentPath = p;
      continue;
    }
    const hunk = line.match(HUNK_COUNTS);
    if (hunk) {
      oldLeft = hunk[1] === undefined ? 1 : Number(hunk[1]);
      newLeft = hunk[2] === undefined ? 1 : Number(hunk[2]);
      if (currentPath) {
        const arr = byFile.get(currentPath) ?? [];
        if (arr.length < INTENT_LIMITS.maxHunkHeadersPerFile) {
          arr.push(line.slice(0, INTENT_LIMITS.hunkHeaderChars));
        }
        byFile.set(currentPath, arr);
      }
    }
  }
  return [...byFile.entries()]
    .slice(0, INTENT_LIMITS.maxFiles)
    .map(([path, headers]) => ({ path, headers }));
}
