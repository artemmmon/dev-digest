/* Findings slot for the DiffViewer (Files changed tab). Pure helpers + the API
   shape the viewer needs to render findings inline; `FindingCard` itself is
   rendered through `renderFinding` because `components/` may not import
   `src/app` (client eslint boundary, see client/INSIGHTS.md). */
import type { ReactNode } from "react";
import type { FindingRecord } from "@devdigest/shared";
import { SEVERITY_LIST } from "@/lib/severity-counts";
import { lineKey } from "./comments";

/** What the viewer needs to render a PR's findings inline + out-of-patch. */
export interface DiffFindingApi {
  /** Every finding of the latest review round, across all files. */
  findings: FindingRecord[];
  /** When false, both the inline findings and the out-of-patch block are hidden. */
  show: boolean;
  renderFinding: (f: FindingRecord) => ReactNode;
}

/** The key a finding anchors to — always the new (RIGHT) side, at its start line. */
export function findingKey(f: FindingRecord): string | null {
  return lineKey("RIGHT", f.start_line);
}

/**
 * Split one file's findings into ones matching a rendered line vs. "out of patch"
 * (GitHub's patch doesn't include that line, e.g. it's outside the diff hunks).
 */
export function partitionFindings(
  fileFindings: FindingRecord[],
  renderedKeys: Set<string>,
): { matched: Map<string, FindingRecord[]>; outOfPatch: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const outOfPatch: FindingRecord[] = [];
  for (const f of fileFindings) {
    const key = findingKey(f);
    if (key && renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      outOfPatch.push(f);
    }
  }
  return { matched, outOfPatch };
}

/** The most severe severity in the list (`SEVERITY_LIST` order); null when empty. */
export function worstSeverity(
  list: FindingRecord[],
): (typeof SEVERITY_LIST)[number] | null {
  let best: (typeof SEVERITY_LIST)[number] | null = null;
  let bestIdx: number = SEVERITY_LIST.length;
  for (const f of list) {
    const i = SEVERITY_LIST.indexOf(f.severity as (typeof SEVERITY_LIST)[number]);
    if (i !== -1 && i < bestIdx) {
      bestIdx = i;
      best = f.severity as (typeof SEVERITY_LIST)[number];
    }
  }
  return best;
}
