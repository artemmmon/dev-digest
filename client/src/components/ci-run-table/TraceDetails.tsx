/* TraceDetails — what a CI run was produced with (AC-89): the manifest, agent and runner versions, the
   model, the commit, the repository and the GitHub run id. Every value is rendered as text. */
"use client";

import { useTranslations } from "next-intl";
import type { CiRun } from "@devdigest/shared";
import { s } from "./styles";

export function TraceDetails({ run, id }: { run: CiRun; id: string }) {
  const t = useTranslations("ci");
  const rows: [string, string | number | null][] = [
    [t("runs.trace.manifestVersion"), run.manifest_version],
    [t("runs.trace.agentVersion"), run.agent_version],
    [t("runs.trace.runnerVersion"), run.runner_version],
    [t("runs.trace.model"), run.model],
    [t("runs.trace.commit"), run.commit_sha],
    [t("runs.trace.repository"), run.repo],
    [t("runs.trace.runId"), run.run_id],
  ];
  return (
    <dl id={id} style={s.trace}>
      {rows.map(([term, value]) => (
        <div key={term}>
          <dt style={s.traceTerm}>{term}</dt>
          <dd className="mono" style={s.traceValue}>
            {value ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
