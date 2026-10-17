/* TargetStep — step 1: GitHub Actions is the only target (AC-6) and the repository comes from the
   workspace's imported repositories (AC-7). With none imported, Continue stays disabled (AC-8). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, SelectInput } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import type { ExportWizardState } from "../useExportWizard";
import { s } from "../styles";

export function TargetStep({ wizard }: { wizard: ExportWizardState }) {
  const t = useTranslations("ci");
  const errorId = React.useId();
  const error = wizard.previewError;
  return (
    <div style={s.narrow}>
      <div style={s.card(true)}>
        <div style={s.cardHead}>
          <div style={s.iconBox(true)}>
            <Icon.Workflow size={18} />
          </div>
          <span style={s.cardTitle}>{t("wizard.target.gha")}</span>
          <Badge color="var(--accent-text)" bg="var(--accent-bg)" style={s.right}>
            {t("wizard.target.recommended")}
          </Badge>
        </div>
        <p style={{ ...s.cardBody, margin: "8px 0 0" }}>{t("wizard.target.ghaDesc")}</p>
      </div>

      {wizard.reposLoading ? (
        <p style={s.muted}>{t("wizard.target.loadingRepos")}</p>
      ) : wizard.repos.length === 0 ? (
        <p role="status" style={s.cardBody}>
          {t("wizard.target.noRepos")}
        </p>
      ) : (
        <label style={{ display: "block" }}>
          <span style={s.fieldLabel}>{t("wizard.target.repoLabel")}</span>
          <SelectInput
            value={wizard.repo?.id ?? ""}
            onChange={wizard.pickRepo}
            options={wizard.repos.map((r) => ({ value: r.id, label: r.full_name }))}
          />
          <span style={{ ...s.fieldHint, display: "block" }}>{t("wizard.target.repoHint")}</span>
        </label>
      )}

      {error && (
        <p id={errorId} role="alert" style={s.error}>
          {error instanceof ApiError && error.message ? error.message : t("wizard.target.previewFailed")}
        </p>
      )}
      {wizard.previewPending && <p style={s.muted}>{t("wizard.generating")}</p>}
    </div>
  );
}
