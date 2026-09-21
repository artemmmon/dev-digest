import type { CSSProperties } from "react";

/** Co-located styles for ConventionSection. */
export const s = {
  section: { marginBottom: 24 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 } satisfies CSSProperties,
  title: { fontSize: 15, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-secondary)", marginLeft: "auto" } satisfies CSSProperties,
} as const;
