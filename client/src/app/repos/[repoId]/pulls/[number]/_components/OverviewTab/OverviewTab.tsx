"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Skeleton } from "@devdigest/ui";
import type { ReviewRecord } from "@devdigest/shared";
import { useGenerateBrief, usePrBrief } from "@/lib/hooks/brief";
import { latestRoundSummary } from "@/lib/latest-round-findings";
import { notify } from "@/lib/toast";
import { useDiffJump } from "../../use-diff-jump";
import { BlastRadiusCard } from "./_components/BlastRadiusCard";
import { IntentCard } from "./_components/IntentCard";
import { PrBriefBlock } from "./_components/PrBriefBlock";
import { ReviewFocus } from "./_components/ReviewFocus";
import { RiskAreas } from "./_components/RiskAreas";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string;
  repoId: string;
  /** "owner/repo" (null until the repo loads) — builds the caller links. */
  repoFullName: string | null;
  prBody: string | null | undefined;
  /** Head SHA from the freshly-refreshed PR detail — keys the intent, blast and brief queries. */
  headSha: string | null | undefined;
  /** The PR's reviews, newest first — the banner shows the latest round's verdict and counts. */
  reviews: ReviewRecord[];
  /** The PR list's score for this PR (null until reviewed) — the banner shows the same number. */
  score: number | null;
  /** Paths of the PR's changed files — a brief file reference only jumps when it is one of them. */
  filePaths: string[];
}

export function OverviewTab({
  prId,
  repoId,
  repoFullName,
  prBody,
  headSha,
  reviews,
  score,
  filePaths,
}: OverviewTabProps) {
  const t = useTranslations("prReview");
  const tBrief = useTranslations("brief");
  const read = usePrBrief(prId, headSha);
  const generate = useGenerateBrief(prId);
  const jump = useDiffJump();
  const brief = read.data?.brief ?? null;
  const generating = generate.generating;

  const openFile = (file: string, line?: number) => {
    if (filePaths.includes(file)) jump(file, line);
    else notify.info(tBrief("fileNotInDiff"));
  };

  return (
    <>
      <PrBriefBlock read={read} generate={generate} round={latestRoundSummary(reviews)} score={score} />

      <div style={s.grid}>
        <IntentCard prId={prId} headSha={headSha} />
        <BlastRadiusCard
          prId={prId}
          repoId={repoId}
          repoFullName={repoFullName}
          headSha={headSha}
        />
      </div>

      {generating ? (
        <>
          <section aria-hidden>
            <Skeleton height={64} />
          </section>
          <section aria-hidden>
            <Skeleton height={96} />
          </section>
        </>
      ) : (
        brief && (
          <>
            <RiskAreas key={brief.generated_at} risks={brief.risks} onOpenFile={(file) => openFile(file)} />
            <ReviewFocus items={brief.review_focus} onOpenFile={openFile} />
          </>
        )
      )}

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">{t("overview.description")}</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
