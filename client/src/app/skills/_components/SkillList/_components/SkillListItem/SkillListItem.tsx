/* SkillListItem — one row of the skill list: name, global switch, description, type and
   source, and how many agents use it. The name is the real button; the row click only widens the mouse target. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SKILL_SOURCE_ICON, SKILL_TYPE_COLOR, SkillTypeChip } from "@/components/skill-type-chip";
import { rowClickProps, unstyledButton } from "@/lib/interactive";
import { s } from "./styles";

export function SkillListItem({
  skill,
  active,
  onSelect,
  onToggle,
}: {
  skill: Skill;
  active: boolean;
  onSelect: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const SourceIcon = Icon[SKILL_SOURCE_ICON[skill.source]];
  return (
    <li style={s.item}>
      <div {...rowClickProps(onSelect)} style={s.card(active, skill.enabled)}>
        <div style={s.headerRow}>
          <span style={s.iconBox(SKILL_TYPE_COLOR[skill.type])}>
            <Icon.Sparkles size={14} />
          </span>
          <button
            type="button"
            onClick={onSelect}
            aria-current={active ? "true" : undefined}
            className="mono"
            style={{ ...unstyledButton, ...s.name }}
          >
            {skill.name}
          </button>
          <label style={s.toggleLabel}>
            <span className="sr-only">{t("page.toggleLabel", { name: skill.name })}</span>
            <Toggle on={skill.enabled} onChange={onToggle} size={13} />
          </label>
        </div>
        <div style={s.description}>{skill.description || t("listItem.noDescription")}</div>
        <div style={s.metaRow}>
          <SkillTypeChip type={skill.type} compact />
          <span style={s.source}>
            <SourceIcon size={11} />
            {t(`listItem.source.${skill.source}`)}
          </span>
        </div>
        {skill.agent_count != null && (
          <div className="tnum" style={s.footer}>
            {t("listItem.agents", { count: skill.agent_count })}
          </div>
        )}
      </div>
    </li>
  );
}
