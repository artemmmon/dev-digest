/** The table's data columns, in order; each is a key under `ci.runs.table` (a links column follows). */
export const COLUMNS = [
  "timestamp",
  "pullRequest",
  "agent",
  "source",
  "duration",
  "findings",
  "verdict",
  "cost",
  "status",
] as const;

/** Column count including the trailing links column: the span of the trace details row. */
export const COLUMN_COUNT = COLUMNS.length + 1;

/** `source` values the server uses for a GitHub Actions run; shown as the translated "GitHub Actions". */
export const SOURCE_KEYS = new Set(["gha", "github_actions"]);
