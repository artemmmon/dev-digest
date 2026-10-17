import type { CiRunStatus } from "@devdigest/shared";
import type { CiRunFilters } from "@/lib/hooks";

/** The periods the CI Runs page offers; the URL and the filter bar both read this list (AC-94). */
export const PERIODS: readonly CiRunFilters["period"][] = ["7d", "30d", "all"];

/** The run statuses the CI Runs page can filter by (AC-94). */
export const STATUSES: readonly CiRunStatus[] = ["succeeded", "no_findings", "failed"];
