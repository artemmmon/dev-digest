/* CiRunTable — the rows of CI runs, shared by the agent's CI tab (its 20 newest runs) and the CI Runs
   page (design `screen_cizruns.jsx`). Display only: the server stores and verifies runs, this formats
   them. PR titles and agent names are text, cut with CSS ellipsis. "Job" opens the GitHub Actions run in
   a new tab; "Trace" opens the details row. A cell with no data shows "—". */
"use client";

import React from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import { RunCostBadge } from "@/components/run-cost-badge";
import { SeverityCounts } from "@/components/severity-counts";
import { useRepos } from "@/lib/hooks";
import { isEmptyCounts } from "@/lib/severity-counts";
import { CiStatusBadge } from "./CiStatusBadge";
import { TraceDetails } from "./TraceDetails";
import { formatDuration, prTarget, runCounts, safeHttpsUrl } from "./helpers";
import { s } from "./styles";

const COLUMNS = [
  "timestamp",
  "pullRequest",
  "agent",
  "source",
  "duration",
  "findings",
  "verdict",
  "cost",
  "status",
] as const;

const SOURCE_KEYS = new Set(["gha", "github_actions"]);

export function CiRunTable({ runs }: { runs: CiRun[] }) {
  const t = useTranslations("ci");
  const format = useFormatter();
  const repos = useRepos();
  const [traceId, setTraceId] = React.useState<string | null>(null);

  const repoIdByName = React.useMemo(
    () => new Map((repos.data ?? []).map((r) => [r.full_name, r.id] as const)),
    [repos.data],
  );

  return (
    <div style={s.frame}>
      <table style={s.table}>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c} scope="col" style={s.th}>
                {t(`runs.table.${c}`)}
              </th>
            ))}
            <th scope="col" style={s.th}>
              <span className="sr-only">{t("runs.table.links")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const target = prTarget(run, repoIdByName);
            const jobUrl = safeHttpsUrl(run.job_url);
            const counts = runCounts(run);
            const duration = formatDuration(run.duration_ms);
            const traceOpen = traceId === run.id;
            const traceDomId = `ci-trace-${run.id}`;
            const prName = run.pr_number != null ? { pr: run.pr_number } : null;
            const prLabel = (key: "jobLabel" | "traceLabel") =>
              prName ? t(`runs.${key}`, prName) : t(`runs.${key}NoPr`);
            const prText = (
              <>
                {run.pr_number != null && (
                  <span className="mono" style={s.prNumber}>
                    #{run.pr_number}
                  </span>
                )}
                {run.pr_title && <span style={s.prTitle}>{run.pr_title}</span>}
              </>
            );
            return (
              <React.Fragment key={run.id}>
                <tr>
                  <td style={s.td}>
                    <span className="mono" style={s.time}>
                      {run.ran_at
                        ? format.dateTime(new Date(run.ran_at), { dateStyle: "medium", timeStyle: "short" })
                        : "—"}
                    </span>
                  </td>
                  <td style={{ ...s.td, ...s.prCell }}>
                    <span className="mono" style={s.repo}>
                      {run.repo}
                    </span>
                    {run.pr_number == null && !run.pr_title ? (
                      <span style={s.muted}>—</span>
                    ) : target?.internal ? (
                      <Link href={target.href} style={s.prLine}>
                        {prText}
                      </Link>
                    ) : target ? (
                      <a href={target.href} target="_blank" rel="noopener noreferrer" style={s.prLine}>
                        {prText}
                      </a>
                    ) : (
                      <span style={s.prLine}>{prText}</span>
                    )}
                  </td>
                  <td style={s.td}>
                    {run.agent_name ? (
                      <span style={s.agent}>
                        <Icon.Cpu size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
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
                        onClick={() => setTraceId(traceOpen ? null : run.id)}
                      >
                        {t("runs.trace.link")}
                      </button>
                    </span>
                  </td>
                </tr>
                {traceOpen && (
                  <tr>
                    <td colSpan={COLUMNS.length + 1} style={s.traceCell}>
                      <TraceDetails run={run} id={traceDomId} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
