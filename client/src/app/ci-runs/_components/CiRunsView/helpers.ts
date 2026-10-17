import type { CiRunStatus } from "@devdigest/shared";
import type { CiRunFilters } from "@/lib/hooks";

const PERIODS = ["7d", "30d", "all"] as const;
const STATUSES: readonly CiRunStatus[] = ["succeeded", "no_findings", "failed"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The period when the URL names none, or a value this page does not know (AC-94). */
export const DEFAULT_PERIOD: CiRunFilters["period"] = "7d";

/** Every run of the workspace, no filter: used to tell "nothing stored yet" from "nothing matches" (AC-95, AC-96). */
export const ALL_RUNS: CiRunFilters = { period: "all" };

/**
 * The filters in the URL, checked: a value the page does not offer is dropped, so a typed-in URL never
 * sends the server a query it would refuse.
 */
export function parseFilters(params: {
  period: string;
  agent: string | null;
  repo: string | null;
  status: string | null;
}): CiRunFilters {
  const period = PERIODS.find((p) => p === params.period) ?? DEFAULT_PERIOD;
  const status = STATUSES.find((s) => s === params.status) ?? null;
  const agent = params.agent && UUID.test(params.agent) ? params.agent : null;
  const repo = params.repo && params.repo.length <= 200 ? params.repo : null;
  return { period, agent_id: agent, repo, status };
}

/** True when no filter narrows the list: only then can an empty list mean "no CI run is stored". */
export function isUnfiltered(f: CiRunFilters): boolean {
  return f.period === "all" && !f.agent_id && !f.repo && !f.status;
}
