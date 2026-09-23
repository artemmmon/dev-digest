/* ScanReport — one collapsed line about the last scan (sampled files, kept/proposed);
   expands to what the evidence gate dropped, the model and the cost. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { ConventionScanReport } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { formatReport } from "../../helpers";
import { s } from "./styles";

export function ScanReport({ report }: { report: ConventionScanReport }) {
  const t = useTranslations("conventions.report");
  const [open, setOpen] = React.useState(false);
  const r = formatReport(report);
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <div style={s.wrap}>
      <button type="button" style={s.toggle} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Chevron size={14} />
        <span style={s.toggleLabel}>{t("toggle")}</span>
        <span>{t("summary", { files: r.files, kept: r.kept, raw: r.raw })}</span>
      </button>
      {open && (
        <dl style={s.details}>
          <dt style={s.term}>{t("kept")}</dt>
          <dd style={s.value}>
            {r.kept} / {r.raw}
            {r.lineCorrected > 0 && ` · ${t("lineCorrected")}: ${r.lineCorrected}`}
          </dd>
          <dt style={s.term}>{t("dropped")}</dt>
          <dd style={s.value}>
            {r.dropped.length === 0
              ? t("droppedNone")
              : r.dropped.map((d) => `${t(`reasons.${d.reason}`)}: ${d.count}`).join(" · ")}
          </dd>
          <dt style={s.term}>{t("model")}</dt>
          <dd className="mono" style={s.value}>
            {r.model}
          </dd>
          <dt style={s.term}>{t("tokens")}</dt>
          <dd className="mono tnum" style={s.value}>
            {r.tokensIn} / {r.tokensOut}
          </dd>
          <dt style={s.term}>{t("cost")}</dt>
          <dd className="mono tnum" style={s.value}>
            {formatCost(r.costUsd)}
          </dd>
          <dt style={s.term}>{t("duration")}</dt>
          <dd className="mono tnum" style={s.value}>
            {t("seconds", { value: r.seconds })}
          </dd>
          {r.configFiles.length > 0 && (
            <>
              <dt style={s.term}>{t("configFiles")}</dt>
              <dd className="mono" style={s.value}>
                {r.configFiles.join(", ")}
              </dd>
            </>
          )}
          <dt style={s.term}>{t("sampled")}</dt>
          <dd style={s.value}>
            <ul className="mono" style={s.list}>
              {r.sampled.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </dd>
        </dl>
      )}
    </div>
  );
}
