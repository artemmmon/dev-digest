"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Icon } from "@devdigest/ui";
import type { PrFile } from "@devdigest/shared";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import {
  usePrComments,
  useCreatePrComment,
  usePrReviews,
  useFindingAction,
} from "@/lib/hooks/reviews";
import { usePrSmartDiff } from "@/lib/hooks/core";
import { latestRoundFindings } from "@/lib/latest-round-findings";
import { FindingCard } from "../FindingCard";
import { buildRoleGroups } from "./helpers";
import { RoleGroup } from "./_components/RoleGroup";
import { s } from "./styles";

type Order = "smart" | "original";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
}

export function DiffTab({
  prId,
  filesCount,
  files,
  canComment,
  repoFullName,
  headSha,
}: DiffTabProps) {
  const t = useTranslations("shell");
  const tp = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: reviews } = usePrReviews(prId);
  const {
    data: smartDiff,
    isLoading: smartDiffLoading,
    isError: smartDiffError,
  } = usePrSmartDiff(prId);
  const action = useFindingAction();

  const findings = React.useMemo(() => latestRoundFindings(reviews), [reviews]);
  const hasReview = (reviews ?? []).some((r) => r.kind === "review");

  const [order, setOrder] = React.useState<Order>("smart");
  // null = never toggled by hand: the effective value defaults to "the latest
  // round has findings", so a clean diff keeps today's hidden-by-default comments
  // and a PR with findings shows them without a click (P1.5 / P2.7).
  const [override, setOverride] = React.useState<boolean | null>(null);
  const show = override ?? findings.length > 0;

  const commentCount = comments?.length ?? 0;
  const toggleCount = commentCount + findings.length;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments: show,
    posting: create.isPending,
    // A failure is toasted once by the global MutationCache handler; rethrown by
    // mutateAsync so the composer keeps the draft.
    onSubmit: async (input) => {
      const res = await create.mutateAsync(input);
      setOverride(true); // a just-posted comment shouldn't stay hidden
      return res;
    },
  };

  const findingsApi: DiffFindingApi = {
    findings,
    show,
    renderFinding: (f) => (
      <FindingCard
        f={f}
        defaultExpanded
        onAction={(a) => prId && action.mutate({ findingId: f.id, action: a, prId })}
        pending={action.isPending}
        repoFullName={repoFullName}
        headSha={headSha}
      />
    ),
  };

  // While the smart diff hasn't loaded (or failed), fall back to Original so the
  // diff is never blocked on it.
  const useOriginal = order === "original" || smartDiffLoading || smartDiffError || !smartDiff;
  const roleGroups = React.useMemo(
    () => (smartDiff ? buildRoleGroups(smartDiff, files).filter((g) => g.files.length > 0) : []),
    [smartDiff, files],
  );

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          toggleCount > 0 ? (
            <Button
              kind="ghost"
              size="sm"
              icon={show ? "EyeOff" : "Eye"}
              onClick={() => setOverride(!show)}
            >
              {show ? t("diffViewer.hideComments") : t("diffViewer.showComments")} ({toggleCount})
            </Button>
          ) : undefined
        }
      >
        {t("diffViewer.filesChanged", { count: filesCount })}
      </SectionLabel>

      <div role="group" aria-label={tp("smartDiff.orderGroupLabel")} style={s.orderGroup}>
        <Button
          kind="tertiary"
          size="sm"
          active={order === "smart"}
          aria-pressed={order === "smart"}
          onClick={() => setOrder("smart")}
        >
          {tp("smartDiff.smartOrder")}
        </Button>
        <Button
          kind="tertiary"
          size="sm"
          active={order === "original"}
          aria-pressed={order === "original"}
          onClick={() => setOrder("original")}
        >
          {tp("smartDiff.originalOrder")}
        </Button>
      </div>

      {useOriginal ? (
        <DiffViewer files={files} commenting={commenting} findings={findingsApi} />
      ) : (
        <>
          {!hasReview && (
            <div style={s.reviewNotRun}>
              <Icon.Sparkles size={14} />
              {tp("smartDiff.reviewNotRun")}
            </div>
          )}
          <div style={s.groups}>
            {roleGroups.map((group) => (
              <RoleGroup
                key={group.role}
                role={group.role}
                files={group.files}
                commenting={commenting}
                findings={findingsApi}
                showCounter={hasReview}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
