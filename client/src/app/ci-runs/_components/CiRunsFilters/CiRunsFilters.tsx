/* CiRunsFilters — period, agent, repository and status (AC-94). Each is a labelled native select; the
   values live in the URL, owned by the page, so a filtered list can be linked to. */
"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { SelectInput } from "@devdigest/ui";
import type { Agent, CiRunStatus, Repo } from "@devdigest/shared";
import type { CiRunFilters } from "@/lib/hooks";

const s = {
  bar: { display: "flex", gap: 10, padding: "12px 0", flexWrap: "wrap" } satisfies CSSProperties,
  field: { display: "block", minWidth: 170 } satisfies CSSProperties,
} as const;

const PERIODS = ["7d", "30d", "all"] as const;
const STATUSES: readonly CiRunStatus[] = ["succeeded", "no_findings", "failed"];

export function CiRunsFilters({
  filters,
  agents,
  repos,
  onPeriod,
  onAgent,
  onRepo,
  onStatus,
}: {
  filters: CiRunFilters;
  agents: Agent[];
  repos: Repo[];
  onPeriod: (value: string) => void;
  onAgent: (value: string | null) => void;
  onRepo: (value: string | null) => void;
  onStatus: (value: string | null) => void;
}) {
  const t = useTranslations("ci");
  const orNull = (fn: (value: string | null) => void) => (value: string) => fn(value === "" ? null : value);
  return (
    <div role="group" aria-label={t("runs.filters.label")} style={s.bar}>
      <label style={s.field}>
        <span className="sr-only">{t("runs.filters.period")}</span>
        <SelectInput
          mono={false}
          value={filters.period}
          onChange={onPeriod}
          options={PERIODS.map((p) => ({ value: p, label: t(`runs.filters.periods.${p}`) }))}
        />
      </label>
      <label style={s.field}>
        <span className="sr-only">{t("runs.filters.agent")}</span>
        <SelectInput
          mono={false}
          value={filters.agent_id ?? ""}
          onChange={orNull(onAgent)}
          options={[{ value: "", label: t("runs.filters.allAgents") }, ...agents.map((a) => ({ value: a.id, label: a.name }))]}
        />
      </label>
      <label style={s.field}>
        <span className="sr-only">{t("runs.filters.repo")}</span>
        <SelectInput
          mono={false}
          value={filters.repo ?? ""}
          onChange={orNull(onRepo)}
          options={[
            { value: "", label: t("runs.filters.allRepos") },
            ...repos.map((r) => ({ value: r.full_name, label: r.full_name })),
          ]}
        />
      </label>
      <label style={s.field}>
        <span className="sr-only">{t("runs.filters.status")}</span>
        <SelectInput
          mono={false}
          value={filters.status ?? ""}
          onChange={orNull(onStatus)}
          options={[
            { value: "", label: t("runs.filters.allStatuses") },
            ...STATUSES.map((st) => ({ value: st, label: t(`runs.status.${st}`) })),
          ]}
        />
      </label>
    </div>
  );
}
