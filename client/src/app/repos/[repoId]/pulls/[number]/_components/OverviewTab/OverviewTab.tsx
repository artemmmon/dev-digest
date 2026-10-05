"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { BlastRadiusCard } from "./_components/BlastRadiusCard";
import { IntentCard } from "./_components/IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string;
  repoId: string;
  /** "owner/repo" (null until the repo loads) — builds the caller links. */
  repoFullName: string | null;
  prBody: string | null | undefined;
  /** Head SHA from the freshly-refreshed PR detail — keys the intent and blast queries. */
  headSha: string | null | undefined;
}

export function OverviewTab({ prId, repoId, repoFullName, prBody, headSha }: OverviewTabProps) {
  const t = useTranslations("prReview");
  return (
    <>
      <div style={s.grid}>
        <IntentCard prId={prId} headSha={headSha} />
        <BlastRadiusCard
          prId={prId}
          repoId={repoId}
          repoFullName={repoFullName}
          headSha={headSha}
        />
      </div>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">{t("overview.description")}</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
