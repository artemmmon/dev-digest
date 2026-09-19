import type { Finding, UnifiedDiff } from '@devdigest/shared';

/**
 * Citation grounding — the mandatory mechanical gate for diff-findings.
 *
 * A diff-finding is kept ONLY if its [start_line, end_line] range intersects a
 * real hunk in the unified diff for the same file. Findings that fail are
 * dropped (the model "hallucinated" a location).
 *
 * EXCEPTION: findings from full-file scanners (hooks / blast / onboarding) are
 * not tied to a diff hunk — they ground against the file existing in the diff
 * (or are exempted entirely). We treat `kind` in {secret_leak, lethal_trifecta,
 * phantom, hook} as full-file: they only require the file to be present.
 */

const FULL_FILE_KINDS = new Set(['secret_leak', 'lethal_trifecta', 'phantom', 'hook']);

export interface GroundingResult {
  kept: Finding[];
  dropped: { finding: Finding; reason: string }[];
  /** Kept findings whose `file` was rewritten to the diff's path (see resolveDiffPath). */
  remapped: { from: string; to: string; title: string }[];
}

/** Strip what models commonly prepend to a repo path: `./`, `/`, git's `a/`/`b/`, Windows `\`. */
function normalizePath(p: string): string {
  return p
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/^[ab]\//, '');
}

/**
 * Map the model's `file` onto a path that is really in the diff: exact match,
 * then the normalised form, then a UNIQUE whole-segment suffix match either way
 * (`cost.ts` or `repo/server/cost.ts` for `server/cost.ts`). Ambiguous → null;
 * the line-range check still has to pass afterwards.
 */
function resolveDiffPath(file: string, filesInDiff: Set<string>): string | null {
  if (filesInDiff.has(file)) return file;
  const wanted = normalizePath(file);
  if (!wanted) return null;
  if (filesInDiff.has(wanted)) return wanted;
  const candidates = [...filesInDiff].filter(
    (p) => p.endsWith(`/${wanted}`) || wanted.endsWith(`/${p}`),
  );
  return candidates.length === 1 ? candidates[0]! : null;
}

/** Build a quick lookup of file → set of new-side line numbers covered by hunks. */
export function buildLineIndex(diff: UnifiedDiff): Map<string, Set<number>> {
  const idx = new Map<string, Set<number>>();
  for (const f of diff.files) {
    const set = new Set<number>();
    for (const h of f.hunks) {
      if (h.newLineNumbers && h.newLineNumbers.length > 0) {
        for (const n of h.newLineNumbers) set.add(n);
      } else {
        // fall back to the hunk's declared new range
        for (let n = h.newStart; n < h.newStart + Math.max(h.newLines, 1); n++) set.add(n);
      }
    }
    idx.set(f.path, set);
  }
  return idx;
}

/**
 * Walk the diff's lines, not the finding's range: the range comes from the model
 * and `end_line: 1e9` must not become a billion iterations on the request path.
 */
function rangeIntersects(lines: Set<number>, start: number, end: number): boolean {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  for (const n of lines) if (n >= lo && n <= hi) return true;
  return false;
}

/**
 * Apply the grounding gate to a set of findings against a unified diff.
 * Returns the kept findings and the dropped ones with reasons (for the trace).
 */
export function groundFindings(findings: Finding[], diff: UnifiedDiff): GroundingResult {
  const lineIndex = buildLineIndex(diff);
  const filesInDiff = new Set(diff.files.map((f) => f.path));
  const kept: Finding[] = [];
  const dropped: { finding: Finding; reason: string }[] = [];
  const remapped: GroundingResult['remapped'] = [];

  for (const original of findings) {
    const isFullFile = original.kind ? FULL_FILE_KINDS.has(original.kind) : false;

    const path = resolveDiffPath(original.file, filesInDiff);
    if (!path) {
      dropped.push({ finding: original, reason: `file '${original.file}' not present in diff` });
      continue;
    }
    const finding = path === original.file ? original : { ...original, file: path };
    const keep = () => {
      kept.push(finding);
      if (finding !== original) {
        remapped.push({ from: original.file, to: finding.file, title: finding.title });
      }
    };

    // full-file scanners only need the file to be in the diff
    const lines = lineIndex.get(finding.file) ?? new Set<number>();
    if (isFullFile || rangeIntersects(lines, finding.start_line, finding.end_line)) {
      keep();
    } else {
      dropped.push({
        finding,
        reason: `lines ${finding.start_line}-${finding.end_line} do not intersect any diff hunk in '${finding.file}'`,
      });
    }
  }

  return { kept, dropped, remapped };
}

/** Human-readable summary, e.g. "3/3 passed" used in run-trace stats. */
export function groundingSummary(result: GroundingResult): string {
  const total = result.kept.length + result.dropped.length;
  return `${result.kept.length}/${total} passed`;
}
