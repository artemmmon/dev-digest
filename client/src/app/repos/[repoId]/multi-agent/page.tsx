/* Multi-Agent Review — /repos/:repoId/multi-agent. Thin: it maps `?pr=<number>` to the PR and picks
   the screen. The selection lives in the URL (?pr, ?run, ?new), so a view survives reload and can
   be linked. Screens:
     no/unknown pr            → Configure run, nothing selected
     pr + ?new=1, or no runs  → Configure run with the PR
     otherwise                → results of ?run, else the newest run */
"use client";

import React, { Suspense } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { usePageCrumb } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { usePulls } from "@/lib/hooks/core";
import { useMultiAgentRuns } from "@/lib/hooks/multi-agent";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useSearchParamState, useSearchParamsUpdate } from "@/lib/use-search-param-state";
import { ConfigureRun } from "./_components/ConfigureRun";
import { MultiAgentResults } from "./_components/MultiAgentResults";

function MultiAgentScreen() {
  const t = useTranslations("multiAgent");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const [prParam] = useSearchParamState("pr", null);
  const [runParam] = useSearchParamState("run", null);
  const [newParam] = useSearchParamState("new", null);
  const update = useSearchParamsUpdate();

  // The URL carries the PR number; every PR API is keyed by the row's uuid.
  const pulls = usePulls(repoId);
  const pr = prParam == null ? null : (pulls.data?.find((p) => String(p.number) === prParam) ?? null);
  const runs = useMultiAgentRuns(pr?.id);

  const repoName = activeRepo?.full_name ?? repoId;
  const runId = runParam ?? runs.data?.[0]?.id ?? null;
  // An explicit ?run wins over an empty or stale cached run list.
  const showConfigure =
    !pr || newParam === "1" || (runs.isSuccess && runParam == null && runs.data.length === 0);
  usePageCrumb([
    { label: repoName, mono: true, href: `/repos/${repoId}/pulls` },
    { label: t("crumb.root") },
    ...(showConfigure
      ? [{ label: t("crumb.configure") }]
      : pr
        ? [{ label: `#${pr.number}`, mono: true }]
        : []),
  ]);

  if (repoNotFound) return <RepoNotFound />;

  // A PR is named in the URL but the list (or its runs) is still loading.
  if (prParam != null && (pulls.isLoading || (pr && newParam !== "1" && runs.isLoading))) {
    return (
      <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 1080, margin: "0 auto" }}>
        <Skeleton height={28} width={420} />
        <Skeleton height={16} width={300} />
        <Skeleton height={200} />
      </div>
    );
  }
  if (pr && newParam !== "1" && runs.isError) {
    return <ErrorState title={t("results.loadErrorTitle")} onRetry={() => void runs.refetch()} />;
  }

  if (showConfigure) {
    return (
      <ConfigureRun
        key={pr?.number ?? "none"}
        repoId={repoId}
        prNumber={pr ? String(pr.number) : null}
        // Picking a PR keeps the Configure screen even when that PR already has runs (`new=1`).
        onSelectPr={(number) => update({ pr: number, new: "1", run: null })}
        onStarted={(id) => update({ run: id, new: null })}
      />
    );
  }

  // Past the checks above: a PR with runs, and a run to show (`?run`, else the newest).
  if (!pr?.id || !runId) return null;
  return (
    <MultiAgentResults
      key={pr.id}
      pr={pr}
      prId={pr.id}
      runId={runId}
      runs={runs.data ?? []}
      repoFullName={activeRepo?.full_name ?? null}
      onSelectRun={(id) => update({ run: id, trace: null })}
      onStartNew={() => update({ new: "1", run: null, trace: null })}
    />
  );
}

export default function MultiAgentPage() {
  return (
    <Suspense fallback={null}>
      <MultiAgentScreen />
    </Suspense>
  );
}
