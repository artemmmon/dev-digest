import type { CSSProperties } from "react";

/** Co-located styles for MetricCards (design: `screen_agents.jsx` EvalMetricStrip). */
export const s = {
  row: { display: "flex", gap: 10, marginBottom: 18 } satisfies CSSProperties,
  card: {
    flex: 1,
    minWidth: 0,
    padding: "11px 13px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  label: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    marginBottom: 6,
  } satisfies CSSProperties,
  valueRow: { display: "flex", alignItems: "baseline", gap: 7 } satisfies CSSProperties,
  value: (color: string): CSSProperties => ({ fontSize: 22, fontWeight: 700, color }),
  delta: (up: boolean): CSSProperties => ({
    fontSize: 11.5,
    fontWeight: 600,
    color: up ? "var(--ok)" : "var(--crit)",
  }),
} as const;
