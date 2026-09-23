import type { CSSProperties } from "react";

export const s = {
  form: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  modeBar: { display: "flex", gap: 6 } satisfies CSSProperties,
  presetBar: { display: "flex", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
  preview: {
    minHeight: 200,
    padding: "10px 14px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 14,
  } satisfies CSSProperties,
  previewEmpty: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginRight: "auto" } satisfies CSSProperties,
} as const;
