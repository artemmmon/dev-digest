/* SummaryTiles — the four figures over the whole period: Total runs, Total cost, Avg accept rate and the
   Most-active agent. Each label names the period (AC-12). No data shows "—", never 0. Agent names are text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AgentPerformance } from "@devdigest/shared";
import { EstimateLabel, PartialMark } from "@/components/agent-stats";
import { formatCost } from "@/lib/format-cost";
import { formatPercent } from "@/lib/format-percent";
import { decisionsOf, type StatsPeriodSelection } from "@/lib/stats-period";
import { s } from "./styles";

export function SummaryTiles({
  totals,
  period,
}: {
  totals: AgentPerformance["totals"];
  period: StatsPeriodSelection;
}) {
  const t = useTranslations("agentPerformance");
  const periodName =
    period.period === "custom"
      ? t("tiles.customPeriod", { from: period.from, to: period.to })
      : t(`period.options.${period.period}`);
  const decisions = decisionsOf(totals);

  return (
    <div style={s.grid}>
      <section style={s.tile}>
        <p style={s.label}>{t("tiles.runs", { period: periodName })}</p>
        <div className="tnum" style={s.value}>
          {totals.runs}
        </div>
      </section>

      <section style={s.tile}>
        <p style={s.label}>{t("tiles.cost", { period: periodName })}</p>
        <div className="tnum" style={s.value}>
          {formatCost(totals.total_cost_usd)}
          <EstimateLabel />
          {totals.cost_partial && <PartialMark />}
        </div>
      </section>

      <section style={s.tile}>
        <p style={s.label}>{t("tiles.acceptRate", { period: periodName })}</p>
        <div className="tnum" style={s.value}>
          {formatPercent(totals.accept_rate)}
        </div>
        <div style={s.sub}>
          {t("counts.decisions", { count: decisions })} · {t("counts.runs", { count: totals.runs })}
        </div>
      </section>

      <section style={s.tile}>
        <p style={s.label}>{t("tiles.mostActive", { period: periodName })}</p>
        {totals.most_active ? (
          <>
            <div style={s.name}>{totals.most_active.agent_name}</div>
            <div style={s.sub}>{t("counts.runs", { count: totals.most_active.runs })}</div>
          </>
        ) : (
          <div style={s.value}>—</div>
        )}
      </section>
    </div>
  );
}
