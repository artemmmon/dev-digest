"use client";

import { useTranslations } from "next-intl";
import type { TourSectionKind } from "@devdigest/shared";
import { TOUR_KINDS } from "../../constants";
import { s } from "../../styles";

interface TourNavProps {
  /** The section at the top of the visible area. */
  active: TourSectionKind | undefined;
  /** Jump to a section: the parent opens its card if collapsed, scrolls to it and sets the page anchor. */
  onActivate: (kind: TourSectionKind) => void;
}

/** "On this page": one button per section, in tour order. */
export function TourNav({ active, onActivate }: TourNavProps) {
  const t = useTranslations("onboarding");
  return (
    <div style={s.navWrap}>
      <nav aria-label={t("nav.label")} style={s.navSticky}>
        <p style={s.navLabel}>{t("nav.label")}</p>
        <ul style={s.navList}>
          {TOUR_KINDS.map((kind) => (
            <li key={kind}>
              <button
                type="button"
                aria-current={kind === active ? "true" : undefined}
                onClick={() => onActivate(kind)}
                style={s.navItem(kind === active)}
              >
                {t(`sections.${kind}`)}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
