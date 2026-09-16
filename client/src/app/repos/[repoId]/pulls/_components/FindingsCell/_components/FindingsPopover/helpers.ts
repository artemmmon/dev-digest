import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
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
  const newest = reviews?.find((r) => r.kind === "review");
  if (!newest) return [];
  const round = newest.batch_id
    ? reviews!.filter((r) => r.kind === "review" && r.batch_id === newest.batch_id)
    : [newest];
  const order = (f: FindingRecord) => {
    const i = SEVERITY_LIST.indexOf(f.severity as (typeof SEVERITY_LIST)[number]);
    return i === -1 ? SEVERITY_LIST.length : i;
  };
  return round.flatMap((r) => r.findings).sort((a, b) => order(a) - order(b));
}

/** `12` for a single line, `12-18` for a range. */
export function lineLabel(f: FindingRecord): string {
  return f.end_line !== f.start_line ? `${f.start_line}-${f.end_line}` : `${f.start_line}`;
}

/** Bold/code markers removed — previews are one flat paragraph, not rendered markdown. */
export function stripMd(text: string): string {
  return (text ?? "").replace(/\*\*|`/g, "");
}
