import type { CSSProperties } from "react";

/** Co-located styles for StatsTab (the agent's own figures over a period). */
export const s = {
  wrap: { maxWidth: 880 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12, flexWrap: "wrap" } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  headRight: { marginLeft: "auto" } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--text-muted)", margin: "0 0 16px" } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 } satisfies CSSProperties,
  loading: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 } satisfies CSSProperties,
  tile: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  label: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  value: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 22, fontWeight: 700 } satisfies CSSProperties,
  sub: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
