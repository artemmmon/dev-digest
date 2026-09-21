/* SkillForm — name, directive description, type and a markdown body (write / preview).
   Used to create a skill, edit one, and to review an import before it is saved. The
   fields are a draft seeded from `initial`; remount with `key` to reset it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Markdown, SelectInput, Textarea, TextInput } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "../constants";
import { isDraftValid, type SkillDraft } from "../helpers";
import { BODY_ROWS } from "./constants";
import { s } from "./styles";

export function SkillForm({
  initial,
  submitLabel,
  pending,
  bodyHint,
  onSubmit,
  onCancel,
  cancelLabel,
}: {
  initial: SkillDraft;
  submitLabel: string;
  pending?: boolean;
  /** Shown under the body, e.g. "Saving a changed body creates a new version". */
  bodyHint?: string;
  onSubmit: (draft: SkillDraft) => void;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const t = useTranslations("skills");
  const [draft, setDraft] = React.useState<SkillDraft>(initial);
  const [mode, setMode] = React.useState<"write" | "preview">("write");
  const set = <K extends keyof SkillDraft>(key: K, value: SkillDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const valid = isDraftValid(draft);
  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  return (
    <form
      style={s.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !pending) onSubmit(draft);
      }}
    >
      <FormField label={t("form.name")} required>
        <TextInput
          value={draft.name}
          onChange={(v) => set("name", v)}
          placeholder={t("form.namePlaceholder")}
          mono
          aria-label={t("form.name")}
        />
      </FormField>
      <FormField label={t("form.description")} hint={t("form.descriptionHint")} required>
        <Textarea
          value={draft.description}
          onChange={(v) => set("description", v)}
          placeholder={t("form.descriptionPlaceholder")}
          rows={3}
        />
      </FormField>
      <FormField label={t("form.type")} required>
        <SelectInput
          value={draft.type}
          onChange={(v) => set("type", v as SkillType)}
          options={typeOptions}
          mono={false}
        />
      </FormField>
      <FormField
        label={t("form.body")}
        hint={bodyHint}
        required
        right={
          <div style={s.modeBar}>
            <Button kind="tertiary" size="sm" active={mode === "write"} onClick={() => setMode("write")} type="button">
              {t("form.write")}
            </Button>
            <Button kind="tertiary" size="sm" active={mode === "preview"} onClick={() => setMode("preview")} type="button">
              {t("form.preview")}
            </Button>
          </div>
        }
      >
        {mode === "write" ? (
          <Textarea
            value={draft.body}
            onChange={(v) => set("body", v)}
            placeholder={t("form.bodyPlaceholder")}
            rows={BODY_ROWS}
            mono
          />
        ) : (
          <div style={s.preview}>
            {draft.body.trim() ? (
              <Markdown>{draft.body}</Markdown>
            ) : (
              <span style={s.previewEmpty}>{t("form.previewEmpty")}</span>
            )}
          </div>
        )}
      </FormField>
      <div style={s.footer}>
        {!valid && <span style={s.hint}>{t("form.required")}</span>}
        {onCancel && (
          <Button kind="ghost" type="button" onClick={onCancel} disabled={pending}>
            {cancelLabel ?? t("form.cancel")}
          </Button>
        )}
        <Button kind="primary" type="submit" disabled={!valid || pending} loading={pending}>
          {pending ? t("form.saving") : submitLabel}
        </Button>
      </div>
    </form>
  );
}
