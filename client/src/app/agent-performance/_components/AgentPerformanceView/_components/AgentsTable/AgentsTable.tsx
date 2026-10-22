/* AgentsTable — one row per agent of the workspace (plus "Deleted agent" when its runs were kept). Only the
   Accept rate header sorts (a real button, with aria-sort); each row has an expand button for its details
   and, unless the agent was deleted, a View link to the agent's Stats tab on the same period. Figures with
   no data show "—"; an agent with no run in the period says so instead of showing figures. Names and models
   are text. Sorted rows are derived while rendering; only the sort and the expanded rows are state. */
"use client";

import React from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { AgentStats } from "@devdigest/shared";
import { EstimateLabel, PartialMark, SmallSampleMark } from "@/components/agent-stats";
import { formatCost } from "@/lib/format-cost";
import { formatDurationMs } from "@/lib/format-duration";
import { formatPercent } from "@/lib/format-percent";
import { decisionsOf, isSmallSample, type StatsPeriodSelection } from "@/lib/stats-period";
import { nextSort, rowKey, sortRows, viewHref, type AcceptSort } from "./helpers";
import { s } from "./styles";

const COLUMN_COUNT = 7;

export function AgentsTable({ agents, period }: { agents: AgentStats[]; period: StatsPeriodSelection }) {
  const t = useTranslations("agentPerformance");
  const [sort, setSort] = React.useState<AcceptSort>(null);
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set());
  const rows = sortRows(agents, sort);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  const ariaSort = sort === "desc" ? "descending" : sort === "asc" ? "ascending" : "none";

  return (
    <div style={s.frame}>
      <table style={s.table}>
        <caption className="sr-only">{t("table.caption")}</caption>
        <thead>
          <tr>
            <th scope="col" style={s.th}>
              {t("table.agent")}
            </th>
            <th scope="col" style={s.th}>
              {t("table.runs")}
            </th>
            <th scope="col" style={s.th}>
              {t("table.avgCost")} <EstimateLabel />
            </th>
            <th scope="col" style={s.th}>
              {t("table.avgDuration")}
            </th>
            <th scope="col" aria-sort={ariaSort} style={s.th}>
              <button type="button" style={s.sortButton} onClick={() => setSort(nextSort(sort))}>
                {t("table.acceptRate")}
                <span aria-hidden="true">{sort === "asc" ? "↑" : sort === "desc" ? "↓" : ""}</span>
              </button>
            </th>
            <th scope="col" style={s.th}>
              {t("table.lastRun")}
            </th>
            <th scope="col" style={s.th}>
              <span className="sr-only">{t("table.view")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((agent) => (
            <AgentRow
              key={rowKey(agent)}
              agent={agent}
              period={period}
              open={expanded.has(rowKey(agent))}
              onToggle={() => toggle(rowKey(agent))}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgentRow({
  agent,
  period,
  open,
  onToggle,
}: {
  agent: AgentStats;
  period: StatsPeriodSelection;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("agentPerformance");
  const format = useFormatter();
  const name = agent.agent_name ?? t("table.deletedAgent");
  const detailsId = `agent-perf-details-${rowKey(agent)}`;
  const decisions = decisionsOf(agent);

  return (
    <>
      <tr>
        <td style={s.agentCell}>
          <div style={s.agentLine}>
            <button
              type="button"
              style={s.expand}
              aria-expanded={open}
              aria-controls={detailsId}
              aria-label={t(open ? "table.collapse" : "table.expand", { name })}
              onClick={onToggle}
            >
              {open ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
            </button>
            <span style={s.name}>{name}</span>
          </div>
        </td>
        {agent.runs === 0 ? (
          <td colSpan={COLUMN_COUNT - 2} style={{ ...s.td, ...s.muted }}>
            {t("table.noRuns")}
          </td>
        ) : (
          <>
            <td className="tnum" style={s.num}>
              {agent.runs}
            </td>
            <td className="mono tnum" style={s.num}>
              <span style={s.stack}>
                {formatCost(agent.avg_cost_usd)}
                {agent.cost_partial && <PartialMark />}
              </span>
            </td>
            <td className="tnum" style={s.num}>
              {formatDurationMs(agent.avg_duration_ms)}
            </td>
            <td className="tnum" style={s.num}>
              <span style={s.stack}>
                {formatPercent(agent.accept_rate)}
                <span style={s.sub}>{t("counts.decisions", { count: decisions })}</span>
                {isSmallSample(agent) && <SmallSampleMark />}
              </span>
            </td>
            <td style={s.td}>
              <span className="mono" style={s.sub}>
                {agent.last_run_at
                  ? format.dateTime(new Date(agent.last_run_at), { dateStyle: "medium", timeStyle: "short" })
                  : "—"}
              </span>
            </td>
          </>
        )}
        <td style={s.td}>
          {agent.agent_id !== null && (
            <Link href={viewHref(agent.agent_id, period)} style={s.link} aria-label={t("table.viewLabel", { name })}>
              {t("table.view")}
            </Link>
          )}
        </td>
      </tr>
      {open && (
        <tr id={detailsId}>
          <td colSpan={COLUMN_COUNT} style={s.details}>
            <AgentDetails agent={agent} />
          </td>
        </tr>
      )}
    </>
  );
}

function AgentDetails({ agent }: { agent: AgentStats }) {
  const t = useTranslations("agentPerformance");
  const counts: Array<[string, number]>[] = [
    [
      [t("details.done"), agent.runs_done],
      [t("details.failed"), agent.runs_failed],
      [t("details.cancelled"), agent.runs_cancelled],
    ],
    [
      [t("details.accepted"), agent.accepted],
      [t("details.dismissed"), agent.dismissed],
      [t("details.pending"), agent.pending],
    ],
  ];
  const headings = [t("details.runsByState"), t("details.findings")];

  return (
    <div style={s.detailsGrid}>
      {counts.map((group, i) => (
        <div key={headings[i]}>
          <h3 style={s.detailsHead}>{headings[i]}</h3>
          <ul style={s.list}>
            {group.map(([label, value]) => (
              <li key={label} style={s.listRow}>
                <span>{label}</span>
                <span className="tnum">{value}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div>
        <h3 style={s.detailsHead}>
          {t("details.costByModel")} <EstimateLabel />
        </h3>
        {agent.cost_by_model.length === 0 ? (
          <span style={s.muted}>{t("breakdown.noCost")}</span>
        ) : (
          <ul style={s.list}>
            {agent.cost_by_model.map((m) => (
              <li key={m.model ?? "unknown-model"} style={s.listRow}>
                <span>{m.model ?? t("details.unknownModel")}</span>
                <span className="mono tnum">{formatCost(m.cost_usd)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
