import type { CSSProperties } from "react";

/** Co-located styles for SummaryTiles (design: `screen_agentperf.jsx` PerfSummaryCard). */
export const s = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 14,
  } satisfies CSSProperties,
  tile: {
    padding: 16,
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    minWidth: 0,
  } satisfies CSSProperties,
  label: {
    margin: 0,
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
  } satisfies CSSProperties,
  value: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: "-0.02em",
  } satisfies CSSProperties,
  name: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  sub: { marginTop: 4, fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
