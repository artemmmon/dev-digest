/**
 * Small gitignore-like glob matcher (pure — no I/O), shared by the review diff
 * filter (`modules/reviews/diff-filter.ts`) and the Smart Diff classifier
 * (`modules/smart-diff/classify.ts`). Moved here so a module never reaches into
 * another module's internals for it (onion-architecture: `_shared` may be
 * imported across modules).
 *
 * Pattern forms:
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

export function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => cachedPattern(pattern).test(path));
}
