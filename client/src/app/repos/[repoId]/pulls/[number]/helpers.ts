/* helpers.ts — pure helpers of the PR detail page. */
import type { DiffFocus } from "@/components/diff-viewer";

/**
 * The Files changed jump target from the URL's `file` / `line` params. The values are only
 * compared with the PR's file list and shown as text: a path that is not in the diff changes
 * nothing (→ undefined), and a line counts only as a positive safe integer (else null).
 */
export function parseDiffFocus(
  file: string | null,
  line: string | null,
  paths: readonly string[],
): DiffFocus | undefined {
  if (file == null || !paths.includes(file)) return undefined;
  const lineNo = line != null && /^[1-9]\d*$/.test(line) ? Number(line) : null;
  return { path: file, line: lineNo != null && Number.isSafeInteger(lineNo) ? lineNo : null };
}
