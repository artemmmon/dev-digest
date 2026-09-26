import type { Finding, Severity } from '@devdigest/shared';

/**
 * Deterministic post-filter for `Finding.scope` (D12), run AFTER citation
 * grounding. The model classifies meaning (`scope: in_scope | out_of_scope`);
 * this module enforces the count and threshold — it never re-judges severity
 * and never silently drops a serious finding: below `minSignalSeverity` is
 * dropped, at or above it is folded into exactly ONE `out_of_scope` signal
 * finding per call (i.e. per agent run) that lists every folded finding.
 *
 * A finding is out of scope when the agent tagged it `out_of_scope`, OR when it
 * lies inside one of `outOfScopeRanges` — the hunks the intent classifier judged
 * unrelated to the stated goal. The range check is deterministic, so it works
 * even when an agent model ignores or mis-sets the `scope` tag. Otherwise an
 * untagged finding counts as in-scope, so nothing is lost.
 */

/** A new-side line range (inclusive) of one changed hunk. */
export interface ScopeRange {
  path: string;
  start_line: number;
  end_line: number;
}

export interface ScopeFilter {
  minSignalSeverity: Severity;
  /** Hunks unrelated to the PR's intent; a finding overlapping one is out of scope. */
  outOfScopeRanges?: ScopeRange[];
}

export interface ScopePolicyResult {
  /** In-scope findings, untouched, plus (when any serious out-of-scope finding
   *  exists) exactly one signal finding, `kind: 'out_of_scope'`. */
  kept: Finding[];
  /** Below-threshold out-of-scope findings that were dropped outright. */
  dropped: { finding: Finding; reason: string }[];
  /** How many minor (below-threshold) findings were dropped. */
  droppedMinor: number;
  /** How many at-or-above-threshold findings were folded into the signal. */
  foldedSerious: number;
}

const SEVERITY_RANK: Record<Severity, number> = { SUGGESTION: 0, WARNING: 1, CRITICAL: 2 };

function severityRank(severity: Severity): number {
  return SEVERITY_RANK[severity] ?? 0;
}

/** Deterministic ordering for the folded list and the anchor pick: severity
 *  desc, confidence desc, file asc, line asc. */
function compareFindings(a: Finding, b: Finding): number {
  const bySeverity = severityRank(b.severity) - severityRank(a.severity);
  if (bySeverity !== 0) return bySeverity;
  const byConfidence = b.confidence - a.confidence;
  if (byConfidence !== 0) return byConfidence;
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  return a.start_line - b.start_line;
}

function inRanges(finding: Finding, ranges: ScopeRange[] | undefined): boolean {
  if (!ranges || ranges.length === 0) return false;
  return ranges.some(
    (r) =>
      r.path === finding.file &&
      finding.start_line <= r.end_line &&
      finding.end_line >= r.start_line,
  );
}

/**
 * Apply the scope policy to a set of GROUNDED findings. `scopeFilter`
 * undefined means "no filtering" (identity) — tier < medium or a stale intent.
 */
export function applyScopePolicy(
  findings: Finding[],
  scopeFilter?: ScopeFilter,
): ScopePolicyResult {
  if (!scopeFilter) {
    return { kept: findings, dropped: [], droppedMinor: 0, foldedSerious: 0 };
  }

  const inScope: Finding[] = [];
  const outOfScope: Finding[] = [];
  for (const finding of findings) {
    if (finding.scope === 'out_of_scope' || inRanges(finding, scopeFilter.outOfScopeRanges)) {
      outOfScope.push({ ...finding, scope: 'out_of_scope' });
    } else {
      inScope.push(finding);
    }
  }
  if (outOfScope.length === 0) {
    return { kept: findings, dropped: [], droppedMinor: 0, foldedSerious: 0 };
  }

  const threshold = severityRank(scopeFilter.minSignalSeverity);
  const minor = outOfScope.filter((f) => severityRank(f.severity) < threshold);
  const serious = outOfScope
    .filter((f) => severityRank(f.severity) >= threshold)
    .sort(compareFindings);

  const dropped = minor.map((finding) => ({ finding, reason: 'out_of_scope' }));

  if (serious.length === 0) {
    return { kept: inScope, dropped, droppedMinor: minor.length, foldedSerious: 0 };
  }

  const top = serious[0]!;
  const rationale = serious
    .map((f) => `- [${f.severity}] ${f.file}:${f.start_line} — ${f.title}`)
    .join('\n');
  const signal: Finding = {
    id: `out-of-scope-${top.id}`,
    severity: top.severity,
    category: top.category,
    title: `Serious issue outside this PR's stated scope (${serious.length})`,
    file: top.file,
    start_line: top.start_line,
    end_line: top.end_line,
    rationale: `Findings outside this PR's stated scope, kept because they are ${scopeFilter.minSignalSeverity} or above:\n${rationale}`,
    confidence: top.confidence,
    kind: 'out_of_scope',
    scope: 'out_of_scope',
  };

  return {
    kept: [...inScope, signal],
    dropped,
    droppedMinor: minor.length,
    foldedSerious: serious.length,
  };
}
