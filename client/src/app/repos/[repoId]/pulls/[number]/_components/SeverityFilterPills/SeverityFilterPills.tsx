/* SeverityFilterPills — "N CRITICAL · N WARNING · N SUGGESTION" for one review run.
   Single-select: clicking a pill keeps only that severity, clicking the active pill
   clears the filter. The counts are a plain grouping of the findings already loaded —
   no request, no LLM call. */
"use client";

import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingsBySeverity } from "@devdigest/shared";
import { SEVERITY_LIST, type CountedSeverity } from "@/lib/severity-counts";
import { s } from "./styles";

export function SeverityFilterPills({
  counts,
  active,
  onToggle,
}: {
  counts: FindingsBySeverity;
  /** Currently selected severity, or `null` when the full list is shown. */
  active: CountedSeverity | null;
  onToggle: (severity: CountedSeverity | null) => void;
}) {
  const t = useTranslations("prReview");
  const tc = useTranslations("common");
  // Only severities that actually occur in this run get a pill.
  const present = SEVERITY_LIST.filter((sev) => counts[sev] > 0);
  if (present.length === 0) return null;

  return (
    <div style={s.row} role="group" aria-label={t("panel.severityFilterLabel")}>
      {present.map((sev) => {
        const meta = SEV[sev];
        const I = Icon[meta.icon];
        const isActive = active === sev;
        return (
          <button
            key={sev}
            type="button"
            aria-pressed={isActive}
            // Explicit label: the count and the word are separate nodes, so the
            // computed name would otherwise read "2Warning".
            aria-label={`${counts[sev]} ${tc(`severity.${sev}`)}`}
            title={
              isActive
                ? t("panel.clearSeverityFilter")
                : t("panel.filterBySeverity", { severity: tc(`severity.${sev}`) })
            }
            style={s.pill(meta.c, meta.bg, isActive)}
            onClick={() => onToggle(isActive ? null : sev)}
          >
            <I size={12.5} />
            <span className="tnum">{counts[sev]}</span>
            {tc(`severity.${sev}`)}
          </button>
        );
      })}
    </div>
  );
}
