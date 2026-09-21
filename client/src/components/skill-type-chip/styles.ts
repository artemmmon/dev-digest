import type { CSSProperties } from "react";

export const s = {
  chip: (color: string, compact: boolean): CSSProperties => ({
    fontSize: compact ? 10.5 : 11.5,
    fontWeight: 600,
    color,
    background: color + "1a",
    padding: compact ? "1px 6px" : "1px 8px",
    borderRadius: 4,
    whiteSpace: "nowrap",
  }),
};
