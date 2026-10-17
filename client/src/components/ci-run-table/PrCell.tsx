/* PrCell — the pull-request cell of a CI run: the repository, then the PR number and title. The PR links
   to its DevDigest page when imported (AC-90), else to GitHub (AC-91); with no PR it shows "—". */
"use client";

import Link from "next/link";
import type { CiRun } from "@devdigest/shared";
import { prTarget } from "./helpers";
import { s } from "./styles";

type PrRun = Pick<CiRun, "repo" | "pr_number" | "pr_id" | "pr_title">;

export function PrCell({ run, repoIdByName }: { run: PrRun; repoIdByName: ReadonlyMap<string, string> }) {
  return (
    <>
      <span className="mono" style={s.repo}>
        {run.repo}
      </span>
      <PrLine run={run} repoIdByName={repoIdByName} />
    </>
  );
}

function PrLine({ run, repoIdByName }: { run: PrRun; repoIdByName: ReadonlyMap<string, string> }) {
  if (run.pr_number == null && !run.pr_title) return <span style={s.muted}>—</span>;

  const label = (
    <>
      {run.pr_number != null && (
        <span className="mono" style={s.prNumber}>
          #{run.pr_number}
        </span>
      )}
      {run.pr_title && <span style={s.prTitle}>{run.pr_title}</span>}
    </>
  );
  const target = prTarget(run, repoIdByName);

  if (!target) return <span style={s.prLine}>{label}</span>;
  if (target.internal) {
    return (
      <Link href={target.href} style={s.prLine}>
        {label}
      </Link>
    );
  }
  return (
    <a href={target.href} target="_blank" rel="noopener noreferrer" style={s.prLine}>
      {label}
    </a>
  );
}
