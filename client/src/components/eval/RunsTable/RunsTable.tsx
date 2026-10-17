/* RunsTable — an agent's eval runs, newest first: time, agent version, the three metrics, passed /
   completed cases, errored cases, unlabelled findings, cost and a status badge for a run that is
   `running`, `partial` or `failed` (AC-38). With `onSelectedChange` each counted run (`done` or
   `partial`, AC-66) gets a checkbox, at most two at a time, for Compare (AC-45). */
"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { EvalRunStatus, EvalRunSummary } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { formatMetric, isCounted, passedOfCompleted } from "../helpers";
import { MAX_SELECTED_RUNS, STATUS_BADGE } from "./constants";
import { s } from "./styles";

export interface RunsTableProps {
  runs: readonly EvalRunSummary[];
  /** Ids of the selected runs. Only read when `onSelectedChange` is set. */
  selectedIds?: readonly string[];
  /** Turns the selection column on. Called with the new list of ids (at most two). */
  onSelectedChange?: (ids: string[]) => void;
}

const BADGED: readonly EvalRunStatus[] = ["running", "partial", "failed"];

export function RunsTable({ runs, selectedIds = [], onSelectedChange }: RunsTableProps) {
  const t = useTranslations("eval");
  const format = useFormatter();
  const selectable = onSelectedChange != null;
  const full = selectedIds.length >= MAX_SELECTED_RUNS;

  const toggle = (id: string, on: boolean) => {
    if (!onSelectedChange) return;
    onSelectedChange(on ? [...selectedIds, id].slice(0, MAX_SELECTED_RUNS) : selectedIds.filter((x) => x !== id));
  };

  return (
    <div style={s.scroll}>
      <table style={s.table}>
        <thead>
          <tr>
            {selectable && (
              <th scope="col" style={s.th}>
                <span className="sr-only">{t("runsTable.select")}</span>
              </th>
            )}
            <th scope="col" style={s.th}>{t("runsTable.time")}</th>
            <th scope="col" style={s.th}>{t("runsTable.version")}</th>
            <th scope="col" style={s.thNum}>{t("runsTable.recall")}</th>
            <th scope="col" style={s.thNum}>{t("runsTable.precision")}</th>
            <th scope="col" style={s.thNum}>{t("runsTable.citation")}</th>
            <th scope="col" style={s.thNum}>{t("runsTable.passed")}</th>
            <th scope="col" style={s.thNum}>{t("runsTable.errored")}</th>
            <th scope="col" style={s.thNum}>{t("runsTable.unlabelled")}</th>
            <th scope="col" style={s.thNum}>{t("runsTable.cost")}</th>
            <th scope="col" style={s.th}>{t("runsTable.status")}</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const started = format.dateTime(new Date(run.started_at), { dateStyle: "medium", timeStyle: "short" });
            const checked = selectedIds.includes(run.id);
            const counted = isCounted(run);
            return (
              <tr key={run.id}>
                {selectable && (
                  <td style={s.td}>
                    <input
                      type="checkbox"
                      aria-label={t("runsTable.selectRun", { time: started })}
                      checked={checked}
                      disabled={!counted || (full && !checked)}
                      onChange={(e) => toggle(run.id, e.target.checked)}
                    />
                  </td>
                )}
                <td style={s.td}>{started}</td>
                <td className="tnum" style={s.td}>{t("runsTable.versionValue", { version: run.agent_version })}</td>
                <td className="tnum" style={s.tdNum}>{formatMetric(run.recall)}</td>
                <td className="tnum" style={s.tdNum}>{formatMetric(run.precision)}</td>
                <td className="tnum" style={s.tdNum}>{formatMetric(run.citation_accuracy)}</td>
                <td className="tnum" style={s.tdNum}>{passedOfCompleted(run)}</td>
                <td className="tnum" style={s.tdNum}>{run.cases_errored}</td>
                <td className="tnum" style={s.tdNum}>{run.unlabelled_findings}</td>
                <td className="tnum" style={s.tdNum}>{formatCost(run.cost_usd)}</td>
                <td style={s.td}>
                  {BADGED.includes(run.status) && (
                    <Badge color={STATUS_BADGE[run.status].color} bg={STATUS_BADGE[run.status].bg}>
                      {t(`runsTable.statusBadge.${run.status}`)}
                    </Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
