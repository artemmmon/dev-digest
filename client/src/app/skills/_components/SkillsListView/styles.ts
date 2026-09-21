import type { CSSProperties } from "react";

/** Co-located styles for SkillsListView. */
export const s = {
  /** Full height under the 52px top bar, like the agent editor. */
  page: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  loading: { flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
} as const;
