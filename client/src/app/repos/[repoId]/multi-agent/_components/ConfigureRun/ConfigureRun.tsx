/* ConfigureRun — the Multi-Agent Review "Configure run" screen: pick a pull request, check the
   agents to fan out (each with its average duration/cost), see the estimated total, run.
   The selected PR lives in the URL (the page owns it); the checked agents are local. PR titles
   and agent names render as text. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, SearchableSelect, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { formatCost } from "@/lib/format-cost";
import { formatDurationMs } from "@/lib/format-duration";
import { useAgents } from "@/lib/hooks/agents";
import { usePulls } from "@/lib/hooks/core";
import { useReviewEstimates } from "@/lib/hooks/multi-agent";
import { useRunReview } from "@/lib/hooks/reviews";
import { estimateTotals } from "./helpers";
import { agentColor } from "../../agent-palette";
import { AgentPickCard } from "./_components/AgentPickCard";
import { s } from "./styles";

export interface ConfigureRunProps {
  repoId: string;
  /** The selected PR's number (from `?pr=`), or null when none is selected. */
  prNumber: string | null;
  onSelectPr: (prNumber: string) => void;
  /** Called with the new multi-agent run id once the review has started. */
  onStarted: (multiAgentRunId: string) => void;
}

export function ConfigureRun({ repoId, prNumber, onSelectPr, onStarted }: ConfigureRunProps) {
  const t = useTranslations("multiAgent");
  const router = useRouter();
  const pulls = usePulls(repoId);
  const agents = useAgents();
  const estimates = useReviewEstimates();
  const run = useRunReview();
  // `null` = untouched: every enabled agent is checked. The page keys this component by PR, so
  // picking another PR starts over with all agents checked (AC-16).
  const [picked, setPicked] = React.useState<Set<string> | null>(null);

  const pr = prNumber == null ? null : (pulls.data?.find((p) => String(p.number) === prNumber) ?? null);
  const enabled = React.useMemo(() => (agents.data ?? []).filter((a) => a.enabled), [agents.data]);
  const checked = React.useMemo(() => picked ?? new Set(enabled.map((a) => a.id)), [picked, enabled]);
  const checkedIds = enabled.filter((a) => checked.has(a.id)).map((a) => a.id);
  const totals = estimateTotals(checkedIds, estimates.data ?? []);
  // Absent while loading (no estimate text yet); an empty list once the request failed ("no estimate").
  const estimatesKnown = estimates.data !== undefined || estimates.isError;
  const estimateByAgent = React.useMemo(
    () => new Map((estimates.data ?? []).map((e) => [e.agent_id, e])),
    [estimates.data],
  );

  if (pulls.isLoading || agents.isLoading) {
    return (
      <div style={{ ...s.root, ...s.skeletons }}>
        <Skeleton height={28} width={320} />
        <Skeleton height={16} width={460} />
        <Skeleton height={40} />
        <Skeleton height={160} />
      </div>
    );
  }
  if (pulls.isError || agents.isError) {
    const err = pulls.error ?? agents.error;
    return (
      <ErrorState
        title={t("configure.loadErrorTitle")}
        body={err instanceof ApiError ? err.message : t("configure.loadErrorBody")}
        onRetry={() => {
          void pulls.refetch();
          void agents.refetch();
        }}
      />
    );
  }

  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const start = async () => {
    if (!pr?.id || checkedIds.length === 0) return;
    try {
      const res = await run.mutateAsync({ prId: pr.id, agentIds: checkedIds });
      onStarted(res.multi_agent_run_id);
    } catch {
      // The mutation cache already toasted the error.
    }
  };

  const runLabel = run.isPending
    ? t("configure.starting")
    : checkedIds.length > 1
      ? t("configure.runMany", { count: checkedIds.length })
      : checkedIds.length === 1
        ? t("configure.runOne")
        : t("configure.runNone");
  const estimateText = t(totals.partial ? "configure.estimatePartial" : "configure.estimate", {
    time: formatDurationMs(totals.timeMs),
    cost: formatCost(totals.costUsd),
  });

  return (
    <div style={s.root}>
      <h1 style={s.h1}>{t("configure.title")}</h1>
      <p style={s.subtitle}>{t("configure.subtitle")}</p>

      <div style={s.stepHead}>
        <span style={s.stepNum(true)}>1</span>
        <span style={s.stepTitle(true)}>{t("configure.prStep")}</span>
      </div>
      <div style={{ ...s.stepBody, marginBottom: 24 }}>
        <SearchableSelect
          mono={false}
          value={pr ? String(pr.number) : ""}
          placeholder={t("configure.prPlaceholder")}
          options={(pulls.data ?? []).map((p) => ({
            value: String(p.number),
            label: t("configure.prOption", { number: p.number, title: p.title }),
          }))}
          onChange={onSelectPr}
        />
      </div>

      <div style={s.stepHead}>
        <span style={s.stepNum(!!pr)}>2</span>
        <span style={s.stepTitle(!!pr)}>{t("configure.agentsStep")}</span>
        {pr && enabled.length > 0 && (
          <span style={s.actions}>
            <button
              type="button"
              style={s.link}
              onClick={() => setPicked(new Set(enabled.map((a) => a.id)))}
            >
              {t("checklist.selectAll")}
            </button>
            <button type="button" style={s.link} onClick={() => setPicked(new Set())}>
              {t("checklist.clearAll")}
            </button>
          </span>
        )}
      </div>
      {enabled.length === 0 ? (
        <EmptyState
          icon="Cpu"
          title={t("empty.noAgentsTitle")}
          body={t("empty.noAgentsBody")}
          cta={t("empty.goToAgents")}
          onCta={() => router.push("/agents")}
        />
      ) : !pr ? (
        <div style={s.pickPr}>
          <Icon.GitPullRequest size={21} style={{ color: "var(--text-muted)" }} />
          <div style={s.pickPrTitle}>{t("configure.pickPrTitle")}</div>
          <p style={s.pickPrBody}>{t("configure.pickPrBody")}</p>
        </div>
      ) : (
        <div style={{ ...s.stepBody, ...s.cards }}>
          {enabled.map((a, i) => (
            <AgentPickCard
              key={a.id}
              agent={a}
              color={agentColor(i)}
              checked={checked.has(a.id)}
              onToggle={() => toggle(a.id)}
              showEstimate={estimatesKnown}
              estimate={estimateByAgent.get(a.id)}
            />
          ))}
        </div>
      )}

      {enabled.length > 0 && (
        <div style={s.runBar}>
          <Button
            kind="primary"
            icon="Users"
            disabled={!pr || checkedIds.length === 0}
            loading={run.isPending}
            onClick={start}
          >
            {runLabel}
          </Button>
          {pr && checkedIds.length > 0 && (
            <span className="mono" style={s.estimate}>
              {estimateText}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
