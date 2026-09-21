import type { CSSProperties } from "react";

/** Co-located styles for SkillPageView. */
export const s = {
  /** Full height under the 52px top bar; the detail below the back link takes the rest. */
  page: { display: "flex", flexDirection: "column", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  back: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    padding: "14px 28px 0",
    fontSize: 12.5,
    color: "var(--text-muted)",
    textDecoration: "none",
  } satisfies CSSProperties,
  loading: { padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
} as const;
