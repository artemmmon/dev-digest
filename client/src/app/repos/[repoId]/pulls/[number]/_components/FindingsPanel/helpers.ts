import type { FindingRecord } from "@devdigest/shared";
import type { CountedSeverity } from "@/lib/severity-counts";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/** Optionally drop low-confidence findings and sort by severity. */
export function visibleFindings(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/**
 * Narrow an already-visible list to one severity. Kept separate from
 * `visibleFindings` so the severity counters can be taken from the full visible set —
 * that is what keeps every pill's number equal to the number of cards it shows.
 */
export function filterBySeverity(
  findings: FindingRecord[],
  severity: CountedSeverity | null,
): FindingRecord[] {
  if (!severity) return findings;
  return findings.filter((f) => f.severity === severity);
}
