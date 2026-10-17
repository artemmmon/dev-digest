import type { EvalRunStatus } from "@devdigest/shared";

/** Compare takes exactly two runs (AC-45). */
export const MAX_SELECTED_RUNS = 2;

/** Badge colours of the statuses that get a badge (AC-38); `done` has none. */
export const STATUS_BADGE: Record<EvalRunStatus, { color: string; bg: string }> = {
  running: { color: "var(--accent-text)", bg: "var(--accent-bg)" },
  partial: { color: "var(--warn)", bg: "var(--warn-bg)" },
  failed: { color: "var(--crit)", bg: "var(--crit-bg)" },
  done: { color: "var(--ok)", bg: "var(--ok-bg)" },
};
