/* SeverityCounts — compact severity icon + count cluster. Ported from RunFindings in
   docs/design/src/prdetail_runs.jsx; shared by the PR list FINDINGS cell and the
   Agent-runs timeline tiles. Display only: it never fetches and never filters. */
"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingsBySeverity } from "@devdigest/shared";
import { SEVERITY_LIST, isEmptyCounts } from "@/lib/severity-counts";

const s = {
  row: { display: "inline-flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  item: (color: string, underline: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11.5,
    fontWeight: 600,
    color,
    borderBottom: underline ? `1px dotted ${color}` : undefined,
    paddingBottom: underline ? 1 : undefined,
  }),
} as const;

/**
 * Renders only the severities that actually occur, most severe first.
 * All-zero (or absent) counts render nothing — callers show their own "—".
 * `underline` marks the cluster as a hover target (the PR list popover).
 */
export function SeverityCounts({
  counts,
  underline = false,
}: {
  counts: FindingsBySeverity | null | undefined;
  underline?: boolean;
}) {
  const t = useTranslations("common");
  if (isEmptyCounts(counts)) return null;
  return (
    <span style={s.row}>
      {SEVERITY_LIST.filter((sev) => (counts![sev] ?? 0) > 0).map((sev) => {
        const meta = SEV[sev];
        const I = Icon[meta.icon];
        return (
          <span
            key={sev}
            style={s.item(meta.c, underline)}
            title={t(`severity.${sev}`)}
            aria-label={`${counts![sev]} ${t(`severity.${sev}`)}`}
          >
            <I size={12} />
            <span className="tnum">{counts![sev]}</span>
          </span>
        );
      })}
    </span>
  );
}
