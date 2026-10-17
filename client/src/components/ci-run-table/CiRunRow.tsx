/* CiRunRow — one CI run as a table row (nine cells and the links), plus its trace details row while open.
   A cell with no data shows "—". "Job" opens the GitHub Actions run in a new tab; "Trace" toggles details. */
"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import { RunCostBadge } from "@/components/run-cost-badge";
import { SeverityCounts } from "@/components/severity-counts";
import { isEmptyCounts } from "@/lib/severity-counts";
import { safeHttpsUrl } from "@/lib/safe-url";
import { CiStatusBadge } from "./CiStatusBadge";
import { PrCell } from "./PrCell";
import { TraceDetails } from "./TraceDetails";
import { COLUMN_COUNT, SOURCE_KEYS } from "./constants";
import { formatDuration, runCounts } from "./helpers";
import { s } from "./styles";

export function CiRunRow({
  run,
  repoIdByName,
  traceOpen,
  onToggleTrace,
}: {
  run: CiRun;
  repoIdByName: ReadonlyMap<string, string>;
  traceOpen: boolean;
  onToggleTrace: () => void;
}) {
  const t = useTranslations("ci");
  const format = useFormatter();
  const jobUrl = safeHttpsUrl(run.job_url);
  const counts = runCounts(run);
  const duration = formatDuration(run.duration_ms);
  const traceDomId = `ci-trace-${run.id}`;
  const prName = run.pr_number != null ? { pr: run.pr_number } : null;
  const prLabel = (key: "jobLabel" | "traceLabel") =>
    prName ? t(`runs.${key}`, prName) : t(`runs.${key}NoPr`);

  return (
    <>
      <tr>
        <td style={s.td}>
          <span className="mono" style={s.time}>
            {run.ran_at
              ? format.dateTime(new Date(run.ran_at), { dateStyle: "medium", timeStyle: "short" })
              : "—"}
          </span>
        </td>
        <td style={s.prTd}>
          <PrCell run={run} repoIdByName={repoIdByName} />
        </td>
        <td style={s.td}>
          {run.agent_name ? (
            <span style={s.agent}>
              <Icon.Cpu size={13} style={s.agentIcon} />
              {run.agent_name}
            </span>
          ) : (
            <span style={s.muted}>—</span>
          )}
        </td>
        <td style={s.td}>
          {run.source ? (
            <Badge color="var(--text-secondary)" icon="Workflow">
              {SOURCE_KEYS.has(run.source) ? t("runs.sources.gha") : run.source}
            </Badge>
          ) : (
            <span style={s.muted}>—</span>
          )}
        </td>
        <td style={s.td}>
          {duration ? (
            <span className="tnum" style={s.num}>
              {duration}
            </span>
          ) : (
            <span style={s.muted}>—</span>
          )}
        </td>
        <td style={s.td}>
          {isEmptyCounts(counts) ? <span style={s.muted}>—</span> : <SeverityCounts counts={counts} />}
        </td>
        <td style={s.td}>
          {run.verdict ? (
            <span style={s.num}>{t(`runs.verdicts.${run.verdict}`)}</span>
          ) : (
            <span style={s.muted}>—</span>
          )}
        </td>
        <td style={s.td}>
          <RunCostBadge variant="compact" costUsd={run.cost_usd} />
        </td>
        <td style={s.td}>
          <CiStatusBadge status={run.status} reason={run.failure_reason} />
        </td>
        <td style={s.td}>
          <span style={s.links}>
            {jobUrl && (
              <a
                href={jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={prLabel("jobLabel")}
                style={s.link}
              >
                {t("runs.job")}
              </a>
            )}
            <button
              type="button"
              style={s.link}
              aria-expanded={traceOpen}
              aria-controls={traceOpen ? traceDomId : undefined}
              aria-label={prLabel("traceLabel")}
              onClick={onToggleTrace}
            >
              {t("runs.trace.link")}
            </button>
          </span>
        </td>
      </tr>
      {traceOpen && (
        <tr>
          <td colSpan={COLUMN_COUNT} style={s.traceCell}>
            <TraceDetails run={run} id={traceDomId} />
          </td>
        </tr>
      )}
    </>
  );
}
