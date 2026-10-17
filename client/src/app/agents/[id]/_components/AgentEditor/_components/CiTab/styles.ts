import type { CSSProperties } from "react";

/** Co-located styles for CiTab (design: `screen_agents.jsx` CITab). */
export const s = {
  wrap: { maxWidth: 880 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  actions: { marginLeft: "auto", display: "flex", gap: 8 } satisfies CSSProperties,
  empty: { maxWidth: 600, margin: "0 auto", textAlign: "center", padding: "20px 0 40px" } satisfies CSSProperties,
  emptyAction: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 } satisfies CSSProperties,
  reason: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  runsHead: { display: "flex", alignItems: "center", gap: 10, margin: "28px 0 12px" } satisfies CSSProperties,
  allRuns: { marginLeft: "auto", fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" } satisfies CSSProperties,
  noRuns: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  addRepo: (disabled: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    marginTop: 2,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px dashed var(--border-strong)",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  }),
  loading: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;
