import type { CSSProperties } from "react";

/** Co-located styles for AgentPerformanceView (design: `screen_agentperf.jsx` ScreenAgentPerf). */
export const s = {
  page: { padding: "20px 28px 40px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", margin: "3px 0 0" } satisfies CSSProperties,
  headRight: { marginLeft: "auto" } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--text-muted)", margin: "12px 0 18px" } satisfies CSSProperties,
  stack: { display: "grid", gap: 24 } satisfies CSSProperties,
  loading: { display: "grid", gap: 16 } satisfies CSSProperties,
  loadingTiles: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 14,
  } satisfies CSSProperties,
} as const;
