import type { CSSProperties } from "react";
import { TREND_CHART_HEIGHT } from "./constants";

/** Co-located styles for TrendChart (design: `screen_skills.jsx` "Metric trend" card). */
export const s = {
  card: { marginBottom: 20 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 16, marginBottom: 12, flexWrap: "wrap" } satisfies CSSProperties,
  legend: { marginLeft: "auto", display: "flex", gap: 14, fontSize: 11.5, margin: 0, padding: 0, listStyle: "none" } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 5 } satisfies CSSProperties,
  swatch: (color: string): CSSProperties => ({ width: 10, height: 2, background: color, borderRadius: 2 }),
  legendText: { color: "var(--text-secondary)" } satisfies CSSProperties,
  message: { fontSize: 13, color: "var(--text-muted)", margin: "4px 0" } satisfies CSSProperties,
  plot: { width: "100%", height: TREND_CHART_HEIGHT } satisfies CSSProperties,
  tooltip: {
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    fontSize: 12,
    color: "var(--text-secondary)",
    boxShadow: "0 4px 14px rgba(0,0,0,.18)",
  } satisfies CSSProperties,
  tooltipHead: { fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 } satisfies CSSProperties,
  tooltipRow: { display: "flex", justifyContent: "space-between", gap: 14 } satisfies CSSProperties,
} as const;
