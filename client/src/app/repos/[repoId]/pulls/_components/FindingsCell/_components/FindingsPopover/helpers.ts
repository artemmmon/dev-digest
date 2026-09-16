import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { SEVERITY_LIST } from "@/lib/severity-counts";

/**
 * The PR's latest review RUN — the same row the list's score and severity counts come
 * from on the server (newest review with `kind === "review"`; reviews arrive newest-first).
 */
export function latestRunFindings(reviews: ReviewRecord[] | undefined): FindingRecord[] {
  const latest = reviews?.find((r) => r.kind === "review");
  if (!latest) return [];
  const order = (f: FindingRecord) => {
    const i = SEVERITY_LIST.indexOf(f.severity as (typeof SEVERITY_LIST)[number]);
    return i === -1 ? SEVERITY_LIST.length : i;
  };
  return [...latest.findings].sort((a, b) => order(a) - order(b));
}

/** `12` for a single line, `12-18` for a range. */
export function lineLabel(f: FindingRecord): string {
  return f.end_line !== f.start_line ? `${f.start_line}-${f.end_line}` : `${f.start_line}`;
}

/** Bold/code markers removed — previews are one flat paragraph, not rendered markdown. */
export function stripMd(text: string): string {
  return (text ?? "").replace(/\*\*|`/g, "");
}
