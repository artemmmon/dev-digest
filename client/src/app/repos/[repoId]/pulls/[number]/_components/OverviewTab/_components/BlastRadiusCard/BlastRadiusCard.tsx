/* BlastRadiusCard — PR Overview "BLAST RADIUS" card: the precomputed repo-intel map of what the
   changed symbols reach (callers, endpoints, cron jobs). Reads GET /pulls/:id/blast — no LLM. The
   numbers come from the server's `counts`; the sentence is built here from the JSON, not from
   `blast.summary`. States: loading · error · no files yet · nothing indexed · map (+ degraded). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import { useBlastRadius } from "@/lib/hooks/blast";
import { BlastDegradedNotice } from "./_components/BlastDegradedNotice";
import { BlastGraph } from "./_components/BlastGraph";
import { BlastSummary } from "./_components/BlastSummary";
import { BlastTree } from "./_components/BlastTree";
import { s } from "./styles";

type View = "tree" | "graph";
const VIEWS: View[] = ["tree", "graph"];

interface BlastRadiusCardProps {
  prId: string;
  repoId: string;
  repoFullName: string | null | undefined;
  /** Head SHA from the refreshed PR detail — keys the query and pins caller links. */
  headSha: string | null | undefined;
}

export function BlastRadiusCard({ prId, repoId, repoFullName, headSha }: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const { data, isPending, isError, refetch } = useBlastRadius(prId, headSha);
  const [view, setView] = React.useState<View>("tree");
  const label = <SectionLabel icon="Workflow">{t("card.label")}</SectionLabel>;

  if (isPending) {
    return (
      <section style={s.root}>
        {label}
        <Skeleton height={160} />
      </section>
    );
  }

  if (isError) {
    return (
      <section style={s.root}>
        {label}
        <div style={s.card}>
          <ErrorState
            title={t("card.errorTitle")}
            body={t("card.errorBody")}
            onRetry={() => void refetch()}
          />
        </div>
      </section>
    );
  }

  const { blast, index, counts, limits, truncated } = data;
  const hasSymbols = blast.changed_symbols.length > 0;
  const hasDownstream = blast.downstream.length > 0;

  if (counts.changed_files === 0) {
    return (
      <section style={s.root}>
        {label}
        <div style={s.card}>
          <EmptyState icon="Workflow" title={t("card.noFiles")} />
        </div>
      </section>
    );
  }

  return (
    <section style={s.root}>
      {label}
      <div style={s.card}>
        {index.reason && <BlastDegradedNotice prId={prId} repoId={repoId} reason={index.reason} />}

        {!hasSymbols && !index.degraded && (
          <EmptyState icon="Workflow" title={t("card.noSymbols")} />
        )}

        {hasSymbols && (
          <>
            <div style={s.header}>
              <BlastSummary counts={counts} />
              {hasDownstream && (
                <div style={s.switcher} role="group" aria-label={t("view.ariaLabel")}>
                  {VIEWS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={view === v}
                      onClick={() => setView(v)}
                      style={s.switchBtn(view === v)}
                    >
                      {t(`view.${v}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!hasDownstream && <p style={s.plain}>{t("noDownstream", { count: counts.symbols })}</p>}
            {hasDownstream && view === "tree" && (
              <BlastTree
                downstream={blast.downstream}
                repoFullName={repoFullName}
                headSha={headSha}
              />
            )}
            {hasDownstream && view === "graph" && <BlastGraph downstream={blast.downstream} />}

            {hasDownstream && <p style={s.note}>{t("linesAtIndex")}</p>}
            {truncated && (
              <p style={s.note}>{t("truncated", { max: limits.max_callers_per_symbol })}</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
