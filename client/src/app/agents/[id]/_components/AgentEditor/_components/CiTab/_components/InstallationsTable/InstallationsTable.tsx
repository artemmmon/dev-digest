/* InstallationsTable — one row per CI installation of the agent (AC-76..AC-79): repository, target, how it
   was installed, the exported agent version (with an "Outdated" badge when the agent changed since), and
   the last run. "Update CI config" opens the Export Wizard for that row's repository. */
"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { CiInstallation } from "@devdigest/shared";
import { CiStatusBadge } from "@/components/ci-run-table";
import { safeHttpsUrl } from "@/lib/safe-url";
import { s } from "./styles";

const COLUMNS = ["repository", "target", "method", "version", "lastRun"] as const;

export function InstallationsTable({
  installations,
  canUpdate,
  onUpdate,
}: {
  installations: CiInstallation[];
  /** False while the agent's provider cannot run in CI: the wizard would be refused. */
  canUpdate: boolean;
  onUpdate: (installation: CiInstallation) => void;
}) {
  const t = useTranslations("ci");
  const format = useFormatter();
  return (
    <div style={s.frame}>
      <table style={s.table}>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c} scope="col" style={s.th}>
                {t(`installations.columns.${c}`)}
              </th>
            ))}
            <th scope="col" style={s.th}>
              <span className="sr-only">{t("installations.columns.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {installations.map((inst) => {
            const prUrl = safeHttpsUrl(inst.pr_url);
            return (
              <tr key={inst.id}>
                <td style={s.td}>
                  <span className="mono" style={s.repo}>
                    {inst.repo}
                  </span>
                </td>
                <td style={s.td}>
                  <Badge color="var(--text-secondary)" icon="Workflow">
                    {t(`installations.targets.${inst.target_type}`)}
                  </Badge>
                </td>
                <td style={s.td}>{t(`installations.methods.${inst.method}`)}</td>
                <td style={s.td}>
                  <span style={s.version}>
                    {inst.agent_version != null ? t("installations.version", { version: inst.agent_version }) : "—"}
                    {inst.outdated && (
                      <Badge color="var(--warn)" bg="var(--warn-bg)">
                        {t("installations.outdated")}
                      </Badge>
                    )}
                  </span>
                </td>
                <td style={s.td}>
                  {inst.last_run_status ? (
                    <span style={s.lastRun}>
                      <CiStatusBadge status={inst.last_run_status} />
                      {inst.last_run_at && (
                        <span style={s.time}>
                          {format.dateTime(new Date(inst.last_run_at), { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span style={s.lastRun}>
                      <span style={s.waiting}>{t("installations.waiting")}</span>
                      {prUrl && (
                        <a
                          href={prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t("installations.prLinkLabel", { repo: inst.repo })}
                          style={s.prLink}
                        >
                          {t("installations.prLink")}
                        </a>
                      )}
                    </span>
                  )}
                </td>
                <td style={s.td}>
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="RefreshCw"
                    disabled={!canUpdate}
                    aria-label={t("installations.updateLabel", { repo: inst.repo })}
                    onClick={() => onUpdate(inst)}
                  >
                    {t("installations.update")}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
