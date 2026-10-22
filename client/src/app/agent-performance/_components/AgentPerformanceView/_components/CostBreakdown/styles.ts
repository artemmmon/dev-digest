import type { CSSProperties } from "react";

/** Co-located styles for CostBreakdown (design: `screen_agentperf.jsx`, "Cost breakdown" cards). */
export const s = {
  head: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 } satisfies CSSProperties,
  h2: { fontSize: 14, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 } satisfies CSSProperties,
  card: {
    padding: 16,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    minWidth: 0,
  } satisfies CSSProperties,
  cardTitle: {
    margin: "0 0 14px",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  none: { margin: 0, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
