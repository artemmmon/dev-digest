import type { CSSProperties } from "react";

export const s = {
  /* Two-column grid: the left cell is the IntentCard, the right is the BlastRadiusCard.
     `auto-fit` keeps it to one column below ~320px per cell (and would collapse an unused
     track if a child were ever removed instead of leaving an empty placeholder). */
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
