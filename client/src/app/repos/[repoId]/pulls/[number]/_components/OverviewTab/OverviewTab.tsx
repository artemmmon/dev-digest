"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "./_components/IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string;
  prBody: string | null | undefined;
  /** Head SHA from the freshly-refreshed PR detail — keys the intent query. */
  headSha: string | null | undefined;
}

export function OverviewTab({ prId, prBody, headSha }: OverviewTabProps) {
  const t = useTranslations("prReview");
  return (
    <>
      <div style={s.grid}>
        <IntentCard prId={prId} headSha={headSha} />
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
