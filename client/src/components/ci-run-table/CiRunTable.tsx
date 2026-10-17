/* CiRunTable — the rows of CI runs, shared by the agent's CI tab (its 20 newest runs) and the CI Runs
   page (design `screen_cizruns.jsx`). Display only: the server stores and verifies runs, this formats
   them. PR titles and agent names are text, cut with CSS ellipsis. "Job" opens the GitHub Actions run in
   a new tab; "Trace" opens the details row. A cell with no data shows "—". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { CiRun } from "@devdigest/shared";
import { useRepos } from "@/lib/hooks";
import { CiRunRow } from "./CiRunRow";
import { COLUMNS } from "./constants";
import { s } from "./styles";

export function CiRunTable({ runs }: { runs: CiRun[] }) {
  const t = useTranslations("ci");
  const repos = useRepos();
  const [traceId, setTraceId] = React.useState<string | null>(null);

  const repoIdByName = React.useMemo(
    () => new Map((repos.data ?? []).map((r) => [r.full_name, r.id] as const)),
    [repos.data],
  );

  return (
    <div style={s.frame}>
      <table style={s.table}>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c} scope="col" style={s.th}>
                {t(`runs.table.${c}`)}
              </th>
            ))}
            <th scope="col" style={s.th}>
              <span className="sr-only">{t("runs.table.links")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <CiRunRow
              key={run.id}
              run={run}
              repoIdByName={repoIdByName}
              traceOpen={traceId === run.id}
              onToggleTrace={() => setTraceId(traceId === run.id ? null : run.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
