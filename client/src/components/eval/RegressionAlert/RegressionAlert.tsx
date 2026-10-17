/* RegressionAlert — names each metric of the latest counted run that fell by at least one whole point
   against the previous counted run, with its drop in points (AC-40). Renders nothing otherwise. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { METRIC_LABEL_KEY, type Regression } from "../helpers";
import { s } from "./styles";

export interface RegressionAlertProps {
  /** From `regressions(latest, previous)`; an empty list renders nothing. */
  regressions: readonly Regression[];
}

export function RegressionAlert({ regressions }: RegressionAlertProps) {
  const t = useTranslations("eval");
  if (regressions.length === 0) return null;
  return (
    <div role="alert" style={s.box}>
      <Icon.AlertTriangle size={15} style={s.icon} />
      <div style={s.body}>
        <div style={s.title}>{t("regressionAlert.title")}</div>
        <ul style={s.list}>
          {regressions.map((r) => (
            <li key={r.metric}>
              {t("regressionAlert.item", {
                metric: t(`metricCards.${METRIC_LABEL_KEY[r.metric]}`),
                points: r.drop,
              })}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
