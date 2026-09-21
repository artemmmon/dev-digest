/* SkillTypeChip — the coloured type label (rubric / convention / security / custom)
   shared by the Skills page and the agent Skills tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPE_COLOR } from "./constants";
import { s } from "./styles";

export function SkillTypeChip({ type, compact }: { type: SkillType; compact?: boolean }) {
  const t = useTranslations("skills");
  const color = SKILL_TYPE_COLOR[type];
  return (
    <span className="mono" style={s.chip(color, !!compact)}>
      {t(`listItem.type.${type}`)}
    </span>
  );
}
