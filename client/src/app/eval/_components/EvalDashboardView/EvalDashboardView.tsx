/* EvalDashboardView — /eval: every agent's latest counted run (AC-42) and the 6 newest counted runs
   across agents (AC-43). The server rolls the runs up; the client only formats them. A run that is
   `running` or `failed` never shows as a row (AC-66). Design: `screen_skills.jsx` AgentEvalOverview. */
"use client";

import React from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { EmptyState, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import type { EvalRunSummary } from "@devdigest/shared";
import { usePageCrumb } from "@/components/app-shell";
import {
  EVAL_METRICS,
  METRIC_COLOR,
  formatMetric,
  isCounted,
  passedOfCompleted,
  type EvalMetricKey,
} from "@/components/eval";
import { useEvalDashboard } from "@/lib/hooks";
import { DASHBOARD_RECENT_RUNS } from "./constants";
import { s } from "./styles";

const METRIC_SHORT_KEY: Record<EvalMetricKey, string> = {
  recall: "recall",
  precision: "precision",
  citation_accuracy: "citation",
};

export function EvalDashboardView() {
  const t = useTranslations("eval");
  const format = useFormatter();
  const dashboard = useEvalDashboard();
  usePageCrumb([{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }]);

  const when = (run: EvalRunSummary) =>
    format.dateTime(new Date(run.started_at), { dateStyle: "medium", timeStyle: "short" });

  let body: React.ReactNode;
  if (dashboard.isError) {
    body = <ErrorState body={t("dashboardView.loadError")} onRetry={() => void dashboard.refetch()} />;
  } else if (!dashboard.data) {
    body = (
      <div aria-busy="true" style={{ display: "grid", gap: 8 }}>
        <Skeleton height={64} />
        <Skeleton height={64} />
        <Skeleton height={140} />
      </div>
    );
  } else {
    const { agents, recent_runs } = dashboard.data;
    const recent = recent_runs.filter(isCounted).slice(0, DASHBOARD_RECENT_RUNS);
    body = (
      <>
        <div style={s.sectionHead}>
          <SectionLabel icon="Cpu">{t("dashboardView.agentsHeading")}</SectionLabel>
        </div>
        {agents.length === 0 ? (
          <EmptyState icon="Cpu" title={t("dashboardView.noAgents")} body={t("dashboardView.noAgentsBody")} />
        ) : (
          <ul style={s.list}>
            {agents.map(({ agent_id, name, latest }) => {
              const run = latest && isCounted(latest) ? latest : null;
              return (
                <li key={agent_id}>
                  <Link href={`/eval/${agent_id}`} style={s.agentLink} data-testid={`agent-row-${agent_id}`}>
                    <div style={s.agentIcon}>
                      <Icon.Cpu size={17} />
                    </div>
                    <div style={s.agentMain}>
                      <div style={s.agentName}>{name}</div>
                      <div style={s.agentSub}>
                        {run
                          ? t("dashboardView.lastRun", {
                              version: t("runsTable.versionValue", { version: run.agent_version }),
                              time: when(run),
                            })
                          : t("dashboardView.noRuns")}
                        {run && <> · {t("dashboardView.passedSummary", { value: passedOfCompleted(run) })}</>}
                      </div>
                    </div>
                    {EVAL_METRICS.map((metric) => (
                      <div key={metric} style={s.mini}>
                        <div style={s.miniLabel}>{t(`dashboardView.columns.${METRIC_SHORT_KEY[metric]}`)}</div>
                        <div className="tnum" style={s.miniValue(METRIC_COLOR[metric])}>
                          {formatMetric(run?.[metric])}
                        </div>
                      </div>
                    ))}
                    <Icon.ChevronRight size={18} style={s.chevron} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <div style={s.sectionHead}>
          <SectionLabel icon="History">{t("dashboardView.recentHeading")}</SectionLabel>
        </div>
        {recent.length === 0 ? (
          <p style={s.empty}>{t("dashboardView.noRecent")}</p>
        ) : (
          <div style={s.scroll}>
            <table style={s.table} data-testid="recent-runs">
              <thead>
                <tr>
                  <th scope="col" style={s.th}>{t("dashboardView.columns.agent")}</th>
                  <th scope="col" style={s.th}>{t("dashboardView.columns.time")}</th>
                  <th scope="col" style={s.th}>{t("dashboardView.columns.version")}</th>
                  <th scope="col" style={s.th}>{t("dashboardView.columns.recall")}</th>
                  <th scope="col" style={s.th}>{t("dashboardView.columns.precision")}</th>
                  <th scope="col" style={s.th}>{t("dashboardView.columns.citation")}</th>
                  <th scope="col" style={s.th}>{t("dashboardView.columns.passed")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((run) => (
                  <tr key={run.id}>
                    <td style={s.td}>
                      <Link href={`/eval/${run.agent_id}`} style={s.rowLink}>
                        {run.agent_name}
                      </Link>
                    </td>
                    <td style={s.td}>{when(run)}</td>
                    <td className="tnum" style={s.td}>
                      {t("runsTable.versionValue", { version: run.agent_version })}
                    </td>
                    <td className="tnum" style={s.td}>{formatMetric(run.recall)}</td>
                    <td className="tnum" style={s.td}>{formatMetric(run.precision)}</td>
                    <td className="tnum" style={s.td}>{formatMetric(run.citation_accuracy)}</td>
                    <td className="tnum" style={s.td}>{passedOfCompleted(run)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  return (
    <div style={s.page}>
      <h1 style={s.h1}>{t("dashboardView.title")}</h1>
      <p style={s.subtitle}>{t("dashboardView.subtitle")}</p>
      {body}
    </div>
  );
}
