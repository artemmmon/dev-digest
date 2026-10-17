/* AgentTabs — Tabs mode: one tab per agent run (agent colour, name, score). The selected tab shows
   the run's summary, score, duration, cost and "View trace", then each finding as the PR page's FindingCard
   (accept / dismiss / turn into an eval case). The summary and error render as text; rationale and
   suggestion go through FindingCard's Markdown. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore, Icon } from "@devdigest/ui";
import type { AgentColumn, FindingRecord } from "@devdigest/shared";
import { FindingCard } from "@/components/finding-card";
import { FindingCaseEditor } from "@/components/finding-case-editor";
import { formatCost } from "@/lib/format-cost";
import { formatDurationMs } from "@/lib/format-duration";
import { useFindingAction } from "@/lib/hooks/reviews";
import { agentColor } from "../../../../agent-palette";
import { STATE_COLOR, tabScoreColor } from "../../helpers";
import { s } from "./styles";

export function AgentTabs({
  columns,
  prId,
  repoFullName,
  headSha,
  onViewTrace,
}: {
  columns: AgentColumn[];
  prId: string;
  repoFullName: string | null;
  headSha: string;
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgent");
  const action = useFindingAction();
  const [picked, setPicked] = React.useState<string | null>(null);
  // The finding the Case Editor is open on (null = closed).
  const [seedFor, setSeedFor] = React.useState<FindingRecord | null>(null);

  // Derived: a stale pick (run changed) falls back to the first column.
  const colIndex = Math.max(0, columns.findIndex((c) => c.run_id === picked));
  const col = columns[colIndex];
  if (!col) return null;
  const accent = agentColor(colIndex);
  const color = STATE_COLOR[col.state];
  const name = col.agent_name ?? t("column.unknownAgent");

  return (
    <div>
      <div role="tablist" style={s.tabs}>
        {columns.map((c, i) => {
          const on = c.run_id === col.run_id;
          return (
            <button
              key={c.run_id}
              type="button"
              role="tab"
              aria-selected={on}
              style={s.tab(on, agentColor(i))}
              onClick={() => setPicked(c.run_id)}
            >
              <Icon.Cpu size={15} style={{ color: on ? agentColor(i) : "var(--text-muted)" }} />
              <span style={s.tabName(on)}>{c.agent_name ?? t("column.unknownAgent")}</span>
              {c.score != null && (
                <span className="tnum" style={s.tabScore(tabScoreColor(c.score))}>
                  {c.score}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div style={s.body}>
        <div style={s.summary(accent)}>
          {col.state === "done" && col.score != null && <CircularScore score={col.score} size={44} />}
          <div style={s.main}>
            <div style={s.name(accent)}>{name}</div>
            <div style={s.state(color)}>{t(`state.${col.state}`)}</div>
            {col.state === "failed" && col.error && <p style={s.text}>{col.error}</p>}
            {col.summary && <p style={s.text}>{col.summary}</p>}
          </div>
          <div style={s.side}>
            <button type="button" style={s.traceBtn} onClick={() => onViewTrace(col.run_id)}>
              {t("column.viewTrace", { count: col.findings.length })}
            </button>
            {col.state === "done" && (
              <span className="mono tnum" style={s.stats}>
                {formatDurationMs(col.duration_ms)} · {formatCost(col.cost_usd)}
              </span>
            )}
          </div>
        </div>

        <div style={s.list}>
          {col.findings.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
              onTurnIntoEvalCase={setSeedFor}
            />
          ))}
        </div>
      </div>

      {seedFor && <FindingCaseEditor finding={seedFor} prId={prId} onClose={() => setSeedFor(null)} />}
    </div>
  );
}
