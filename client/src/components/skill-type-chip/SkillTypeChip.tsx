/* SkillTypeChip — the coloured type label (rubric / convention / security / custom)
   shared by the Skills page and the agent Skills tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPE_COLOR } from "./constants";

export function SkillTypeChip({ type, compact }: { type: SkillType; compact?: boolean }) {
  const t = useTranslations("skills");
  const color = SKILL_TYPE_COLOR[type];
  return (
    <span
      className="mono"
      style={{
        fontSize: compact ? 10.5 : 11.5,
        fontWeight: 600,
        color,
        background: color + "1a",
        padding: compact ? "1px 6px" : "1px 8px",
        borderRadius: 4,
        whiteSpace: "nowrap",
      }}
    >
      {t(`listItem.type.${type}`)}
    </span>
  );
}
