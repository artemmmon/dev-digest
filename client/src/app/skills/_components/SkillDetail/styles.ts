import type { CSSProperties } from "react";

/** Co-located styles for SkillDetail (the right side of the design's Skills Lab). */
export const s = {
  pane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-primary)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 28px 0",
    flexShrink: 0,
  } satisfies CSSProperties,
  icon: { color: "var(--accent)", flexShrink: 0 } satisfies CSSProperties,
  title: {
    fontSize: 16,
    fontWeight: 700,
    margin: 0,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  actions: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  content: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  scroll: { flex: 1, minHeight: 0, overflow: "auto", padding: "22px 28px 32px" } satisfies CSSProperties,
} as const;
