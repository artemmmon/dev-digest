import type { FindingsBySeverity } from '@devdigest/shared';
import { rollupSeverities } from './status.js';

/**
 * PR-list FINDINGS rollup (pure — no DB, unit-tests cleanly).
 *
 * The list shows the severity breakdown of each PR's LATEST review run: the newest
 * `reviews` row with `kind = 'review'`, i.e. the same review the list's SCORE comes from.
 */

export interface LatestReviewRow {
  prId: string;
  id: string;
}

export interface FindingSeverityRow {
  reviewId: string;
  severity: string;
}

/** Ids of the latest review per PR. `rows` MUST be newest-first. */
export function latestReviewIdByPr(rows: LatestReviewRow[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const r of rows) if (!latest.has(r.prId)) latest.set(r.prId, r.id);
  return latest;
}

/**
 * Severity tally of each PR's latest review. PRs whose latest review found nothing map to
 * all-zero counts; PRs absent from `latestByPr` are absent from the result (the route
 * serialises them as `null` — "never reviewed").
 */
export function severityByPr(
  latestByPr: Map<string, string>,
  findingRows: FindingSeverityRow[],
): Map<string, FindingsBySeverity> {
  const byReview = new Map<string, FindingSeverityRow[]>();
  for (const f of findingRows) {
    const bucket = byReview.get(f.reviewId);
    if (bucket) bucket.push(f);
    else byReview.set(f.reviewId, [f]);
  }
  const out = new Map<string, FindingsBySeverity>();
  for (const [prId, reviewId] of latestByPr) {
    const c = rollupSeverities(byReview.get(reviewId) ?? []);
    out.set(prId, { CRITICAL: c.critical, WARNING: c.warning, SUGGESTION: c.suggestion });
  }
  return out;
}
