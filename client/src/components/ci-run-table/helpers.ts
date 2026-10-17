import type { CiRun, FindingsBySeverity } from "@devdigest/shared";
import { githubPrUrl } from "@/lib/github-urls";
import { safeHttpsUrl } from "@/lib/safe-url";

/** `7.4 s`-style duration; a run without one (no result, or an old row) is `null` so the cell shows "—". */
export function formatDuration(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** The severity counts of a run as the shared counter takes them (a null count is zero). */
export function runCounts(run: Pick<CiRun, "critical" | "warning" | "suggestion">): FindingsBySeverity {
  return { CRITICAL: run.critical ?? 0, WARNING: run.warning ?? 0, SUGGESTION: run.suggestion ?? 0 };
}

/**
 * Where a run's pull-request cell goes: the DevDigest page when the PR is imported (AC-90), else the
 * PR on GitHub (AC-91). `internal` tells the caller to use a router `<Link>` rather than an anchor.
 */
export function prTarget(
  run: Pick<CiRun, "repo" | "pr_number" | "pr_id">,
  repoIdByName: ReadonlyMap<string, string>,
): { href: string; internal: boolean } | null {
  if (run.pr_number == null) return null;
  const repoId = run.pr_id ? repoIdByName.get(run.repo) : undefined;
  if (repoId) return { href: `/repos/${repoId}/pulls/${run.pr_number}`, internal: true };
  const href = safeHttpsUrl(githubPrUrl(run.repo, run.pr_number));
  return href ? { href, internal: false } : null;
}
