/* MetricCards — recall, precision and citation accuracy of the latest counted run as whole percentages,
   each with its change in whole points against the previous counted run, plus "Traces passed"
   (design artboard `agent-evals`, EvalMetricStrip). A missing value shows `—` (AC-34, AC-37). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalRunSummary } from "@devdigest/shared";
import {
  EVAL_METRICS,
  METRIC_LABEL_KEY,
  NO_VALUE,
  deltaPoints,
  formatMetric,
  passedOfCompleted,
} from "../helpers";
import { METRIC_COLOR } from "../constants";
import { s } from "./styles";

export interface MetricCardsProps {
  /** The latest counted run (AC-66), or null when the agent has none. */
  latest: EvalRunSummary | null;
  /** The counted run before it, or null; without it no change is shown. */
  previous: EvalRunSummary | null;
}

export function MetricCards({ latest, previous }: MetricCardsProps) {
  const t = useTranslations("eval");
  return (
    <div style={s.row}>
      {EVAL_METRICS.map((metric) => {
        const change = latest && previous ? deltaPoints(latest[metric], previous[metric]) : null;
        return (
          <div key={metric} style={s.card} data-testid={`metric-${metric}`}>
            <div style={s.label}>{t(`metricCards.${METRIC_LABEL_KEY[metric]}`)}</div>
            <div style={s.valueRow}>
              <span className="tnum" style={s.value(METRIC_COLOR[metric])}>
                {formatMetric(latest?.[metric])}
              </span>
              {change != null && (
                <span className="tnum" style={s.delta(change >= 0)}>
                  {change >= 0
                    ? t("metricCards.deltaUp", { points: change })
                    : t("metricCards.deltaDown", { points: Math.abs(change) })}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <div style={s.card} data-testid="metric-traces">
        <div style={s.label}>{t("metricCards.tracesPassed")}</div>
        <div style={s.valueRow}>
          <span className="tnum" style={s.value("var(--text-secondary)")}>
            {latest ? passedOfCompleted(latest) : NO_VALUE}
          </span>
        </div>
      </div>
    </div>
  );
}
