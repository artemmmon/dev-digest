/* FindingsPopover — read-only preview of the findings of a PR's latest review run,
   shown while the FINDINGS cell is hovered. Ported from FindingsTooltip in
   docs/design/src/prdetail_runs.jsx. Deliberately has NO actions: accepting or
   rejecting a finding happens on the PR page, not here. */
"use client";

import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, CategoryTag, ConfidenceNum, type Severity } from "@devdigest/ui";
import type { Category } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { lineLabel, stripMd } from "./helpers";
import { s } from "./styles";

export function FindingsPopover({
  findings,
  total,
  loading,
  placement,
}: {
  findings: FindingRecord[];
  /** Count from the list payload — known before the previews finish loading. */
  total: number;
  loading: boolean;
  placement: "up" | "down";
}) {
  const t = useTranslations("prReview");
  return (
    <div style={s.popover(placement)}>
      <div style={s.header}>
        <Icon.AlertOctagon size={12} />
        {t("list.findingsPopover.title", { count: total })}
      </div>
      {findings.length === 0 ? (
        <span style={s.note}>
          {loading ? t("list.findingsPopover.loading") : t("list.findingsPopover.empty")}
        </span>
      ) : (
        <div style={s.list}>
          {findings.map((f, i) => (
            <div key={f.id} style={s.item(i === findings.length - 1)}>
              <div style={s.titleRow}>
                <SeverityBadge severity={f.severity as Severity} compact />
                <span style={s.title}>{f.title}</span>
                <CategoryTag category={f.category as Category} />
              </div>
              <div style={s.metaRow}>
                <span className="mono" style={s.file}>
                  {f.file}:{lineLabel(f)}
                </span>
                <ConfidenceNum value={f.confidence} />
              </div>
              <div style={s.rationale}>{stripMd(f.rationale)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
