/* AgentPerformanceView — /agent-performance: how the workspace's agents performed over a period. Summary
   tiles, a table with one row per agent, and the cost breakdown. The period lives in the URL (default 30
   days) and the period control stays on screen in every state. A new period shows a loading state, never the
   previous period's figures. Every cost is a DevDigest estimate, not provider billing (AC-54, AC-55). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { usePageCrumb } from "@/components/app-shell";
import { PeriodControl, useStatsPeriod } from "@/components/agent-stats";
import { useAgentPerformance } from "@/lib/hooks";
import { AgentsTable } from "./_components/AgentsTable";
import { CostBreakdown } from "./_components/CostBreakdown";
import { SummaryTiles } from "./_components/SummaryTiles";
import { s } from "./styles";

export function AgentPerformanceView() {
  const t = useTranslations("agentPerformance");
  usePageCrumb([{ label: t("page.crumb") }]);

  const [sel, setSel] = useStatsPeriod();
  const query = useAgentPerformance(sel);
  const data = query.data;

  let body: React.ReactNode;
  if (data) {
    if (data.totals.runs === 0) {
      body = data.has_runs_outside_period ? (
        <EmptyState icon="Calendar" title={t("page.noRunsInPeriod")} />
      ) : (
        <EmptyState icon="Activity" title={t("page.emptyTitle")} body={t("page.emptyBody")} />
      );
    } else {
      body = (
        <div style={s.stack}>
          <SummaryTiles totals={data.totals} period={sel} />
          <AgentsTable agents={data.agents} period={sel} />
          <CostBreakdown
            costByAgent={data.cost_by_agent}
            costByModel={data.cost_by_model}
            totalCostUsd={data.totals.total_cost_usd}
            costPartial={data.totals.cost_partial}
          />
        </div>
      );
    }
  } else if (query.isError) {
    body = <ErrorState body={t("page.loadError")} onRetry={() => void query.refetch()} />;
  } else {
    body = (
      <div aria-busy="true" aria-label={t("page.loading")} style={s.loading}>
        <div style={s.loadingTiles}>
          <Skeleton height={92} />
          <Skeleton height={92} />
          <Skeleton height={92} />
          <Skeleton height={92} />
        </div>
        <Skeleton height={220} />
        <Skeleton height={180} />
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.head}>
        <div>
          <h1 style={s.h1}>{t("page.title")}</h1>
          <p style={s.subtitle}>{t("page.subtitle")}</p>
        </div>
        <div style={s.headRight}>
          <PeriodControl value={sel} onChange={setSel} />
        </div>
      </div>
      <p style={s.note}>{t("page.billingNote")}</p>
      {body}
    </div>
  );
}
