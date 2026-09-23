import type { UnifiedDiff } from '@devdigest/shared';
import { REVIEW_EXCLUDED_PATHS } from './constants.js';

/**
 * Drop generated / fixture files from a diff before it is reviewed (pure — no DB,
 * unit-tests cleanly). Both `files` AND `raw` are filtered: the prompt is built
 * from `raw` (`reviewer-core/src/review/run.ts`), so filtering only `files` would
 * still send the excluded content to the model.
 *
 * Grounding uses the same filtered diff, so a finding about an excluded file is
 * dropped with "file '…' not present in diff" — which is the intended outcome.
 */

/** Section header of one file inside a unified diff. */
const FILE_HEADER = /^diff --git a\/(.+?) b\/(.+)$/;

/**
 * Pattern forms (gitignore-like, small on purpose — see `matchesAny`):
 *  - no `/` and no wildcard → exact full-path match (e.g. `LICENSE`)
 *  - no `/` with a wildcard → matches the basename at any depth (e.g. `*.lock`, `*.g.dart`)
 *  - `dir` + slash + `**`    → rooted prefix, everything under `dir/`
 *  - `**` + slash + `name`  → `name` (itself a path, may contain `*`/`?`/`/`) at any depth
 *  - `*` within a segment matches anything but `/`; `?` matches one such character
 */
const patternCache = new Map<string, RegExp>();

function escapeLiteral(ch: string): string {
  return ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/** Translate one path segment: `*` -> any run of non-`/` chars, `?` -> one such char. */
function translateSegment(segment: string): string {
  let out = '';
  for (const ch of segment) {
    if (ch === '*') out += '[^/]*';
    else if (ch === '?') out += '[^/]';
    else out += escapeLiteral(ch);
  }
  return out;
}

function compilePattern(pattern: string): RegExp {
  const hasWildcard = /[*?]/.test(pattern);
  const hasSlash = pattern.includes('/');

  // A bare literal name is an exact full-path match — the one form that does NOT
  // match at any depth, so a pattern like `client/README.md` never matches
  // `server/README.md`. Everything else below is anchored or not, but always a glob.
  if (!hasSlash && !hasWildcard) return new RegExp(`^${escapeLiteral(pattern)}$`);

  let body = pattern;
  let trailingAny = false;
  if (body.endsWith('/**')) {
    body = body.slice(0, -3);
    trailingAny = true;
  }
  let anchored = true;
  if (body.startsWith('**/')) {
    body = body.slice(3);
    anchored = false;
  } else if (!hasSlash) {
    anchored = false; // e.g. `*.lock` — no directory given, so match anywhere
  }

  const translated = body.split('/').map(translateSegment).join('/');
  const prefix = anchored ? '^' : '^(?:.*/)?';
  const suffix = trailingAny ? '/.*$' : '$';
  return new RegExp(prefix + translated + suffix);
}

function cachedPattern(pattern: string): RegExp {
  let regex = patternCache.get(pattern);
  if (!regex) {
    regex = compilePattern(pattern);
    patternCache.set(pattern, regex);
  }
  return regex;
}

export function matchesAny(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => cachedPattern(pattern).test(path));
}

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
