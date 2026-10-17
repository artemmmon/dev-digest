/* InstallStep — step 4: open a PR with the files (default) or download them as a zip (AC-46). Opening a
   PR needs a stored GitHub token (AC-47). A failure stays on this step with the mapped message (AC-57,
   AC-58); a success shows the PR link (AC-53) or the zip note. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { safeHttpsUrl } from "@/lib/safe-url";
import { GHA_DOCS_URL } from "../../constants";
import type { ExportWizardState, InstallMethod } from "../../useExportWizard";
import { s } from "../../styles";

export function InstallStep({ wizard }: { wizard: ExportWizardState }) {
  const t = useTranslations("ci");
  const groupName = React.useId();
  const reasonId = React.useId();
  const repoName = wizard.repo?.full_name ?? "";

  if (wizard.done) {
    const prUrl = safeHttpsUrl(wizard.done.prUrl);
    return (
      <div style={s.narrow} role="status">
        <div style={s.successTitle}>
          <Icon.CheckCircle size={18} style={{ color: "var(--ok)" }} />
          {wizard.done.method === "pr" ? t("wizard.install.prOpenedTitle") : t("wizard.install.zipSavedTitle")}
        </div>
        <p style={s.successBody}>
          {wizard.done.method === "pr"
            ? t("wizard.install.prOpenedBody", { repo: repoName })
            : t("wizard.install.zipSavedBody", { repo: repoName })}
        </p>
        {prUrl && (
          <a href={prUrl} target="_blank" rel="noopener noreferrer" style={s.prLink}>
            {t("wizard.install.viewPr")}
          </a>
        )}
      </div>
    );
  }

  const error = wizard.installError;
  const options: { value: InstallMethod; disabled: boolean }[] = [
    { value: "pr", disabled: !wizard.canOpenPr },
    { value: "zip", disabled: false },
  ];
  return (
    <div style={s.narrow}>
      {options.map(({ value, disabled }) => {
        const active = wizard.method === value;
        return (
          <label key={value} style={s.card(active, disabled)}>
            <div style={s.cardHead}>
              <input
                type="radio"
                name={groupName}
                value={value}
                style={s.radio}
                checked={active}
                disabled={disabled || wizard.installPending}
                aria-describedby={value === "pr" && disabled ? reasonId : undefined}
                onChange={() => wizard.pickMethod(value)}
              />
              {value === "pr" ? (
                <Icon.GitPullRequest size={18} style={{ color: "var(--accent)" }} />
              ) : (
                <Icon.Copy size={16} style={{ color: "var(--text-secondary)" }} />
              )}
              <span style={s.cardTitle}>{t(`wizard.install.methods.${value}`)}</span>
              {value === "pr" ? (
                <Badge color="var(--accent-text)" bg="var(--bg-elevated)" style={s.right}>
                  {t("wizard.target.recommended")}
                </Badge>
              ) : (
                <span style={{ ...s.muted, ...s.right }}>{t("wizard.install.zipHint")}</span>
              )}
            </div>
            {value === "pr" && (
              <p style={s.cardBody}>
                {disabled ? (
                  <span id={reasonId}>{t("wizard.install.needsToken")}</span>
                ) : (
                  t("wizard.install.prBody", { repo: repoName, count: wizard.files.length })
                )}
              </p>
            )}
          </label>
        );
      })}

      <p style={s.helpLine}>
        {t.rich("wizard.install.help", {
          link: (chunks) => (
            <a href={GHA_DOCS_URL} target="_blank" rel="noopener noreferrer" style={s.helpLink}>
              {chunks}
            </a>
          ),
        })}
      </p>

      {!wizard.yamlValid && (
        <p role="alert" style={s.error}>
          {t("wizard.preview.invalidYaml")}
        </p>
      )}
      {error && (
        <p role="alert" style={s.error}>
          {"message" in error ? error.message : t(error.key)}
        </p>
      )}
    </div>
  );
}
