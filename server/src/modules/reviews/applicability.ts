import { matchesAny } from '../_shared/glob.js';
import { REVIEW_EXCLUDED_PATHS } from './constants.js';

/**
 * `applies_to` gating (spec 07): a skill or agent scoped to `*.dart` never fires on
 * a TS-only PR and vice versa — reuses `diff-filter.ts`'s glob matcher, so the same
 * pattern vocabulary (`*.ext`, `dir` + slash + `**`, `**` + slash + `name`) works for
 * exclusion AND gating.
 *
 * Fails OPEN throughout: no changed-file signal (an empty `pr_files` — a PR nobody
 * has opened yet — or every path happening to be excluded) never silently drops an
 * agent or a skill. `null`/empty `appliesTo` always applies.
 */

/** The changed-file paths a gate should actually judge against — same exclusion the diff gets. */
export function effectivePaths(paths: string[]): string[] {
  return paths.filter((p) => !matchesAny(p, REVIEW_EXCLUDED_PATHS));
}

/** `paths` should already be `effectivePaths`-filtered (callers do it once, not per item). */
export function matchesAppliesTo(appliesTo: string[] | null | undefined, paths: string[]): boolean {
  if (!appliesTo || appliesTo.length === 0) return true;
  if (paths.length === 0) return true;
  return paths.some((p) => matchesAny(p, appliesTo));
}

/** Split resolved skills into what reaches the prompt vs. what a glob mismatch skipped. */
export function partitionSkills<S extends { appliesTo: string[] | null }>(
  skills: S[],
  changedPaths: string[],
): { applicable: S[]; skipped: S[] } {
  const paths = effectivePaths(changedPaths);
  const applicable: S[] = [];
  const skipped: S[] = [];
  for (const s of skills) (matchesAppliesTo(s.appliesTo, paths) ? applicable : skipped).push(s);
  return { applicable, skipped };
}
