/* CiTab — one agent's Continuous Integration view (design `screen_agents.jsx` CITab): the "Fail CI on"
   gate, where the agent is installed (one row per repository, with the last run and an "Outdated" flag),
   its 20 newest CI runs, and "Add to CI" / "Add repository", which open the Export Wizard. The server stores and verifies
   everything; the tab only shows it. The wizard is mounted only while open, so closing drops its state. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import type { Agent, CiInstallation } from "@devdigest/shared";
import { CiRunTable } from "@/components/ci-run-table";
import { useCiAutoRefresh, useCiOverview, useRepos } from "@/lib/hooks";
import { ExportWizard, type WizardPreset } from "./_components/ExportWizard";
import { FailOnControl } from "./_components/FailOnControl";
import { InstallationsTable } from "./_components/InstallationsTable";
import { s } from "./styles";

/** The wizard is closed (`null`) or open, fresh (`{ preset: null }`) or on an installation's choices. */
type WizardState = { preset: WizardPreset | null } | null;

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const overview = useCiOverview(agent.id);
  const repos = useRepos();
  const { githubError } = useCiAutoRefresh();
  const [wizard, setWizard] = React.useState<WizardState>(null);
  const reasonId = React.useId();

  // Only an OpenRouter agent can run in CI (AC-4).
  const supported = agent.provider === "openrouter";

  const updateInstallation = (inst: CiInstallation) => {
    const repo = (repos.data ?? []).find((r) => r.full_name === inst.repo);
    setWizard({ preset: repo ? { repoId: repo.id, triggers: inst.triggers, postAs: inst.post_as } : null });
  };

  // Only an empty tab is replaced by the error: a failed background refetch keeps the data (and an open wizard).
  if (overview.isError && !overview.data) {
    return (
      <div style={s.wrap}>
        <ErrorState body={t("tab.loadError")} onRetry={() => void overview.refetch()} />
      </div>
    );
  }
  if (!overview.data) {
    return (
      <div style={{ ...s.wrap, ...s.loading }} aria-busy="true">
        <Skeleton height={20} width={200} />
        <Skeleton height={56} />
        <Skeleton height={120} />
      </div>
    );
  }

  const { installations, runs } = overview.data;
  // One handler for "Add to CI" and "Add repository": the wizard opens fresh, no installation preselected (AC-138).
  const openFreshWizard = () => setWizard({ preset: null });
  const failOn = <FailOnControl agent={agent} />;
  const refreshNote = githubError && (
    <p role="status" style={s.reason}>
      {t("runs.refreshFailed")}
    </p>
  );
  const addButton = (
    <Button
      kind="primary"
      size="sm"
      icon="Plus"
      disabled={!supported}
      aria-describedby={supported ? undefined : reasonId}
      onClick={openFreshWizard}
    >
      {t("tab.addToCi")}
    </Button>
  );

  return (
    <div style={s.wrap}>
      {installations.length === 0 ? (
        <>
          {failOn}
          {refreshNote}
          <div style={s.empty}>
            <EmptyState icon="Workflow" title={t("tab.emptyTitle")} body={t("tab.emptyBody")} />
            <div style={s.emptyAction}>
              {addButton}
              {!supported && (
                <span id={reasonId} style={s.reason}>
                  {t("tab.openRouterOnly")}
                </span>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={s.head}>
            <h2 style={s.h2}>{t("tab.heading")}</h2>
            <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
              {t("tab.activeIn", { count: installations.length })}
            </Badge>
            <div style={s.actions}>
              {!supported && (
                <span id={reasonId} style={{ ...s.reason, alignSelf: "center" }}>
                  {t("tab.openRouterOnly")}
                </span>
              )}
              {addButton}
            </div>
          </div>
          {failOn}
          {refreshNote}
          <InstallationsTable installations={installations} canUpdate={supported} onUpdate={updateInstallation} />
          <button
            type="button"
            style={s.addRepo(!supported)}
            disabled={!supported}
            aria-describedby={supported ? undefined : reasonId}
            onClick={openFreshWizard}
          >
            <Icon.Plus size={15} />
            {t("tab.addRepository")}
          </button>
        </>
      )}

      {runs.length > 0 && (
        <>
          <div style={s.runsHead}>
            <SectionLabel icon="Workflow">{t("tab.runsHeading")}</SectionLabel>
            <Link href={`/ci-runs?agent=${agent.id}`} style={s.allRuns}>
              {t("tab.allRuns")}
            </Link>
          </div>
          <CiRunTable runs={runs} />
        </>
      )}
      {runs.length === 0 && installations.length > 0 && <p style={{ ...s.noRuns, marginTop: 24 }}>{t("tab.noRuns")}</p>}

      {wizard && <ExportWizard agent={agent} preset={wizard.preset} onClose={() => setWizard(null)} />}
    </div>
  );
}
