import type { CiFailOn } from "@devdigest/shared";

/** The options always offered, in design order; "any" is added only while the agent is stored with it. */
export const FAIL_ON_OPTIONS = ["critical", "warning", "never"] as const satisfies readonly CiFailOn[];
