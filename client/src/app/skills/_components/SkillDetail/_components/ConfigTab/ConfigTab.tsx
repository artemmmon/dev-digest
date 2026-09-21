/* ConfigTab — name, directive description, type and the markdown body of one skill, with the
   global "Enabled" switch. A sticky footer saves or discards the draft; when the body changed it
   also asks what changed, which is kept with the new version (see the Versions tab). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { EXTERNAL_SOURCES } from "@/components/skill-type-chip";
import { SKILL_TYPES } from "../../../constants";
import type { SkillDraft } from "../../../helpers";
import { approxTokens } from "../../helpers";
import { MarkdownCodeEditor } from "./_components/MarkdownCodeEditor";
import { s } from "./styles";
import type { ConfigForm } from "./types";

export function ConfigTab({
  skill,
  form,
  onToggle,
}: {
  skill: Skill | null;
  form: ConfigForm;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const { draft, onDraft, message, onMessage, dirty, bodyChanged, valid, pending, onSave, onDiscard } = form;
  const set = <K extends keyof SkillDraft>(key: K, value: SkillDraft[K]) => onDraft({ ...draft, [key]: value });
  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));
  // The server counted the saved body; an edit is estimated until it is saved.
  const counted = skill && !bodyChanged ? skill.body_tokens : null;
  const tokens = counted != null ? t("config.tokens", { n: counted }) : t("config.tokensApprox", { n: approxTokens(draft.body) });

  return (
    <div style={s.tab}>
      <div style={s.scroll}>
        <div style={s.headRow}>
          <h3 style={s.h3}>{t("config.title")}</h3>
          {skill && (
            <Badge color="var(--text-secondary)" icon="GitCommit" mono>
              {t("detail.version", { version: skill.version })}
            </Badge>
          )}
          {skill && (
            <label style={s.enabled}>
              {t("config.enabled")}
              <Toggle on={skill.enabled} onChange={onToggle} size={14} />
            </label>
          )}
        </div>

        {skill && EXTERNAL_SOURCES.includes(skill.source) && (
          <div role="note" style={s.notice}>
            <Icon.AlertTriangle size={16} style={s.noticeIcon} />
            <span>{t("preview.importedNotice")}</span>
          </div>
        )}

        <label style={s.field}>
          <span style={s.label}>
            {t("form.name")}
            <span aria-hidden="true" style={s.required}>*</span>
          </span>
          <TextInput
            value={draft.name}
            onChange={(v) => set("name", v)}
            placeholder={t("form.namePlaceholder")}
            mono
            aria-required="true"
          />
        </label>

        <div style={s.field}>
          <label style={{ ...s.field, marginBottom: 0 }}>
            <span style={s.label}>
              {t("form.description")}
              <span aria-hidden="true" style={s.required}>*</span>
            </span>
            <TextInput
              value={draft.description}
              onChange={(v) => set("description", v)}
              placeholder={t("form.descriptionPlaceholder")}
              aria-required="true"
            />
          </label>
          <span style={s.hint}>{t("form.descriptionHint")}</span>
        </div>

        <label style={s.field}>
          <span style={s.label}>{t("form.type")}</span>
          <SelectInput
            value={draft.type}
            onChange={(v) => set("type", v as SkillType)}
            options={typeOptions}
            mono={false}
          />
        </label>

        <div style={{ ...s.field, marginBottom: 0 }}>
          <span style={s.label}>
            {t("config.body")}
            <span aria-hidden="true" style={s.required}>*</span>
          </span>
          <div style={s.box}>
            <div style={s.fileBar}>
              <Icon.FileText size={14} style={s.fileIcon} />
              <span className="mono" style={s.fileName}>
                {(draft.name.trim() || t("config.newFile")) + ".md"}
              </span>
              {dirty && <Badge color="var(--text-muted)">{t("config.unsaved")}</Badge>}
              <span className="tnum" style={s.tokens}>
                {tokens}
              </span>
            </div>
            <MarkdownCodeEditor
              value={draft.body}
              onChange={(v) => set("body", v)}
              label={t("form.body")}
              placeholder={t("form.bodyPlaceholder")}
            />
          </div>
          <span style={s.bodyHint}>{t("config.bodyHint")}</span>
        </div>
      </div>

      <div style={s.footer}>
        {skill && bodyChanged ? (
          <div style={s.message}>
            <TextInput
              value={message}
              onChange={onMessage}
              placeholder={t("config.messagePlaceholder")}
              aria-label={t("config.messagePlaceholder")}
              maxLength={200}
            />
          </div>
        ) : (
          <span style={s.spacer} />
        )}
        {dirty && !valid && <span style={s.invalid}>{t("form.required")}</span>}
        <Button kind="ghost" onClick={onDiscard} disabled={!dirty || pending}>
          {t("config.discard")}
        </Button>
        <Button kind="primary" icon="Check" onClick={onSave} disabled={!dirty || !valid} loading={pending}>
          {t("config.save")}
        </Button>
      </div>
    </div>
  );
}
