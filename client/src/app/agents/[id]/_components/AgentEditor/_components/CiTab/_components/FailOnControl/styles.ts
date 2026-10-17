import type { CSSProperties } from "react";

/** Co-located styles for FailOnControl (design: `screen_agents.jsx` CITab, "Fail CI on"). */
export const s = {
  box: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 16,
  } satisfies CSSProperties,
  text: { minWidth: 0, flex: 1 } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  hint: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", marginTop: 4 } satisfies CSSProperties,
  group: {
    display: "flex",
    gap: 2,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: 2,
    flexShrink: 0,
  } satisfies CSSProperties,
  option: (checked: boolean, focused: boolean): CSSProperties => ({
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 5,
    cursor: "pointer",
    background: checked ? "var(--bg-elevated)" : "transparent",
    color: checked ? "var(--text-primary)" : "var(--text-muted)",
    outline: focused ? "2px solid var(--accent)" : "none",
    outlineOffset: 1,
  }),
} as const;
