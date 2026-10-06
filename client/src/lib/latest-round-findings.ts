import type { FindingRecord, ReviewRecord, Verdict } from "@devdigest/shared";
import { SEVERITY_LIST } from "@/lib/severity-counts";

/**
 * Findings of the PR's latest review ROUND — every agent started by one click on Run
 * Review, identified by a shared `batch_id`. This must stay the same rule the server
 * counts with (`server/src/modules/pulls/findings.ts`), or the icons and the popover
 * disagree: the newest single review is an arbitrary agent of the round, often a clean
 * one next to another that found four problems.
 *
 * Reviews arrive newest-first. Rows without a `batch_id` (seeded/unbatched) fall back
 * to the newest review alone.
 */
export function latestRoundFindings(reviews: ReviewRecord[] | undefined): FindingRecord[] {
  const order = (f: FindingRecord) => {
    const i = SEVERITY_LIST.indexOf(f.severity as (typeof SEVERITY_LIST)[number]);
    return i === -1 ? SEVERITY_LIST.length : i;
  };
  return latestRound(reviews)
    .flatMap((r) => r.findings)
    .sort((a, b) => order(a) - order(b));
}

/** The reviews of the latest round (see `latestRoundFindings`); empty when the PR has no review. */
function latestRound(reviews: ReviewRecord[] | undefined): ReviewRecord[] {
  const newest = reviews?.find((r) => r.kind === "review");
  if (!newest) return [];
  return newest.batch_id
    ? reviews!.filter((r) => r.kind === "review" && r.batch_id === newest.batch_id)
    : [newest];
}

/** Verdicts from the most to the least severe — the order the banner picks one from a round. */
const VERDICT_SEVERITY: readonly Verdict[] = ["request_changes", "comment", "approve"];

export interface LatestRoundSummary {
  /** The most severe verdict of the round; null when none of its reviews carries one. */
  verdict: Verdict | null;
  findingsCount: number;
  /** CRITICAL findings that are not dismissed. */
  blockers: number;
}

/**
 * Headline of the latest review round for the PR Brief banner, or null when the PR has no
 * review. Uses the same round rule as `latestRoundFindings`.
 */
export function latestRoundSummary(reviews: ReviewRecord[] | undefined): LatestRoundSummary | null {
  const round = latestRound(reviews);
  if (round.length === 0) return null;
  const verdicts = round.map((r) => r.verdict).filter((v): v is Verdict => v != null);
  const verdict = VERDICT_SEVERITY.find((v) => verdicts.includes(v)) ?? null;
  const findings = round.flatMap((r) => r.findings);
  return {
    verdict,
    findingsCount: findings.length,
    blockers: findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length,
  };
}
