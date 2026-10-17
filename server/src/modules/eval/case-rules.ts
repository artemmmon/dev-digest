import { parseUnifiedDiff } from '@devdigest/reviewer-core';
import type { EvalCaseSave, UnifiedDiff } from '@devdigest/shared';
import { matchesAny } from '../_shared/glob.js';
import { newSideRanges, type LineRange } from '../_shared/hunks.js';
import { excludeFromReview, partitionSkills, REVIEW_EXCLUDED_PATHS } from '../reviews/index.js';
import { EXCLUDED_FILE_MESSAGE, NO_HUNK_MESSAGE, NO_INTERSECT_MESSAGE } from './constants.js';

/**
 * Pure rules a case diff and its expectation must satisfy (AC-11, AC-63, AC-64) and the
 * deterministic pre-processing a case gets before it is reviewed (AC-21). No I/O.
 * Every regex is anchored; nothing loops over a model- or user-supplied line range.
 */

/** Section header of one file inside a unified diff. */
const GIT_HEADER = /^diff --git a\/(.+?) b\/(.+)$/;
/** `--- a/<p>` (or `--- /dev/null` for a new file). */
const OLD_FILE = /^--- (?:a\/.+|\/dev\/null)$/;
/** `+++ b/<p>`; the path is read from group 1. */
const NEW_FILE = /^\+\+\+ b\/(.+)$/;
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/;

/**
 * Case diffs are typed or seeded as `--- a/<p>` + `+++ b/<p>` + hunks, with no `diff --git`
 * line. `excludeFromReview` filters the RAW text by `diff --git` sections, so such a diff would
 * survive it whole. Insert `diff --git a/<p> b/<p>` before every `---`/`+++` pair that has no
 * header of its own; a diff that already has headers is returned unchanged (idempotent).
 */
export function normalizeCaseDiff(raw: string): string {
  const lines = raw.split('\n');
  const out: string[] = [];
  // true between a `diff --git` line and the first `---` / `@@` line that follows it
  let inHeader = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (GIT_HEADER.test(line)) {
      inHeader = true;
      out.push(line);
      continue;
    }
    if (OLD_FILE.test(line)) {
      const next = lines[i + 1];
      const target = next === undefined ? null : NEW_FILE.exec(next.trimEnd());
      if (!inHeader && target) {
        const path = target[1]!.trim();
        const oldPath = line.startsWith('--- a/') ? line.slice(6).trim() : path;
        out.push(`diff --git a/${oldPath} b/${path}`);
      }
      inHeader = false;
      out.push(line);
      continue;
    }
    if (HUNK_HEADER.test(line)) inHeader = false;
    out.push(line);
  }
  return out.join('\n');
}

/** True when the diff holds at least one `@@ … @@` hunk header. */
export function hasHunk(raw: string): boolean {
  return raw.split('\n').some((line) => HUNK_HEADER.test(line));
}

/**
 * New-side line ranges per file of a case diff (path → ranges, one per hunk). A file whose
 * hunks add no new-side line maps to an empty array.
 */
export function fileRanges(raw: string): Map<string, LineRange[]> {
  const result = new Map<string, LineRange[]>();
  let path: string | null = null;
  let body: string[] = [];
  let seenHunk = false;

  const flush = () => {
    if (path !== null) {
      result.set(path, [...(result.get(path) ?? []), ...newSideRanges(body.join('\n'))]);
    }
    path = null;
    body = [];
    seenHunk = false;
  };

  for (const line of normalizeCaseDiff(raw).split('\n')) {
    const header = GIT_HEADER.exec(line);
    if (header) {
      flush();
      path = header[2]!.trim();
      continue;
    }
    if (path === null) continue;
    if (!seenHunk && line.startsWith('+++ ')) {
      // `+++ b/<path>` is the authoritative new-side path (handles renames).
      const p = line.slice(4).replace(/^b\//, '').trim();
      if (p !== '' && p !== '/dev/null') path = p;
      continue;
    }
    if (HUNK_HEADER.test(line)) seenHunk = true;
    body.push(line);
  }
  flush();
  return result;
}

/** A path a pull-request review would never send to the model (generated / fixture files). */
export function isExcludedFile(path: string): boolean {
  return matchesAny(path, REVIEW_EXCLUDED_PATHS);
}

/** A rule a save broke: the field path (zod-issue style) and the message to show. */
export interface CaseRuleViolation {
  path: string[];
  message: string;
}

/**
 * The rules zod cannot express: the diff has a hunk (AC-11), the expectation's file is not an
 * excluded one (AC-63/AC-64), and the expectation's range intersects a hunk of that file
 * (AC-11). Name, sizes and `start_line <= end_line` are the contract's job. Returns the first
 * violation, or null.
 */
export function checkCaseSave(save: EvalCaseSave): CaseRuleViolation | null {
  if (!hasHunk(save.input_diff)) {
    return { path: ['input_diff'], message: NO_HUNK_MESSAGE };
  }
  const { file, start_line, end_line } = save.expected_output;
  if (isExcludedFile(file)) {
    return { path: ['expected_output', 'file'], message: EXCLUDED_FILE_MESSAGE };
  }
  const ranges = fileRanges(save.input_diff).get(file) ?? [];
  const intersects = ranges.some((r) => r.start <= end_line && start_line <= r.end);
  if (!intersects) {
    return { path: ['expected_output', 'start_line'], message: NO_INTERSECT_MESSAGE };
  }
  return null;
}

/** A case diff ready for the engine: normalised, parsed, generated/fixture files removed. */
export interface PreparedCaseDiff {
  diff: UnifiedDiff;
  /** Paths of the files that remain, for the skill `applies_to` gate. */
  paths: string[];
}

/** The same deterministic pre-processing a pull-request review gets (AC-21). */
export function prepareCaseDiff(raw: string): PreparedCaseDiff {
  const { diff } = excludeFromReview(parseUnifiedDiff(normalizeCaseDiff(raw)));
  return { diff, paths: diff.files.map((f) => f.path) };
}

/** Skills that reach the prompt for a case with these changed `paths`, in binding order. */
export function appliedSkills<S extends { appliesTo: string[] | null }>(
  skills: S[],
  paths: string[],
): S[] {
  return partitionSkills(skills, paths).applicable;
}
