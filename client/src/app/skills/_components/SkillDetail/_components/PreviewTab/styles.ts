import type { CSSProperties } from "react";

export const s = {
  h3: { fontSize: 15, fontWeight: 600, margin: 0 } satisfies CSSProperties,
  sub: { fontSize: 12.5, color: "var(--text-muted)", margin: "4px 0 16px" } satisfies CSSProperties,
  card: {
    padding: "18px 22px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 14,
  } satisfies CSSProperties,
  empty: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
} as const;
