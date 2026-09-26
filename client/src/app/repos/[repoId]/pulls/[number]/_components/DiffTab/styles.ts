import type { CSSProperties } from "react";

export const s = {
  orderGroup: {
    display: "flex",
    gap: 6,
    marginBottom: 14,
  } satisfies CSSProperties,
  groups: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  reviewNotRun: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    marginBottom: 10,
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-muted)",
    fontSize: 13,
  } satisfies CSSProperties,
};
