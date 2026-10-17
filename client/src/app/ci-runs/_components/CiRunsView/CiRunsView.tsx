/* CiRunsView — /ci-runs: every stored CI run, newest first, 50 per page (AC-83), with filters in the URL
   (AC-94), a Refresh button and an automatic refresh every minute (AC-99). When GitHub cannot be reached the
   stored runs stay on screen with a notice (AC-116). Design: `screen_cizruns.jsx` ScreenCIRuns. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { usePageCrumb } from "@/components/app-shell";
import { CiRunTable } from "@/components/ci-run-table";
import { useAgents, useCiAutoRefresh, useCiRuns, useRepos } from "@/lib/hooks";
import { useSearchParamState } from "@/lib/use-search-param-state";
import { CiRunsFilters } from "../CiRunsFilters";
import { ALL_RUNS, DEFAULT_PERIOD, isUnfiltered, parseFilters } from "./helpers";
import { s } from "./styles";

export function CiRunsView() {
  const t = useTranslations("ci");
  const router = useRouter();
  usePageCrumb([{ label: t("page.crumb") }]);

  const [periodParam, setPeriod] = useSearchParamState("period", DEFAULT_PERIOD);
  const [agentParam, setAgent] = useSearchParamState("agent", null);
  const [repoParam, setRepo] = useSearchParamState("repo", null);
  const [statusParam, setStatus] = useSearchParamState("status", null);
  const filters = parseFilters({ period: periodParam, agent: agentParam, repo: repoParam, status: statusParam });

  const agents = useAgents();
  const repos = useRepos();
  const runsQ = useCiRuns(filters);
  const { githubError, refreshing, refreshNow } = useCiAutoRefresh();

  const runs = runsQ.data?.pages.flatMap((p) => p.runs) ?? [];
  const listEmpty = runsQ.data !== undefined && runs.length === 0;
  // An empty list under a filter does not say whether the workspace has any run: ask once for all of them.
  const probe = useCiRuns(ALL_RUNS, { enabled: listEmpty && !isUnfiltered(filters) });
  const probeEmpty = probe.data ? probe.data.pages.every((p) => p.runs.length === 0) : null;
  const workspaceEmpty = listEmpty && (isUnfiltered(filters) || probeEmpty === true);

  let body: React.ReactNode;
  if (runsQ.isError && !runsQ.data) {
    body = <ErrorState body={t("runs.loadError")} onRetry={() => void runsQ.refetch()} />;
  } else if (!runsQ.data || (listEmpty && !isUnfiltered(filters) && probeEmpty === null && !probe.isError)) {
    body = (
      <div aria-busy="true" aria-label={t("runs.loading")} style={s.loading}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  } else if (workspaceEmpty) {
    body = (
      <EmptyState
        icon="Workflow"
        title={t("runs.emptyTitle")}
        body={t("runs.emptyBody")}
        cta={t("runs.emptyCta")}
        onCta={() => router.push("/agents")}
      />
    );
  } else if (listEmpty) {
    body = <EmptyState icon="Filter" title={t("runs.noMatch")} />;
  } else {
    body = (
      <>
        <CiRunTable runs={runs} />
        {runsQ.isFetchNextPageError && (
          <p role="alert" style={s.moreError}>
            {t("runs.loadMoreFailed")}
          </p>
        )}
        {runsQ.hasNextPage && (
          <div style={s.more}>
            <Button
              kind="secondary"
              loading={runsQ.isFetchingNextPage}
              onClick={() => void runsQ.fetchNextPage()}
            >
              {t("runs.loadMore")}
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.head}>
        <div>
          <h1 style={s.h1}>{t("runs.title")}</h1>
          <p style={s.subtitle}>{t("runs.subtitle")}</p>
        </div>
        <div style={s.headRight}>
          <span style={s.auto}>
            <span style={s.autoDot} aria-hidden="true" />
            {t("runs.autoRefresh")}
          </span>
          <Button kind="secondary" size="sm" icon="RefreshCw" loading={refreshing} onClick={refreshNow}>
            {refreshing ? t("runs.refreshing") : t("runs.refresh")}
          </Button>
        </div>
      </div>
      {githubError && (
        <p role="status" style={s.notice}>
          {t("runs.refreshFailed")}
        </p>
      )}
      {!workspaceEmpty && (
        <CiRunsFilters
          filters={filters}
          agents={agents.data ?? []}
          repos={repos.data ?? []}
          onPeriod={(v) => setPeriod(v === DEFAULT_PERIOD ? null : v)}
          onAgent={setAgent}
          onRepo={setRepo}
          onStatus={setStatus}
        />
      )}
      <div style={s.body}>{body}</div>
    </div>
  );
}
