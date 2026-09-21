import type { CSSProperties } from "react";
import { CARD_MIN_WIDTH } from "./constants";

/** Co-located styles for SkillGrid. */
export const s = {
  page: { padding: "22px 28px 32px", maxWidth: 1400, margin: "0 auto" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 12, marginBottom: 18 } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700, flex: 1, margin: 0 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-muted)",
    width: 260,
  } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN_WIDTH}px, 1fr))`,
    gap: 14,
    listStyle: "none",
    margin: 0,
    padding: 0,
  } satisfies CSSProperties,
  noMatch: { fontSize: 12.5, color: "var(--text-muted)", padding: "12px 6px" } satisfies CSSProperties,
} as const;
