import type { CSSProperties } from "react";

/** Co-located styles for CiRunsView (design: `screen_cizruns.jsx` ScreenCIRuns). */
export const s = {
  page: { padding: "20px 28px 40px", maxWidth: 1280, margin: "0 auto" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", margin: "3px 0 0" } satisfies CSSProperties,
  headRight: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  auto: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  } satisfies CSSProperties,
  autoDot: { width: 6, height: 6, borderRadius: 99, background: "var(--ok)" } satisfies CSSProperties,
  notice: {
    margin: "12px 0 0",
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  body: { marginTop: 6 } satisfies CSSProperties,
  more: { display: "flex", justifyContent: "center", marginTop: 16 } satisfies CSSProperties,
  moreError: { fontSize: 12.5, color: "var(--crit)", textAlign: "center", marginTop: 12 } satisfies CSSProperties,
  loading: { display: "grid", gap: 8 } satisfies CSSProperties,
} as const;
