import type { CSSProperties } from "react";

/** Co-located styles for ScanReport. */
export const s = {
  wrap: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    marginBottom: 18,
  } satisfies CSSProperties,
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "9px 12px",
    background: "none",
    border: "none",
    cursor: "pointer",
    font: "inherit",
    fontSize: 12.5,
    color: "var(--text-secondary)",
    textAlign: "left",
  } satisfies CSSProperties,
  toggleLabel: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  details: {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    gap: "6px 16px",
    margin: 0,
    padding: "4px 14px 12px",
    fontSize: 12.5,
  } satisfies CSSProperties,
  term: { color: "var(--text-muted)" } satisfies CSSProperties,
  value: { margin: 0, color: "var(--text-primary)", minWidth: 0 } satisfies CSSProperties,
  list: { margin: 0, padding: 0, listStyle: "none", maxHeight: 120, overflow: "auto" } satisfies CSSProperties,
} as const;
