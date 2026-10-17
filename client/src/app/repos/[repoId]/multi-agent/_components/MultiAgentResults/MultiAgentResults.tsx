/* MultiAgentResults — the results view of one multi-agent run: header (title, run selector, "Start
   new review", the Columns/Tabs pill switch), meta row (PR, agents, wall time, cost, tokens), the
   preparation-error banner, "Where agents disagree" and the run trace drawer. The run, the view
   (?view=) and the open trace (?trace=) live in the URL. Everything that came from the model or a
   failed run (agent names, error messages, summaries) renders as text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, SelectInput, Skeleton } from "@devdigest/ui";
import type { MultiAgentRunListItem, PrMeta } from "@devdigest/shared";
import { RunTraceDrawer } from "@/components/run-trace-drawer";
import { ApiError } from "@/lib/api";
import { formatCost } from "@/lib/format-cost";
import { formatDurationMs } from "@/lib/format-duration";
import { useMultiAgentRun } from "@/lib/hooks/multi-agent";
import { useSearchParamState } from "@/lib/use-search-param-state";
import { AgentColumns } from "./_components/AgentColumns";
import { AgentTabs } from "./_components/AgentTabs";
import { DisagreeBlock } from "./_components/DisagreeBlock";
import { formatRunTime, isLiveState } from "./helpers";
import { s } from "./styles";

export interface MultiAgentResultsProps {
  pr: PrMeta;
  prId: string;
  runId: string;
  /** The PR's runs (newest first) for the selector. */
  runs: MultiAgentRunListItem[];
  repoFullName: string | null;
  onSelectRun: (runId: string) => void;
  onStartNew: () => void;
}

export function MultiAgentResults({
  pr,
  prId,
  runId,
  runs,
  repoFullName,
  onSelectRun,
  onStartNew,
}: MultiAgentResultsProps) {
  const t = useTranslations("multiAgent");
  const [viewParam, setView] = useSearchParamState("view", "columns");
  const [traceRunId, setTraceRunId] = useSearchParamState("trace", null);
  const view = viewParam === "tabs" ? "tabs" : "columns";
  const query = useMultiAgentRun(prId, runId);
  const run = query.data;

  // The selector lists the PR's runs; a run opened from a link may not be in that list yet.
  const known = runs.some((r) => r.id === runId);
  const items = !known && run ? [{ id: run.id, ran_at: run.ran_at, agent_count: run.agent_count }, ...runs] : runs;
  const options = items.map((r) => ({
    value: r.id,
    label: t("results.runOption", { time: formatRunTime(r.ran_at), count: r.agent_count }),
  }));

  const traceColumn = traceRunId ? run?.columns.find((c) => c.run_id === traceRunId) : undefined;

  return (
    <div style={s.root}>
      <div style={s.toolbar}>
        <h1 style={s.h1}>{t("title")}</h1>
        {run && <span style={s.agentsNote}>{t("results.parallel", { count: run.agent_count })}</span>}
        <label style={s.selectWrap}>
          <span style={s.srOnly}>{t("results.runSelectorLabel")}</span>
          <SelectInput mono={false} value={runId} options={options} onChange={onSelectRun} />
        </label>
        <Button kind="secondary" icon="Plus" onClick={onStartNew}>
          {t("results.startNew")}
        </Button>
        <div role="group" aria-label={t("view.label")} style={s.viewSwitch}>
          {(["columns", "tabs"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={view === k}
              style={s.viewBtn(view === k)}
              onClick={() => setView(k === "tabs" ? "tabs" : null)}
            >
              {t(`view.${k}`)}
            </button>
          ))}
        </div>
      </div>

      {query.isLoading ? (
        <div style={s.skeletons}>
          <Skeleton height={20} width={420} />
          <Skeleton height={220} />
        </div>
      ) : query.isError || !run ? (
        <ErrorState
          title={t("results.loadErrorTitle")}
          body={query.error instanceof ApiError ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <div style={s.meta}>
            <span className="mono" style={s.prNumber}>
              #{pr.number}
            </span>
            <span style={s.prTitle}>{pr.title}</span>
            <span style={s.metaRight}>
              <Icon.Cpu size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
              <span className="tnum">
                {t("results.summary", {
                  count: run.agent_count,
                  time: formatDurationMs(run.total_duration_ms),
                  cost: formatCost(run.total_cost_usd),
                })}
              </span>
              {run.cost_partial && <span style={s.partial}>{t("results.costPartial")}</span>}
              <span className="mono tnum" style={s.tokens}>
                {t("results.tokensValue", {
                  input: run.tokens_in.toLocaleString(),
                  output: run.tokens_out.toLocaleString(),
                })}
              </span>
            </span>
          </div>

          {run.preparation_error && (
            <div role="alert" style={s.banner}>
              <div style={s.bannerTitle}>{t("results.prepErrorTitle")}</div>
              <div style={s.bannerBody}>{run.preparation_error}</div>
            </div>
          )}

          {view === "columns" ? (
            <AgentColumns columns={run.columns} ranAt={run.ran_at} onViewTrace={setTraceRunId} />
          ) : (
            <AgentTabs
              key={run.id}
              columns={run.columns}
              prId={prId}
              repoFullName={repoFullName}
              headSha={pr.head_sha}
              onViewTrace={setTraceRunId}
            />
          )}

          <DisagreeBlock run={run} />
        </>
      )}

      {/* Mounted once the run has loaded: the drawer reads `running` only at mount (log vs trace tab). */}
      {traceRunId && run && (
        <RunTraceDrawer
          runId={traceRunId}
          prNumber={pr.number}
          agentName={traceColumn ? (traceColumn.agent_name ?? t("column.unknownAgent")) : null}
          findings={traceColumn?.findings ?? []}
          running={traceColumn ? isLiveState(traceColumn.state) : false}
          onClose={() => setTraceRunId(null)}
        />
      )}
    </div>
  );
}
