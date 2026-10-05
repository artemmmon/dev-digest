"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { Tour, TourSectionKind } from "@devdigest/shared";
import { useCopyFeedback } from "../../hooks/useCopyFeedback";
import { tourToMarkdown } from "../../helpers";
import { TOUR_KINDS } from "../../constants";
import { s } from "../../styles";

interface TourHeaderProps {
  tour: Tour;
  /** Short repository name for the title. */
  repoName: string;
  /** Full `owner/name`, the title of the markdown export. */
  repoFullName: string;
  /** The repository's indexed commit differs from the tour's. */
  stale: boolean;
  /** A generation is running (or being started). */
  regenerating: boolean;
  onRegenerate: () => void;
}

const COPY_KEY = "tour";

/** Title, subtitle, stale and limited-index notes, and the Regenerate / Copy as Markdown actions. */
export function TourHeader({ tour, repoName, repoFullName, stale, regenerating, onRegenerate }: TourHeaderProps) {
  const t = useTranslations("onboarding");
  const format = useFormatter();
  const { result, copy } = useCopyFeedback();

  // A tour stamped a moment ahead of this clock (skew) still reads as "just now", never "in 3 seconds".
  const generatedAt = new Date(tour.generated_at);
  const now = new Date();
  const generated = format.relativeTime(generatedAt, generatedAt > now ? generatedAt : now);

  const onCopy = () => {
    const sections = Object.fromEntries(TOUR_KINDS.map((kind) => [kind, t(`sections.${kind}`)])) as Record<
      TourSectionKind,
      string
    >;
    const markdown = tourToMarkdown(tour, repoFullName, {
      heading: t("header.heading"),
      sections,
      empty: t("sections.empty"),
      source: t("run.source"),
      complexity: {
        low: t("tasks.complexity.low"),
        medium: t("tasks.complexity.medium"),
        high: t("tasks.complexity.high"),
      },
    });
    void copy(COPY_KEY, markdown);
  };
  const outcome = result?.key === COPY_KEY ? result.ok : null;

  return (
    <header style={s.header}>
      <div style={s.headerText}>
        <h1 style={s.h1}>
          {t("header.heading")}{" "}
          <span className="mono" style={s.repo}>
            {repoName}
          </span>
        </h1>
        <p style={s.subtitle}>{t("header.subtitle", { count: tour.files_indexed, time: generated })}</p>
        {(stale || tour.limited_index) && (
          <div style={s.notes}>
            {stale && (
              <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
                {t("header.stale")}
              </Badge>
            )}
            {tour.limited_index && <span style={s.note}>{t("header.limitedIndex")}</span>}
          </div>
        )}
      </div>
      <div style={s.headerActions}>
        <span aria-live="polite" style={outcome === false ? s.confirmationError : s.confirmation}>
          {outcome === null ? "" : outcome ? t("copy.done") : t("copy.failed")}
        </span>
        <Button kind="ghost" size="sm" icon="RefreshCw" disabled={regenerating} onClick={onRegenerate}>
          {regenerating ? t("header.regenerating") : t("header.regenerate")}
        </Button>
        <Button kind="secondary" size="sm" icon="Copy" onClick={onCopy}>
          {t("copy.action")}
        </Button>
      </div>
    </header>
  );
}
