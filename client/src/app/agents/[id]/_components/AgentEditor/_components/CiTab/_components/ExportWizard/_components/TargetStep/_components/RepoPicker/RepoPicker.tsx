/* RepoPicker — the repository select of the Target step, fed by the workspace's imported repositories
   (AC-7): a loading line, the "none imported" notice (AC-8), or the select. */
"use client";

import { useTranslations } from "next-intl";
import { SelectInput } from "@devdigest/ui";
import type { Repo } from "@devdigest/shared";
import { s } from "../../../../styles";

export function RepoPicker({
  repos,
  loading,
  value,
  onPick,
}: {
  repos: readonly Repo[];
  loading: boolean;
  value: string;
  onPick: (repoId: string) => void;
}) {
  const t = useTranslations("ci");

  if (loading) return <p style={s.muted}>{t("wizard.target.loadingRepos")}</p>;
  if (repos.length === 0) {
    return (
      <p role="status" style={s.cardBody}>
        {t("wizard.target.noRepos")}
      </p>
    );
  }
  return (
    <label style={s.block}>
      <span style={s.fieldLabel}>{t("wizard.target.repoLabel")}</span>
      <SelectInput
        value={value}
        onChange={onPick}
        options={repos.map((r) => ({ value: r.id, label: r.full_name }))}
      />
      <span style={{ ...s.fieldHint, ...s.block }}>{t("wizard.target.repoHint")}</span>
    </label>
  );
}
