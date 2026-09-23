/* SkillCard — one tile of the skills grid: name, global switch, description, type and source,
   the version and how many agents use it, and Delete (which asks first). The name is the real
   button; the card click only widens the mouse target. The card only reports what the user did —
   the page decides what selecting or deleting means. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SKILL_SOURCE_ICON, SKILL_TYPE_COLOR, SkillTypeChip } from "@/components/skill-type-chip";
import { rowClickProps, unstyledButton } from "@/lib/interactive";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  deleting,
  onSelect,
  onToggle,
  onDelete,
}: {
  skill: Skill;
  /** This card's preview is open. */
  active: boolean;
  /** The delete of this skill is running. */
  deleting?: boolean;
  onSelect: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const [confirming, setConfirming] = React.useState(false);
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
          {skill.applies_to && skill.applies_to.length > 0 && (
            <span
              className="mono"
              style={s.appliesTo}
              title={t("listItem.appliesTo", { globs: skill.applies_to.join(", ") })}
            >
              {skill.applies_to[0]}
              {skill.applies_to.length > 1 ? ` +${skill.applies_to.length - 1}` : ""}
            </span>
          )}
        </div>
        <div style={s.footer}>
          <span className="mono tnum" style={s.version}>
            {t("detail.version", { version: skill.version })}
          </span>
          {skill.agent_count != null && (
            <span className="tnum">{t("listItem.agents", { count: skill.agent_count })}</span>
          )}
          <span style={s.footerEnd}>
            <Button
              kind="ghost"
              size="sm"
              icon="Trash"
              disabled={deleting}
              aria-label={t("card.deleteLabel", { name: skill.name })}
              onClick={() => setConfirming(true)}
            >
              {tc("actions.delete")}
            </Button>
          </span>
        </div>
      </div>
      {/* Outside the card element: a click inside the dialog must not select the card. */}
      {confirming && (
        <ConfirmDialog
          danger
          title={t("detail.deleteTitle")}
          body={t("detail.deleteConfirm", { name: skill.name })}
          confirmLabel={tc("actions.delete")}
          pending={deleting}
          onConfirm={() => {
            onDelete();
            setConfirming(false);
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </li>
  );
}
