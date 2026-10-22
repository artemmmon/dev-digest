/* CostBreakdown — the period's cost by agent and by model, as two donuts. Every slice is a priced run's
   cost, so each donut adds up to the Total cost tile (AC-50, AC-51). Labelled "DevDigest estimate", and
   "partial" when some counted run stored no cost. Without any priced run it says so instead of drawing
   empty rings (AC-53). Names are legend text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Donut, type DonutSegment } from "@devdigest/ui";
import type { AgentCost, ModelCost } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { EstimateLabel, PartialMark } from "@/components/agent-stats";
import { s } from "./styles";

const SEGMENT_COLORS = ["var(--accent)", "var(--ok)", "var(--warn)", "var(--info)", "var(--crit)"];

function toSegments(items: Array<{ label: string; value: number }>): DonutSegment[] {
  return items.map((item, i) => ({ ...item, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] ?? "var(--accent)" }));
}

export function CostBreakdown({
  costByAgent,
  costByModel,
  totalCostUsd,
  costPartial,
}: {
  costByAgent: AgentCost[];
  costByModel: ModelCost[];
  totalCostUsd: number | null;
  costPartial: boolean;
}) {
  const t = useTranslations("agentPerformance");
  const agentSegments = toSegments(
    costByAgent.map((a) => ({ label: a.agent_name ?? t("table.deletedAgent"), value: a.cost_usd })),
  );
  const modelSegments = toSegments(
    costByModel.map((m) => ({ label: m.model ?? t("details.unknownModel"), value: m.cost_usd })),
  );

  return (
    <section aria-labelledby="agent-perf-cost-heading">
      <div style={s.head}>
        <h2 id="agent-perf-cost-heading" style={s.h2}>
          {t("breakdown.title")}
        </h2>
        <EstimateLabel />
        {costPartial && <PartialMark />}
      </div>
      {totalCostUsd === null ? (
        <p style={s.none}>{t("breakdown.noCost")}</p>
      ) : (
        <div style={s.grid}>
          <div style={s.card}>
            <h3 style={s.cardTitle}>{t("breakdown.byAgent")}</h3>
            <Donut segments={agentSegments} size={120} valuePrefix="" formatValue={formatCost} />
          </div>
          <div style={s.card}>
            <h3 style={s.cardTitle}>{t("breakdown.byModel")}</h3>
            <Donut segments={modelSegments} size={120} valuePrefix="" formatValue={formatCost} />
          </div>
        </div>
      )}
    </section>
  );
}
