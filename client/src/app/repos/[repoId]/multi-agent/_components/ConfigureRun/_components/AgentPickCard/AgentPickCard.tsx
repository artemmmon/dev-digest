/* AgentPickCard — one agent on the Configure run screen: a whole-card checkbox in the agent's
   colour with its icon, name, description and average duration/cost (or "no estimate"). The caller
   owns the checked state. Name and description render as text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Agent, AgentRunEstimate } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { formatDurationMs } from "@/lib/format-duration";
import { s } from "./styles";

export interface AgentPickCardProps {
  agent: Pick<Agent, "name" | "description">;
  /** The agent's palette colour. */
  color: string;
  checked: boolean;
  onToggle: () => void;
  /** False = no estimate text at all (estimates still loading); true = estimate or "no estimate". */
  showEstimate: boolean;
  estimate?: AgentRunEstimate;
}

export function AgentPickCard({ agent, color, checked, onToggle, showEstimate, estimate }: AgentPickCardProps) {
  const t = useTranslations("multiAgent");
  const hasEstimate = !!estimate && (estimate.avg_duration_ms != null || estimate.avg_cost_usd != null);
  const description = agent.description.trim();

  return (
    <button type="button" role="checkbox" aria-checked={checked} style={s.card(checked, color)} onClick={onToggle}>
      <span style={s.box(checked, color)} aria-hidden>
        {checked && <Icon.Check size={12} style={{ color: "#fff" }} />}
      </span>
      <span style={s.icon(color)} aria-hidden>
        <Icon.Cpu size={16} />
      </span>
      <span style={s.text}>
        <span style={{ ...s.name, display: "block" }}>{agent.name}</span>
        {description && <span style={{ ...s.desc, display: "block" }}>{description}</span>}
      </span>
      {showEstimate && (
        <span className="mono" style={s.estimate}>
          {hasEstimate
            ? t("checklist.estimate", {
                duration: formatDurationMs(estimate.avg_duration_ms),
                cost: formatCost(estimate.avg_cost_usd),
              })
            : t("checklist.noEstimate")}
        </span>
      )}
    </button>
  );
}
