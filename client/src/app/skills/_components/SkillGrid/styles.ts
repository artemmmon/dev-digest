import type { CSSProperties } from "react";
import { LIST_WIDTH } from "./constants";

/** Co-located styles for SkillList. */
export const s = {
  column: {
    width: LIST_WIDTH,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  head: { padding: "14px 14px 10px" } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 } satisfies CSSProperties,
  h1: { fontSize: 16, fontWeight: 700, flex: 1, margin: 0 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-primary)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  list: {
    flex: 1,
    overflow: "auto",
    padding: "0 12px 12px",
    listStyle: "none",
    margin: 0,
  } satisfies CSSProperties,
  loading: { flex: 1, padding: "0 14px", display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  noMatch: { fontSize: 12.5, color: "var(--text-muted)", padding: "12px 6px" } satisfies CSSProperties,
} as const;
