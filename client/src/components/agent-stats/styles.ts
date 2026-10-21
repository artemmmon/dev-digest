import type { CSSProperties } from "react";

/** Co-located styles for the shared Agent Performance / Stats tab pieces (PeriodControl, StatMarks). */
export const s = {
  control: { display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  field: { display: "block", minWidth: 160 } satisfies CSSProperties,
  dateField: { display: "block", minWidth: 150 } satisfies CSSProperties,
  fieldLabel: {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies CSSProperties,
  error: {
    flexBasis: "100%",
    margin: 0,
    fontSize: 12.5,
    color: "var(--crit)",
  } satisfies CSSProperties,
  mark: {
    display: "inline-flex",
    alignItems: "center",
    padding: "1px 6px",
    borderRadius: 99,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-surface)",
    color: "var(--text-secondary)",
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: "0.02em",
    whiteSpace: "nowrap",
    verticalAlign: "middle",
  } satisfies CSSProperties,
} as const;
