/* FindingsCell — the PR list FINDINGS column: severity icon+count cluster for the PR's
   latest review run, with a read-only hover popover previewing those findings.
   The counts come with the list payload (`PrMeta.findings_by_severity`); the previews
   are fetched lazily, only while the cell is hovered. */
"use client";

import React from "react";
import type { CSSProperties } from "react";
import type { PrMeta } from "@/lib/types";
import { SeverityCounts } from "@/components/severity-counts";
import { SEVERITY_LIST, isEmptyCounts } from "@/lib/severity-counts";
import { usePrReviews } from "@/lib/hooks/reviews";
import { FindingsPopover } from "./_components/FindingsPopover";
import { latestRoundFindings } from "./_components/FindingsPopover/helpers";

const s = {
  wrap: {
    position: "relative",
    display: "inline-flex",
    width: "fit-content",
    cursor: "help",
  } satisfies CSSProperties,
  muted: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;

export function FindingsCell({
  pr,
  placement = "down",
}: {
  pr: PrMeta;
  /** Rows in the lower half open their popover upwards so it stays on screen. */
  placement?: "up" | "down";
}) {
  const [hovered, setHovered] = React.useState(false);
  const counts = pr.findings_by_severity;
  // Only fetch previews while hovered — the list itself never loads findings.
  const { data: reviews, isLoading } = usePrReviews(pr.id, { enabled: hovered });

  if (isEmptyCounts(counts)) return <span style={s.muted}>—</span>;

  const total = SEVERITY_LIST.reduce((sum, sev) => sum + (counts![sev] ?? 0), 0);
  return (
    <span
      style={s.wrap}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // The whole row navigates on click; the popover is a reading surface.
      onClick={(e) => e.stopPropagation()}
    >
      <SeverityCounts counts={counts} underline />
      {hovered && (
        <FindingsPopover
          findings={latestRoundFindings(reviews)}
          total={total}
          loading={isLoading}
          placement={placement}
        />
      )}
    </span>
  );
}
