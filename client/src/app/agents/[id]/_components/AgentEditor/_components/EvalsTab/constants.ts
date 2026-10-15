import type { EvalCaseOutcome } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Icon and colour of a case's outcome in the latest counted run; the text always says it too. */
export const OUTCOME_VISUAL: Record<EvalCaseOutcome, { icon: IconName; color: string }> = {
  pass: { icon: "CheckCircle", color: "var(--ok)" },
  fail: { icon: "XCircle", color: "var(--crit)" },
  error: { icon: "AlertTriangle", color: "var(--warn)" },
  never_run: { icon: "Dot", color: "var(--text-muted)" },
};
