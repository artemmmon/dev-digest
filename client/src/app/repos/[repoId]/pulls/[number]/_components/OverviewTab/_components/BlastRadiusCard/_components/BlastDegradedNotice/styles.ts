import type { CSSProperties } from "react";

export const s = {
  box: {
    display: "flex",
    alignItems: "flex-start",
    flexWrap: "wrap",
    minWidth: 0,
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
  } satisfies CSSProperties,
  icon: { color: "var(--warn)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  text: { flex: "1 1 180px", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  title: { fontSize: 12.5, fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  reason: { fontSize: 12.5, lineHeight: 1.45, overflowWrap: "anywhere", color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
