import type { CSSProperties } from "react";

export const s = {
  empty: { margin: 0, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  chips: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 } satisfies CSSProperties,
  chip: (active: boolean): CSSProperties => ({
    padding: "3px 9px",
    fontSize: 11.5,
    borderRadius: 6,
    cursor: "pointer",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "var(--accent-bg)" : "transparent",
    color: active ? "var(--accent-text)" : "var(--text-secondary)",
    maxWidth: 220,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  scroll: { overflowX: "auto" } satisfies CSSProperties,
  svg: { display: "block" } satisfies CSSProperties,
  legend: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    fontSize: 11,
    color: "var(--text-muted)",
    marginTop: 8,
    paddingLeft: 4,
  } satisfies CSSProperties,
  dot: (color: string): CSSProperties => ({ color }),
} as const;
