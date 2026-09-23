import type { CSSProperties } from "react";

export const s = {
  form: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "stretch", gap: 10 } satisfies CSSProperties,
  field: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
} as const;
