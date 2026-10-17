/* EvalAgentView — /eval/:agentId: the agent's regression alert and metric cards (AC-40, AC-44), "Run
   eval" with live progress (AC-18), and a runs table of at most 50 runs where two counted runs can be
   picked for Compare (AC-45, EC-11). The server scores and rolls up; the client only formats it.
   Server state stays in the query cache; only the selection and the open compare live here. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePageCrumb } from "@/components/app-shell";
import { MetricCards, RegressionAlert, RunsTable, TrendChart, isCounted, regressions, runProgress } from "@/components/eval";
import { ApiError } from "@/lib/api";
import { useEvalCases, useEvalRuns, useStartEvalRun } from "@/lib/hooks";
import { useAgent } from "@/lib/hooks/agents";
import { CompareView } from "../CompareView";
import { AGENT_RUNS_LIMIT } from "./constants";
import { s } from "./styles";

export function EvalAgentView({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const agentQ = useAgent(agentId);
  const runsQ = useEvalRuns(agentId, AGENT_RUNS_LIMIT);
  const casesQ = useEvalCases(agentId);
  const start = useStartEvalRun(agentId);
  const hintId = React.useId();
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [comparing, setComparing] = React.useState<{ a: string; b: string } | null>(null);

  usePageCrumb([
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/eval" },
    { label: agentQ.data?.name ?? t("agentView.crumbFallback") },
  ]);

  const back = (
    <Link href="/eval" style={s.back}>
      <Icon.ChevronLeft size={16} />
      {t("agentView.back")}
    </Link>
  );

  const missing = agentQ.error instanceof ApiError && agentQ.error.status === 404;
  if (missing) {
    return (
      <div style={s.page}>
        {back}
        <EmptyState
          icon="Cpu"
          title={t("agentView.notFoundTitle")}
          body={t("agentView.notFoundBody")}
          cta={t("agentView.notFoundCta")}
          onCta={() => router.push("/eval")}
        />
      </div>
    );
  }
  if (agentQ.isError || runsQ.isError || casesQ.isError) {
    return (
      <div style={s.page}>
        {back}
        <ErrorState
          body={t("agentView.loadError")}
          onRetry={() => {
            void agentQ.refetch();
            void runsQ.refetch();
            void casesQ.refetch();
          }}
        />
      </div>
    );
  }
  if (!agentQ.data || !runsQ.data || !casesQ.data) {
    return (
      <div style={s.page} aria-busy="true">
        {back}
        <Skeleton height={28} width={260} />
        <div style={{ height: 16 }} />
        <Skeleton height={72} />
        <div style={{ height: 16 }} />
        <Skeleton height={200} />
      </div>
    );
  }

  const agent = agentQ.data;
  const { runs, latest_counted: latest, previous_counted: previous } = runsQ.data;
  const runningRun = runs.find((r) => r.status === "running") ?? null;
  const noCases = casesQ.data.length === 0;

  // Only runs that are still in the list and still counted can stay selected.
  const countedIds = new Set(runs.filter(isCounted).map((r) => r.id));
  const selected = selectedIds.filter((id) => countedIds.has(id));
  const [olderId, newerId] = selected;
  const canCompare = selected.length === 2 && olderId != null && newerId != null;

  return (
    <div style={s.page}>
      {comparing && <CompareView a={comparing.a} b={comparing.b} onClose={() => setComparing(null)} />}
      {back}
      <div style={s.header}>
        <div style={s.titleBlock}>
          <h1 style={s.h1}>
            {agent.name}
            <span className="mono" style={s.model}>
              {agent.model}
            </span>
          </h1>
          <p style={s.subtitle}>{t("agentView.subtitle", { count: runs.length })}</p>
        </div>
        <div style={s.actions}>
          {noCases && (
            <span id={hintId} style={s.hint}>
              {t("evalsTab.addCaseFirst")}
            </span>
          )}
          <Button
            kind="primary"
            size="sm"
            icon="Play"
            disabled={noCases || runningRun != null || start.isPending}
            loading={start.isPending}
            aria-describedby={noCases ? hintId : undefined}
            onClick={() => start.mutate()}
          >
            {runningRun
              ? t("evalsTab.runningProgress", { done: runProgress(runningRun), total: runningRun.cases_total })
              : t("agentView.runEval")}
          </Button>
        </div>
      </div>

      <RegressionAlert regressions={regressions(latest, previous)} />
      <MetricCards latest={latest} previous={previous} />
      <TrendChart agentId={agentId} />

      <div style={s.runsHead}>
        <SectionLabel icon="History">{t("agentView.runsHeading")}</SectionLabel>
        <span style={s.runsHint}>
          {selected.length === 0
            ? t("agentView.selectHint")
            : t("agentView.selectedCount", { count: selected.length })}
        </span>
        <div style={s.compare}>
          <Button
            kind={canCompare ? "primary" : "ghost"}
            size="sm"
            icon="GitBranch"
            disabled={!canCompare}
            onClick={() => olderId && newerId && setComparing({ a: olderId, b: newerId })}
          >
            {t("agentView.compare")}
          </Button>
        </div>
      </div>
      {runs.length === 0 ? (
        <p style={s.empty}>{t("agentView.noRuns")}</p>
      ) : (
        <RunsTable runs={runs} selectedIds={selected} onSelectedChange={setSelectedIds} />
      )}
    </div>
  );
}
