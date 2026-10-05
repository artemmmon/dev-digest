import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" } satisfies CSSProperties,
  stat: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    color: "var(--text-secondary)",
    fontSize: 12.5,
  } satisfies CSSProperties,
  icon: { color: "var(--text-muted)" } satisfies CSSProperties,
  num: { color: "var(--text-primary)", fontWeight: 650 } satisfies CSSProperties,
} as const;
