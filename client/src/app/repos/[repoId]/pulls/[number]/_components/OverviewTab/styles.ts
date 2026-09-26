import type { CSSProperties } from "react";

export const s = {
  /* Two-column grid: the left cell is the IntentCard, the right is reserved for the
     L04 Blast Radius card (not built yet). `auto-fit` collapses the unused track when
     there is only one child, so today the card spans the full width instead of leaving
     a visible empty placeholder; it narrows to one column below ~320px per cell. */
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 20,
  } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
