"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@devdigest/ui";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { s } from "./styles";

const STATS: { key: keyof BlastRadiusResponse["counts"]; icon: IconName }[] = [
  { key: "symbols", icon: "Code" },
  { key: "callers", icon: "CornerDownRight" },
  { key: "endpoints", icon: "Globe" },
  { key: "crons", icon: "Clock" },
];

/** The four headline numbers, straight from the server's `counts` (never recomputed). */
export function BlastSummary({ counts }: { counts: BlastRadiusResponse["counts"] }) {
  const t = useTranslations("blast");
  return (
    <div style={s.row}>
      {STATS.map(({ key, icon }) => {
        const I = Icon[icon];
        return (
          <span key={key} style={s.stat}>
            <I size={13} style={s.icon} />
            <b className="tnum" style={s.num}>
              {counts[key]}
            </b>
            {t(`stat.${key}`, { count: counts[key] })}
          </span>
        );
      })}
    </div>
  );
}
