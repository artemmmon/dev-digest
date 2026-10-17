import type { CSSProperties } from "react";

export const s = {
  box: {
    display: "flex",
    gap: 10,
    padding: "10px 12px",
    marginBottom: 14,
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
  } satisfies CSSProperties,
  icon: { color: "var(--crit)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  body: { minWidth: 0 } satisfies CSSProperties,
  title: { fontSize: 13, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  list: {
    margin: "4px 0 0",
    paddingLeft: 18,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
