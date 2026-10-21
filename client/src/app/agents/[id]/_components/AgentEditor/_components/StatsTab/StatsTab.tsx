/* StatsTab — the agent editor's Stats tab: this agent's runs, average cost, average duration and accept
   rate over a period. The period lives in the URL and is shared with the Agent Performance page (same
   control, same default of 30 days). Figures use the same formatters as the page's agents table, so one
   read shows the same numbers in both places (AC-83..AC-87). A new period shows a loading state, never the
   previous period's figures. Opening the tab only reads figures; it starts no review run (AC-66). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent, AgentStats } from "@devdigest/shared";
import { EstimateLabel, PartialMark, PeriodControl, SmallSampleMark, useStatsPeriod } from "@/components/agent-stats";
import { useAgentStats } from "@/lib/hooks";
import { formatCost } from "@/lib/format-cost";
import { formatDurationMs } from "@/lib/format-duration";
import { formatPercent } from "@/lib/format-percent";
import { decisionsOf, isSmallSample } from "@/lib/stats-period";
import { s } from "./styles";

export function StatsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const tp = useTranslations("agentPerformance");
  const [sel, setSel] = useStatsPeriod();
  const query = useAgentStats(agent.id, sel);
  const stats: AgentStats | undefined = query.data;

  let body: React.ReactNode;
  if (stats) {
    body =
      stats.runs === 0 ? (
        <p style={s.sub}>{t("statsTab.noRuns")}</p>
      ) : (
        <div style={s.grid}>
          <div style={s.tile}>
            <span style={s.label}>{t("statsTab.runs")}</span>
            <span style={s.value} className="tnum">
              {stats.runs}
            </span>
          </div>
          <div style={s.tile}>
            <span style={s.label}>
              {t("statsTab.avgCost")} <EstimateLabel />
            </span>
            <span style={s.value} className="tnum">
              {formatCost(stats.avg_cost_usd)}
              {stats.cost_partial && <PartialMark />}
            </span>
          </div>
          <div style={s.tile}>
            <span style={s.label}>{t("statsTab.avgDuration")}</span>
            <span style={s.value} className="tnum">
              {formatDurationMs(stats.avg_duration_ms)}
            </span>
          </div>
          <div style={s.tile}>
            <span style={s.label}>{t("statsTab.acceptRate")}</span>
            <span style={s.value} className="tnum">
              {formatPercent(stats.accept_rate)}
              {isSmallSample(stats) && <SmallSampleMark />}
            </span>
            <span style={s.sub}>{tp("counts.decisions", { count: decisionsOf(stats) })}</span>
          </div>
        </div>
      );
  } else if (query.isError) {
    body = <ErrorState body={t("statsTab.loadError")} onRetry={() => void query.refetch()} />;
  } else {
    body = (
      <div aria-busy="true" aria-label={t("statsTab.loading")} style={s.loading}>
        <Skeleton height={84} />
        <Skeleton height={84} />
        <Skeleton height={84} />
        <Skeleton height={84} />
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h2 style={s.h2}>{t("statsTab.title")}</h2>
        <div style={s.headRight}>
          <PeriodControl value={sel} onChange={setSel} />
        </div>
      </div>
      <p style={s.note}>{t("statsTab.billingNote")}</p>
      {body}
    </div>
  );
}
