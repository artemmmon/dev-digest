import type { CSSProperties } from "react";

/** Co-located styles for CreateConventionSkillModal. */
export const s = {
  body: { padding: 24 } satisfies CSSProperties,
  intro: { fontSize: 13, color: "var(--text-secondary)", margin: "0 0 18px", lineHeight: 1.5 } satisfies CSSProperties,
  status: { fontSize: 13, color: "var(--text-secondary)", padding: "8px 0" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", marginBottom: 16 } satisfies CSSProperties,
  toggleRow: { display: "flex", gap: 6 } satisfies CSSProperties,
  preview: {
    minHeight: 200,
    maxHeight: 360,
    overflow: "auto",
    padding: "10px 14px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    fontSize: 14,
  } satisfies CSSProperties,
  meta: {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    gap: "8px 16px",
    margin: 0,
    padding: 14,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13,
  } satisfies CSSProperties,
  term: { color: "var(--text-muted)" } satisfies CSSProperties,
  value: { margin: 0, minWidth: 0 } satisfies CSSProperties,
  files: { margin: 0, padding: 0, listStyle: "none", maxHeight: 110, overflow: "auto", fontSize: 12 } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
