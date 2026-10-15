/* TrendChart — recall, precision and citation accuracy as three lines, one point per counted run in
   chronological order (AC-58, AC-66). A metric a run has no value for leaves a gap, not a zero. Hovering
   a point, or moving across the points with the arrow keys once the chart has focus, shows that run's
   agent version and cost (AC-59). Recharts is already a dependency; the vendored `LineChart` has no
   tooltip and no gaps, so this chart is its own. */
"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, SectionLabel, Skeleton } from "@devdigest/ui";
import { formatCost } from "@/lib/format-cost";
import { useEvalTrend } from "@/lib/hooks";
import { EVAL_METRICS, METRIC_LABEL_KEY, NO_VALUE } from "../helpers";
import { METRIC_COLOR } from "../constants";
import { TREND_CHART_HEIGHT, TREND_LEGEND_KEY, TREND_Y_DOMAIN, TREND_Y_TICKS } from "./constants";
import { trendRows, type TrendRow } from "./helpers";
import { s } from "./styles";

export interface TrendChartProps {
  agentId: string;
}

interface TooltipContentProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: TrendRow }>;
}

/** What the tooltip says about the run under the pointer or the keyboard cursor (AC-59). */
function TrendTooltip({ active, payload }: TooltipContentProps) {
  const t = useTranslations("eval");
  const format = useFormatter();
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div style={s.tooltip} data-testid="trend-tooltip">
      <div style={s.tooltipHead}>
        {format.dateTime(new Date(row.startedAt), { dateStyle: "medium", timeStyle: "short" })}
      </div>
      <div style={s.tooltipRow}>
        <span>{t("trendChart.tooltipVersion")}</span>
        <span className="tnum">{t("runsTable.versionValue", { version: row.version })}</span>
      </div>
      <div style={s.tooltipRow}>
        <span>{t("trendChart.tooltipCost")}</span>
        <span className="tnum">{formatCost(row.cost)}</span>
      </div>
      {EVAL_METRICS.map((metric) => (
        <div key={metric} style={s.tooltipRow}>
          <span>{t(`metricCards.${METRIC_LABEL_KEY[metric]}`)}</span>
          <span className="tnum">{row[metric] == null ? NO_VALUE : `${row[metric]}%`}</span>
        </div>
      ))}
    </div>
  );
}

export function TrendChart({ agentId }: TrendChartProps) {
  const t = useTranslations("eval");
  const trendQ = useEvalTrend(agentId);
  const rows = React.useMemo(() => trendRows(trendQ.data?.points ?? []), [trendQ.data]);

  let body: React.ReactNode;
  if (trendQ.isError) {
    body = <p style={s.message}>{t("trendChart.loadError")}</p>;
  } else if (!trendQ.data) {
    body = <Skeleton height={TREND_CHART_HEIGHT} />;
  } else if (rows.length === 0) {
    body = <p style={s.message}>{t("trendChart.empty")}</p>;
  } else {
    body = (
      <div style={s.plot} role="group" aria-label={t("trendChart.chartLabel")}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} accessibilityLayer margin={{ top: 8, right: 14, bottom: 4, left: -8 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={TREND_Y_DOMAIN}
              ticks={TREND_Y_TICKS}
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              tickFormatter={(v: number) => `${v}%`}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: "var(--border-strong)" }} />
            {EVAL_METRICS.map((metric) => (
              <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                name={t(`metricCards.${METRIC_LABEL_KEY[metric]}`)}
                stroke={METRIC_COLOR[metric]}
                strokeWidth={2}
                connectNulls={false}
                dot={{ r: 3, strokeWidth: 0, fill: METRIC_COLOR[metric] }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <Card style={s.card}>
      <div style={s.head}>
        <SectionLabel icon="TrendingUp">{t("trendChart.title")}</SectionLabel>
        <ul style={s.legend}>
          {EVAL_METRICS.map((metric) => (
            <li key={metric} style={s.legendItem}>
              <span style={s.swatch(METRIC_COLOR[metric])} />
              <span style={s.legendText}>{t(`trendChart.legend.${TREND_LEGEND_KEY[metric]}`)}</span>
            </li>
          ))}
        </ul>
      </div>
      {body}
    </Card>
  );
}
