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
import { latestRoundFindings } from "@/lib/latest-round-findings";
import { FindingsPopover } from "./_components/FindingsPopover";

/**
 * Grace period before a leave actually closes the popover. The pointer briefly leaves the
 * narrow icon cluster on any diagonal approach to the 360px card; without this the popover
 * is unreachable.
 */
const CLOSE_DELAY_MS = 150;

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
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const counts = pr.findings_by_severity;

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  const open = React.useCallback(() => {
    cancelClose();
    setHovered(true);
  }, [cancelClose]);
  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setHovered(false), CLOSE_DELAY_MS);
  }, [cancelClose]);
  // Nothing may fire after the row unmounts (filtering, refetch, navigation).
  React.useEffect(() => cancelClose, [cancelClose]);
  // Only fetch previews while hovered — the list itself never loads findings.
  const { data: reviews, isLoading } = usePrReviews(pr.id, { enabled: hovered });

  if (isEmptyCounts(counts)) return <span style={s.muted}>—</span>;

  const total = SEVERITY_LIST.reduce((sum, sev) => sum + (counts![sev] ?? 0), 0);
  return (
    <span
      style={s.wrap}
      // The popover is a DOM child of this span, so landing on it re-fires onMouseEnter
      // and cancels the pending close.
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
      // The whole row navigates on click; the popover is a reading surface, so the row leaves it alone.
      data-row-ignore
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
