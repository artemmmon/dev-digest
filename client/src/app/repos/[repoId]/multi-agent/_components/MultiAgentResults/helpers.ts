import type { AgentColumn, ColumnState } from "@devdigest/shared";

/** Each state gets its own colour token; the text label next to it carries the meaning too (NFR-7). */
export const STATE_COLOR: Record<ColumnState, string> = {
  queued: "var(--text-muted)",
  running: "var(--accent)",
  done: "var(--ok)",
  failed: "var(--crit)",
  cancelled: "var(--warn)",
};

/** A column that is still going to change (queued or running). */
export function isLiveState(state: ColumnState): boolean {
  return state === "queued" || state === "running";
}

/** True while any column of the run is queued or running. */
export function hasLiveColumn(columns: AgentColumn[]): boolean {
  return columns.some((c) => isLiveState(c.state));
}

/** True while any column is `running` (only then does the elapsed-time tick run). */
export function hasRunningColumn(columns: AgentColumn[]): boolean {
  return columns.some((c) => c.state === "running");
}

/** Whole seconds between the run's start and `nowMs` (never negative: the server clock may lead). */
export function elapsedSeconds(ranAt: string, nowMs: number): number {
  const start = Date.parse(ranAt);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((nowMs - start) / 1000));
}

/** Score colour of the small number in a tab (the design's thresholds: 70 / 50). */
export function tabScoreColor(score: number): string {
  return score >= 70 ? "var(--ok)" : score >= 50 ? "var(--warn)" : "var(--crit)";
}

/** Start time of a run in the selector ("Oct 17, 14:03"). */
export function formatRunTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** `src/a.ts:12` or `src/a.ts:12–18` for a finding's location. */
export function lineRange(start: number, end: number): string {
  return end > start ? `${start}–${end}` : String(start);
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
  INFO: "var(--info)",
};

/** Severity → CSS colour token (a dot or a border next to the severity text). */
export function severityColor(severity: string | null | undefined): string {
  return (severity && SEVERITY_COLOR[severity]) || "var(--text-muted)";
}
