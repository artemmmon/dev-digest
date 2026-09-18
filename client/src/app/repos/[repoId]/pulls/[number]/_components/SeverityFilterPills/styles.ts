import type { CSSProperties } from "react";

/** Co-located styles for SeverityFilterPills. */
export const s = {
  row: { display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  pill: (color: string, bg: string, active: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 9px",
    borderRadius: 5,
    border: `1px solid ${active ? color : "transparent"}`,
    boxShadow: active ? `0 0 0 1px ${color}` : undefined,
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "inherit",
    color,
    background: bg,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    cursor: "pointer",
  }),
} as const;
