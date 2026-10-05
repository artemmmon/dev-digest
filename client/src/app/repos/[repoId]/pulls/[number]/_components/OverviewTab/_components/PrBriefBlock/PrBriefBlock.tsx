/* PrBriefBlock — the "PR Brief" block at the top of the Overview tab (spec 12): a banner with the
   brief's summary, the latest review round's verdict / counts / score and a refresh control; then
   the stale note, the missing-data notice, the footer and (after a failed re-run) an inline error.
   Read pending and read failed never offer a paid generation. Every string the model wrote is
   shown as plain text. The Risk areas and Review focus slots live in OverviewTab. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { UseQueryResult } from "@tanstack/react-query";
import { Badge, Button, CircularScore, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrBriefResponse } from "@devdigest/shared";
import type { GenerateBrief } from "@/lib/hooks/brief";
import type { LatestRoundSummary } from "@/lib/latest-round-findings";
import { formatCost } from "@/lib/format-cost";
import { VERDICT_META } from "../../../../constants";
import { shortSha } from "../../helpers";
import { missingNameKey, missingNotice, noKeyProvider } from "./helpers";
import { s } from "./styles";

interface PrBriefBlockProps {
  read: UseQueryResult<PrBriefResponse>;
  generate: GenerateBrief;
  /** Headline of the latest review round; null when the PR has no review. */
  round: LatestRoundSummary | null;
  /** The PR list's score for this PR; null until it has been reviewed. */
  score: number | null;
}

/** Why a generation failed: the provider-has-no-key case names it and links to Settings. */
function GenerateErrorText({ error }: { error: unknown }) {
  const t = useTranslations("brief");
  const provider = noKeyProvider(error);
  if (provider === undefined) return <>{t("error.generateBody")}</>;
  return (
    <>
      {provider ? t("error.noKey", { provider }) : t("error.noKeyUnknown")}{" "}
      <Link href="/settings/api-keys" style={s.link}>
        {t("error.settingsLink")}
      </Link>
    </>
  );
}

export function PrBriefBlock({ read, generate, round, score }: PrBriefBlockProps) {
  const t = useTranslations("brief");
  const tReview = useTranslations("prReview");
  const generating = generate.generating;
  const label = <SectionLabel icon="FileText">{t("block.label")}</SectionLabel>;

  if (read.isPending) {
    return (
      <section aria-live="polite">
        {label}
        <Skeleton height={120} />
      </section>
    );
  }

  // A failed read must not look like "no brief yet": that would invite a paid generation.
  if (read.isError) {
    return (
      <section aria-live="polite">
        {label}
        <div style={s.errorCard}>
          <ErrorState
            title={t("error.loadTitle")}
            body={t("error.loadBody")}
            onRetry={() => void read.refetch()}
          />
        </div>
      </section>
    );
  }

  const brief = read.data?.brief ?? null;

  if (!brief) {
    if (generate.isError && !generating) {
      return (
        <section aria-live="polite">
          {label}
          <div style={s.errorCard}>
            <ErrorState
              title={t("error.generateTitle")}
              body={<GenerateErrorText error={generate.error} />}
              onRetry={() => generate.mutate()}
            />
          </div>
        </section>
      );
    }
    return (
      <section aria-live="polite">
        {label}
        <div style={s.empty}>
          <div style={s.emptyInner}>
            <div aria-hidden style={s.emptyIcon}>
              <Icon.FileText size={24} />
            </div>
            {generating ? (
              <div style={s.emptySkeleton}>
                <Skeleton height={12} width="80%" />
                <Skeleton height={12} width="60%" />
              </div>
            ) : (
              <>
                <div style={s.emptyTitle}>{t("empty.title")}</div>
                <p style={s.emptyBody}>{t("empty.body")}</p>
              </>
            )}
            <Button kind="primary" icon="FileText" disabled={generating} loading={generating} onClick={() => generate.mutate()}>
              {t("empty.generate")}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const stale = read.data?.stale === true;
  const sha = shortSha(brief.head_sha);
  const verdictMeta = round?.verdict ? VERDICT_META[round.verdict] : null;
  const VerdictIcon = verdictMeta ? Icon[verdictMeta.icon] : null;
  const notice = missingNotice(brief.missing);
  const noticeParts = [
    notice.absent.length > 0
      ? t("notice.without", { names: notice.absent.map((m) => t(missingNameKey(m))).join(", ") })
      : null,
    notice.intentStale ? t("notice.intentStale") : null,
    notice.trimmed.length > 0
      ? t("notice.trimmed", { names: notice.trimmed.map((m) => t(missingNameKey(m))).join(", ") })
      : null,
  ].filter((part): part is string => part != null);
  const regenFailed = generate.isError && !generating;

  return (
    <section aria-live="polite">
      {label}
      <div style={s.banner}>
        {verdictMeta && VerdictIcon && (
          <div aria-hidden style={s.iconBox(verdictMeta.bg, verdictMeta.c)}>
            <VerdictIcon size={22} />
          </div>
        )}
        <div style={s.main}>
          {round && (
            <div style={s.titleRow}>
              {verdictMeta && (
                <span style={s.verdictLabel(verdictMeta.c)}>
                  {tReview(`verdict.${verdictMeta.labelKey}`)}
                </span>
              )}
              <Badge color="var(--text-secondary)">
                {tReview("verdict.findingsCount", { count: round.findingsCount })}
                {round.blockers > 0 ? tReview("verdict.blockers", { count: round.blockers }) : ""}
              </Badge>
              {verdictMeta && (
                <button type="button" style={s.hint} title={t("verdictHint")} aria-label={t("verdictHint")}>
                  <Icon.Info size={13} />
                </button>
              )}
            </div>
          )}
          {generating ? (
            <div style={s.summarySkeleton}>
              <Skeleton height={12} width="92%" />
              <Skeleton height={12} width="78%" />
              <Skeleton height={12} width="55%" />
            </div>
          ) : (
            <p style={s.summary}>{brief.summary}</p>
          )}
        </div>
        <button
          type="button"
          style={s.refresh(generating)}
          title={t("refresh")}
          aria-label={t("refresh")}
          disabled={generating}
          onClick={() => generate.mutate()}
        >
          <Icon.RefreshCw size={16} />
        </button>
        {round && score != null && (
          <div style={s.scoreCol}>
            <CircularScore score={score} size={52} stroke={5} />
            <span style={s.scoreLabel}>{tReview("verdict.prScore")}</span>
          </div>
        )}
      </div>

      {stale && sha && <p style={s.note}>{t("stale", { sha })}</p>}
      {noticeParts.length > 0 && <p style={s.notice}>{noticeParts.join(". ")}</p>}
      {regenFailed && (
        <p role="alert" style={s.inlineError}>
          {noKeyProvider(generate.error) === undefined ? (
            t("error.regenerate")
          ) : (
            <GenerateErrorText error={generate.error} />
          )}
        </p>
      )}
      <p style={s.footer}>
        {t("footer.meta", {
          sha: sha ?? "",
          provider: brief.provider,
          model: brief.model,
          tokensIn: brief.tokens_in,
          tokensOut: brief.tokens_out,
        })}
        {brief.cost_usd != null ? t("footer.cost", { cost: formatCost(brief.cost_usd) }) : ""}
      </p>
    </section>
  );
}
