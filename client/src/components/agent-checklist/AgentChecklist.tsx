/* AgentChecklist — a checkbox per agent with its average duration/cost (or "no estimate").
   The compact list of the PR page's Run Review popover (the Multi-Agent Configure run screen uses
   AgentPickCard cards instead). The caller
   owns the checked set; this component renders it and reports toggles. Agent names render as text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox, Icon } from "@devdigest/ui";
import type { Agent, AgentRunEstimate } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { formatDurationMs } from "@/lib/format-duration";
import { s } from "./styles";

export interface AgentChecklistProps {
  agents: Pick<Agent, "id" | "name">[];
  /** Ids of the checked agents. */
  checked: ReadonlySet<string>;
  onToggle: (agentId: string) => void;
  /** When given, a "Select all" action is shown. */
  onSelectAll?: () => void;
  /** When given, a "Clear all" action is shown. */
  onClearAll?: () => void;
  /** Absent = no estimate column at all (not even "no estimate"). */
  estimates?: AgentRunEstimate[];
}

export function AgentChecklist({
  agents,
  checked,
  onToggle,
  onSelectAll,
  onClearAll,
  estimates,
}: AgentChecklistProps) {
  const t = useTranslations("multiAgent");
  const byAgent = React.useMemo(() => new Map((estimates ?? []).map((e) => [e.agent_id, e])), [estimates]);
  const showEstimates = estimates !== undefined;

  return (
    <div style={s.root}>
      {(onSelectAll || onClearAll) && (
        <div style={s.header}>
          <span style={s.heading}>{t("checklist.heading")}</span>
          <span style={s.actions}>
            {onSelectAll && (
              <button type="button" style={s.link} onClick={onSelectAll}>
                {t("checklist.selectAll")}
              </button>
            )}
            {onClearAll && (
              <button type="button" style={s.link} onClick={onClearAll}>
                {t("checklist.clearAll")}
              </button>
            )}
          </span>
        </div>
      )}
      <ul style={s.list}>
        {agents.map((a) => {
          const est = byAgent.get(a.id);
          const hasEstimate = !!est && (est.avg_duration_ms != null || est.avg_cost_usd != null);
          return (
            <li key={a.id} style={s.row}>
              <Checkbox
                checked={checked.has(a.id)}
                onChange={() => onToggle(a.id)}
                label={
                  <span style={s.label}>
                    <Icon.Cpu size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                    <span style={s.name}>{a.name}</span>
                    {showEstimates && (
                      <span className="mono" style={s.estimate}>
                        {hasEstimate
                          ? t("checklist.estimate", {
                              duration: formatDurationMs(est.avg_duration_ms),
                              cost: formatCost(est.avg_cost_usd),
                            })
                          : t("checklist.noEstimate")}
                      </span>
                    )}
                  </span>
                }
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
