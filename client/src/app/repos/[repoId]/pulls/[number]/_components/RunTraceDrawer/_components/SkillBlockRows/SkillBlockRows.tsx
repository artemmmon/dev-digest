/* SkillBlockRows — the skills block of the prompt, one row per skill in prompt order with
   its token cost, so the tokens the skills add are visible at a glance. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { SkillBlock } from "@devdigest/shared";
import { s } from "../../styles";

export function SkillBlockRows({ blocks }: { blocks: SkillBlock[] }) {
  const t = useTranslations("runs");
  const total = blocks.reduce((sum, b) => sum + b.tokens, 0);
  return (
    <div style={s.skillRows} role="list" aria-label={t("trace.prompt.skillBlocks")}>
      {blocks.map((b, i) => (
        <div key={b.skill_id} role="listitem" style={s.skillRow}>
          <span className="mono tnum" style={{ color: "var(--text-muted)", width: 18 }}>
            {i + 1}
          </span>
          <span className="mono" style={s.skillRowName}>
            {b.name}
          </span>
          <Badge color="var(--accent)" bg="var(--accent-bg)" mono>
            {t("trace.prompt.tokens", { count: b.tokens })}
          </Badge>
        </div>
      ))}
      <div style={s.skillRowTotal}>{t("trace.prompt.skillsTotal", { count: total })}</div>
    </div>
  );
}
