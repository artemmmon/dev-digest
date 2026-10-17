import type { CSSProperties } from "react";

/** Co-located styles for InstallationsTable (design: `screen_agents.jsx` CITab, the repo rows). */
export const s = {
  frame: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflowX: "auto",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12.5 } satisfies CSSProperties,
  th: {
    padding: "9px 12px",
    textAlign: "left",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  td: { padding: "12px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" } satisfies CSSProperties,
  repo: { fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" } satisfies CSSProperties,
  version: { display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" } satisfies CSSProperties,
  lastRun: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  time: { fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  waiting: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  prLink: { fontSize: 12, color: "var(--accent-text)", textDecoration: "none" } satisfies CSSProperties,
} as const;
