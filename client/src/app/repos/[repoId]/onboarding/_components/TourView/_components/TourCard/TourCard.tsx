"use client";

import type React from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@devdigest/ui";
import type { TourSectionKind } from "@devdigest/shared";
import { s } from "../../styles";

interface TourCardProps {
  kind: TourSectionKind;
  icon: IconName;
  title: string;
  open: boolean;
  onToggle: () => void;
  /** The section has no items and no text. */
  empty: boolean;
  children: React.ReactNode;
}

/** One section of the tour: a card whose header toggles its body. The kind is the card's DOM id (the page anchor). */
export function TourCard({ kind, icon, title, open, onToggle, empty, children }: TourCardProps) {
  const t = useTranslations("onboarding");
  const SectionIcon = Icon[icon];
  const bodyId = `${kind}-body`;
  return (
    <section id={kind} aria-labelledby={`${kind}-title`} style={s.card}>
      <h3 style={{ margin: 0 }}>
        <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={onToggle} style={s.cardHeader}>
          <span style={s.cardIcon} aria-hidden="true">
            <SectionIcon size={15} />
          </span>
          <span id={`${kind}-title`} style={s.cardTitle}>
            {title}
          </span>
          <Icon.ChevronDown size={16} style={s.chevron(open)} aria-hidden="true" />
        </button>
      </h3>
      {open && (
        <div id={bodyId} style={s.cardBody}>
          {empty ? <p style={s.cardEmpty}>{t("sections.empty")}</p> : children}
        </div>
      )}
    </section>
  );
}
