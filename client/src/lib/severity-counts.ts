import type { FindingsBySeverity, FindingRecord } from "@devdigest/shared";

/**
 * Severity tallies for findings already in hand — a plain grouping, never a new
 * request. Mirrors the server-side rollup used by the PR list
 * (`server/src/modules/pulls/findings.ts`).
 */

/** Wire severities, most severe first — the order every counter renders in. */
export const SEVERITY_LIST = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

export type CountedSeverity = (typeof SEVERITY_LIST)[number];

export const EMPTY_SEVERITY_COUNTS: FindingsBySeverity = {
  CRITICAL: 0,
  WARNING: 0,
  SUGGESTION: 0,
};

/** Tally a finding list by severity. Severities outside the contract are ignored. */
export function countBySeverity(findings: readonly FindingRecord[]): FindingsBySeverity {
  const counts = { ...EMPTY_SEVERITY_COUNTS };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity as CountedSeverity] += 1;
  }
  return counts;
}

/** True when there is nothing to show — the UI renders "—" instead of three zeros. */
export function isEmptyCounts(counts: FindingsBySeverity | null | undefined): boolean {
  return counts == null || SEVERITY_LIST.every((sev) => (counts[sev] ?? 0) === 0);
}
