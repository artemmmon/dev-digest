/* PR Detail — /repos/:repoId/pulls/:number. F2 shell extended by A2 with:
   - Findings panel (VerdictBanner + FindingCards)
   - RunReviewDropdown (run all / a specific agent) + live SSE RunStatus
   - Basic file-by-file diff viewer in the Files tab
   Tab and open trace live in the query string (?tab, ?trace). */
"use client";

import React, { type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton, ErrorState, EmptyState } from "@devdigest/ui";
import { usePageCrumb } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { PrDetailHeader } from "./_components/PrDetailHeader";
import { OverviewTab } from "./_components/OverviewTab";
import { FindingsTab } from "./_components/FindingsTab";
import { DiffTab } from "./_components/DiffTab";
import { RunTraceDrawer } from "./_components/RunTraceDrawer";
import { usePullDetail, usePulls } from "@/lib/hooks";
import { usePrReviews, usePrRunTracking } from "@/lib/hooks/reviews";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { githubPrUrl } from "@/lib/github-urls";
import { useSearchParamState } from "@/lib/use-search-param-state";
import { useElementHeight } from "./useElementHeight";

export default function PRDetailPage() {
  const t = useTranslations("prReview");
  const params = useParams<{ repoId: string; number: string }>();
  const router = useRouter();
  const { repoId, number } = params;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  // The route is keyed by PR number, but every PR API is keyed by the row's
  // uuid — resolve number → uuid via the (cached) pulls list before fetching.
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const prId = pulls?.find((p) => p.number === Number(number))?.id ?? null;
  const { data: pr, isLoading: detailLoading, isError, error, refetch } = usePullDetail(prId);
  const isLoading = pullsLoading || (prId != null && detailLoading);
  const { data: reviews } = usePrReviews(prId);

  // Live run tracking is SERVER-SOURCED (agent_runs status='running'): survives
  // navigation AND reload, and self-clears via polling when runs finish.
  const { liveRunIds, history, onRunsStarted } = usePrRunTracking(prId);

  const [tab, setTab] = useSearchParamState("tab", "overview");
  const [traceRunId, setTraceRunId] = useSearchParamState("trace", null);

  // The route measures its own header and publishes the height as `--pr-header-h` on
  // the wrapper it renders, so a sticky element further down the page (Smart Diff's
  // RoleGroup headers) can stick right below it without a hardcoded offset.
  const [headerRef, headerHeight] = useElementHeight<HTMLDivElement>();

  // Reviews come newest-first; each is its own run (grouped into accordions).
  const runs = React.useMemo(() => reviews ?? [], [reviews]);
  const findingsCount = React.useMemo(
    () => runs.reduce((sum, r) => sum + r.findings.length, 0),
    [runs],
  );

  const repoName = activeRepo?.full_name ?? repoId;
  // The real "owner/repo" (null until the repo is loaded) — used to build
  // github.com deep-links for the header and finding file references.
  const repoFullName = activeRepo?.full_name ?? null;
  const crumb = [
    { label: repoName, mono: true, href: `/repos/${repoId}/pulls` },
    { label: t("list.breadcrumb"), href: `/repos/${repoId}/pulls` },
    { label: `#${number}`, mono: true },
  ];
  usePageCrumb(crumb);

  // Stale/unknown :repoId → friendly empty state instead of a 404 error.
  if (repoNotFound) {
    return (
      <RepoNotFound />
    );
  }

  if (isLoading) {
    return (
      <>
        <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 1080, margin: "0 auto" }}>
          <Skeleton height={28} width={420} />
          <Skeleton height={16} width={300} />
          <Skeleton height={200} />
        </div>
      </>
    );
  }

  // The number isn't in the repo's PR list (or the row vanished): a stale link,
  // not a failure — Retry could never succeed, so offer the way back instead.
  const prMissing =
    (pulls !== undefined && prId == null) || (error instanceof ApiError && error.status === 404);
  if (prMissing) {
    return (
      <>
        <EmptyState
          icon="GitPullRequest"
          title={t("notFound.title")}
          body={t("notFound.body", { number })}
          cta={t("notFound.cta")}
          onCta={() => router.push(`/repos/${repoId}/pulls`)}
        />
      </>
    );
  }

  if (isError || !pr || !prId) {
    return (
      <>
        <ErrorState
          fullScreen
          title={t("detail.loadFailedTitle")}
          body={error instanceof ApiError ? error.message : t("detail.loadFailedBody", { number })}
          onRetry={() => refetch()}
        />
      </>
    );
  }

  return (
    <>
      <div
        style={
          {
            "--pr-header-h": headerHeight != null ? `${headerHeight}px` : undefined,
          } as CSSProperties
        }
      >
        <PrDetailHeader
          ref={headerRef}
          pr={pr}
          prId={prId}
          tab={tab}
          findingsCount={findingsCount}
          githubUrl={repoFullName ? githubPrUrl(repoFullName, pr.number) : null}
          repoStack={activeRepo?.stack}
          onSetTab={setTab}
          onRunStart={() => setTab("findings")}
          onRunsStarted={onRunsStarted}
        />

        <div style={{ padding: "24px 32px 44px", display: "flex", flexDirection: "column", gap: 24, maxWidth: 1080, margin: "0 auto" }}>
          {tab === "overview" && <OverviewTab prId={prId} prBody={pr.body} headSha={pr.head_sha} />}

          {tab === "findings" && (
            <FindingsTab
              prId={prId}
              liveRunIds={liveRunIds}
              reviews={runs}
              history={history}
              commits={pr.commits}
              repoFullName={repoFullName}
              headSha={pr.head_sha}
              onOpenTrace={setTraceRunId}
              // RunStatus's SSE "done" only needs the active-runs query refetched — the
              // page's own >0 → 0 transition effect (`usePrRunTracking`) does the one
              // full refresh once that refetch actually reports zero live runs.
              onRunsSettled={onRunsStarted}
            />
          )}

          {tab === "diff" && (
            <DiffTab
              prId={prId}
              filesCount={pr.files_count}
              files={pr.files}
              canComment={pr.status === "open"}
              repoFullName={repoFullName}
              headSha={pr.head_sha}
            />
          )}
        </div>
      </div>

      {traceRunId && (
        <RunTraceDrawer
          runId={traceRunId}
          prNumber={pr.number}
          findings={runs.find((r) => r.run_id === traceRunId)?.findings ?? []}
          agentName={runs.find((r) => r.run_id === traceRunId)?.agent_name ?? null}
          running={liveRunIds.includes(traceRunId)}
          onClose={() => setTraceRunId(null)}
        />
      )}
    </>
  );
}
