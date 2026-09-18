"use client";

import React, { useCallback } from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Button, SectionLabel, EmptyState } from "@devdigest/ui";
import { RunStatus } from "../RunStatus";
import { RunHistory } from "../RunHistory";
import { ReviewRunAccordion, type ReviewRunHandle } from "../ReviewRunAccordion";
import { s } from "./styles";
import type { FindingsBySeverity, ReviewRecord, RunSummary, PrCommit } from "@devdigest/shared";
import { countBySeverity } from "@/lib/severity-counts";
import { useCancelRun, useDeleteRun } from "@/lib/hooks/reviews";

interface FindingsTabProps {
  prId: string;
  /** Runs the server reports as in flight (their live log streams here). */
  liveRunIds: string[];
  /** Persisted reviews of the PR, newest first — one per agent run. */
  reviews: ReviewRecord[];
  /** Every run of the PR (any status), for the timeline. */
  history: RunSummary[] | undefined;
  commits: PrCommit[];
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  onOpenTrace: (id: string) => void;
  /** Called once when the live streams end. */
  onRunsSettled: () => void;
}

export function FindingsTab({
  prId,
  liveRunIds,
  reviews,
  history,
  commits,
  repoFullName,
  headSha,
  onOpenTrace,
  onRunsSettled,
}: FindingsTabProps) {
  const t = useTranslations("prReview");
  const cancel = useCancelRun(prId);
  const deleteRun = useDeleteRun(prId);
  const reviewRunning = liveRunIds.length > 0;
  const lethalTrifecta = React.useMemo(
    () => reviews.flatMap((r) => r.findings).filter((f) => f.kind === "lethal_trifecta"),
    [reviews],
  );

  // Severity tally per timeline run, grouped from the reviews already in the cache —
  // `GET /pulls/:id/runs` carries no breakdown, and no extra request is made for one.
  const severityByRun = React.useMemo(() => {
    const map = new Map<string, FindingsBySeverity>();
    for (const review of reviews) {
      if (review.run_id) map.set(review.run_id, countBySeverity(review.findings));
    }
    return map;
  }, [reviews]);

  const handleCancelAll = () => liveRunIds.forEach((id) => cancel.mutate(id));

  const handleDelete = useCallback(
    (id: string) => {
      if (window.confirm(t("timeline.deleteConfirm"))) deleteRun.mutate(id);
    },
    [deleteRun, t],
  );

  // Timeline → Review-runs navigation: clicking an agent name in the timeline opens and
  // scrolls to that run's accordion, which registers a handle here.
  const accordions = React.useRef(new Map<string, ReviewRunHandle>());
  const handleGoToReview = useCallback((runId: string) => {
    accordions.current.get(runId)?.reveal();
  }, []);

  return (
    <section>
      {liveRunIds.length > 0 && (
        <div style={s.liveRunSection}>
          <SectionLabel
            icon="Sparkles"
            right={
              <div style={s.cancelActions}>
                <Button
                  kind="danger"
                  size="sm"
                  icon="X"
                  loading={cancel.isPending}
                  onClick={handleCancelAll}
                >
                  {t("liveRun.cancel")}
                </Button>
                <Button kind="ghost" size="sm" icon="FileText" onClick={() => liveRunIds[0] && onOpenTrace(liveRunIds[0])}>
                  {t("liveRun.openTrace")}
                </Button>
              </div>
            }
          >
            {t("sections.liveRun")}
          </SectionLabel>
          <RunStatus runIds={liveRunIds} onDone={onRunsSettled} />
        </div>
      )}

      {reviewRunning && (
        <div style={s.reviewInProgress}>
          <Icon.RefreshCw size={16} style={{ color: "var(--accent)", animation: "ddspin 1s linear infinite" }} />
          <span style={s.reviewInProgressText}>{t("liveRun.inProgress")}</span>
          <span style={s.reviewInProgressSub}>{t("liveRun.inProgressBody")}</span>
        </div>
      )}

      {lethalTrifecta.length > 0 && (
        <div style={s.lethalTrifecta}>
          <Icon.Shield size={16} style={{ color: "var(--crit)" }} />
          <span style={s.lethalTrifectaTitle}>{t("trifectaBanner.title")}</span>
          <Badge color="var(--crit)" bg="transparent">
            {t("trifectaBanner.count", { count: lethalTrifecta.length })}
          </Badge>
        </div>
      )}

      {((history && history.length > 0) || commits.length > 0) && (
        <div style={s.timelineSection}>
          <SectionLabel
            icon="Activity"
            right={<span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("sections.timelineHint")}</span>}
          >
            {t("sections.timeline")}
          </SectionLabel>
          <RunHistory
            runs={history ?? []}
            commits={commits}
            severityByRun={severityByRun}
            onOpenTrace={onOpenTrace}
            onGoToReview={handleGoToReview}
            onDelete={handleDelete}
          />
        </div>
      )}

      <SectionLabel
        icon="AlertOctagon"
        right={<span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("sections.reviewRunsHint")}</span>}
      >
        {t("sections.reviewRuns")}
      </SectionLabel>
      {reviews.length === 0 ? (
        reviewRunning ? null : (
          <EmptyState icon="Sparkles" title={t("empty.title")} body={t("empty.body")} />
        )
      ) : (
        reviews.map((review, i) => (
          <ReviewRunAccordion
            key={review.id}
            ref={(handle) => {
              const runId = review.run_id;
              if (!runId || !handle) return;
              accordions.current.set(runId, handle);
              return () => {
                accordions.current.delete(runId);
              };
            }}
            review={review}
            prId={prId}
            defaultOpen={i === 0}
            repoFullName={repoFullName}
            headSha={headSha}
          />
        ))
      )}
    </section>
  );
}
