import type { UnifiedDiff } from '@devdigest/shared';
import { REVIEW_EXCLUDED_PATHS } from './constants.js';
import { matchesAny } from '../_shared/glob.js';

/**
 * Drop generated / fixture files from a diff before it is reviewed (pure — no DB,
 * unit-tests cleanly). Both `files` AND `raw` are filtered: the prompt is built
 * from `raw` (`reviewer-core/src/review/run.ts`), so filtering only `files` would
 * still send the excluded content to the model.
 *
 * Grounding uses the same filtered diff, so a finding about an excluded file is
 * dropped with "file '…' not present in diff" — which is the intended outcome.
 *
 * The glob matcher itself now lives in `../_shared/glob.js` (also used by the
 * Smart Diff classifier); re-exported here so existing callers/tests keep working.
 */

/** Section header of one file inside a unified diff. */
const FILE_HEADER = /^diff --git a\/(.+?) b\/(.+)$/;

export { matchesAny };

export interface DiffFilterResult {
  diff: UnifiedDiff;
  /** Paths removed, in diff order — logged to the run trace. */
  excluded: string[];
}

/**
 * Remove every `diff --git` section whose path matches `patterns`. A section whose
 * path cannot be resolved is always kept, so an unparseable `raw` degrades to a
 * no-op rather than to a `raw` that disagrees with `files`.
 */
export function excludeFromReview(
  diff: UnifiedDiff,
  patterns: string[] = REVIEW_EXCLUDED_PATHS,
): DiffFilterResult {
  const excluded = diff.files.map((f) => f.path).filter((p) => matchesAny(p, patterns));
  if (excluded.length === 0) return { diff, excluded: [] };

  const drop = new Set(excluded);
  return {
    diff: {
      raw: stripSections(diff.raw, drop),
      files: diff.files.filter((f) => !drop.has(f.path)),
    },
    excluded,
  };
}

/** Rebuild the raw diff text without the sections of `drop`. */
function stripSections(raw: string, drop: Set<string>): string {
  const lines = raw.split('\n');
  const out: string[] = [];
  let section: string[] | null = null;
  let path = '';

  const flush = () => {
    if (section && !drop.has(path)) out.push(...section);
    section = null;
    path = '';
  };

  for (const line of lines) {
    const header = line.match(FILE_HEADER);
    if (header) {
      flush();
      section = [line];
      path = header[2] ?? '';
      continue;
    }
    if (!section) {
      out.push(line); // preamble before the first file section
      continue;
    }
    // `+++ b/<path>` is the authoritative new-side path (handles renames).
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).replace(/^b\//, '').trim();
      if (p !== '/dev/null') path = p;
    }
    section.push(line);
  }
  flush();
  return out.join('\n');
}
