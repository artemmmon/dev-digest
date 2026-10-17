/* ConfigureStep — step 3: which pull-request events start the review (AC-26, AC-27), where the result is
   posted (AC-28), how to block merges (AC-31) and whether the repository already holds the API-key
   secret, by name only, in the "Secrets expected" panel (AC-32, AC-33, AC-122–AC-130). A change
   regenerates the workflow (AC-29). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Chip, Icon } from "@devdigest/ui";
import { ALL_TRIGGERS, POST_AS_OPTIONS, SECRET_BADGES } from "../../constants";
import type { ExportWizardState } from "../../useExportWizard";
import { s } from "../../styles";

export function ConfigureStep({ wizard }: { wizard: ExportWizardState }) {
  const t = useTranslations("ci");
  const groupName = React.useId();
  const secretsTitleId = React.useId();
  // Derived from the preview during render; nothing is stored (AC-125, AC-126, AC-33).
  const secretBadge = SECRET_BADGES[wizard.preview?.secret_status ?? "unknown"];
  return (
    <div style={s.narrow}>
      <fieldset style={s.fieldset}>
        <legend style={s.fieldLabel}>{t("wizard.configure.triggerLabel")}</legend>
        <div style={s.chipRow}>
          {ALL_TRIGGERS.map((trigger) => {
            const selected = wizard.triggers.includes(trigger);
            return (
              <Chip
                key={trigger}
                active={selected}
                icon={selected ? "Check" : undefined}
                role="checkbox"
                ariaChecked={selected}
                onClick={() => wizard.toggleTrigger(trigger)}
              >
                {t(`wizard.configure.triggers.${trigger}`)}
              </Chip>
            );
          })}
        </div>
        {wizard.triggers.length === 0 && (
          <p role="alert" style={s.error}>
            {t("wizard.configure.noTrigger")}
          </p>
        )}
      </fieldset>

      <section style={s.section} aria-labelledby={secretsTitleId}>
        <h3 id={secretsTitleId} style={s.fieldLabel}>
          {t("wizard.configure.secrets.title")}
        </h3>
        <div style={s.secretsPanel}>
          <div style={s.secretRow(false)}>
            <span className="mono" style={s.secretName}>
              OPENROUTER_API_KEY
            </span>
            <span style={s.secretDesc}>{t("wizard.configure.secrets.openrouter.description")}</span>
            <span role="status" aria-live="polite" style={s.secretBadge}>
              <Badge color={secretBadge.color} bg={secretBadge.bg} style={secretBadge.style}>
                {t(`wizard.configure.secrets.badge.${secretBadge.key}`)}
              </Badge>
            </span>
          </div>
          <div style={s.secretRow(true)}>
            <span className="mono" style={s.secretName}>
              GITHUB_TOKEN
            </span>
            <span style={s.secretDesc}>{t("wizard.configure.secrets.github.description")}</span>
            <span style={s.secretBadge}>
              <Badge color="var(--ok)" bg="var(--ok-bg)">
                {t("wizard.configure.secrets.badge.ready")}
              </Badge>
            </span>
          </div>
        </div>
        <p style={s.fieldHint}>{t("wizard.configure.secrets.hint")}</p>
      </section>

      <fieldset style={s.fieldset}>
        <legend style={s.fieldLabel}>{t("wizard.configure.postAsLabel")}</legend>
        <div style={s.choiceRow}>
          {POST_AS_OPTIONS.map((option) => (
            <label key={option} style={s.radioRow}>
              <input
                type="radio"
                name={groupName}
                value={option}
                style={s.radio}
                checked={wizard.postAs === option}
                onChange={() => wizard.pickPostAs(option)}
              />
              {t(`wizard.configure.postAs.${option}`)}
              {option === "github_review" && (
                <Badge color="var(--accent-text)" bg="var(--accent-bg)">
                  {t("wizard.target.recommended")}
                </Badge>
              )}
            </label>
          ))}
        </div>
      </fieldset>

      <div style={s.note}>
        <Icon.Info size={15} style={s.noteIcon} />
        <div style={s.noteText}>
          {t.rich("wizard.configure.blockMergeNote", {
            b: (chunks) => <b style={s.strong}>{chunks}</b>,
          })}
        </div>
      </div>

      {wizard.previewPending && <p style={s.mutedGap}>{t("wizard.generating")}</p>}
      {wizard.previewError != null && !wizard.previewPending && (
        <p role="alert" style={s.error}>
          {t("wizard.configure.regenerateFailed")}
        </p>
      )}
    </div>
  );
}
