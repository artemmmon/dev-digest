import type { CSSProperties } from "react";

/** Co-located styles for SkillListItem (the cards of the design's Skills list). */
export const s = {
  item: { marginBottom: 8 } satisfies CSSProperties,
  card: (active: boolean, enabled: boolean): CSSProperties => ({
    padding: 12,
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid " + (active ? "var(--border-strong)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: enabled ? 1 : 0.55,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 9 } satisfies CSSProperties,
  iconBox: (color: string): CSSProperties => ({
    width: 26,
    height: 26,
    borderRadius: 7,
    background: color + "1a",
    color,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),
  name: {
    fontSize: 12.5,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  toggleLabel: { display: "inline-flex", alignItems: "center" } satisfies CSSProperties,
  description: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    marginTop: 4,
    lineHeight: 1.4,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  metaRow: { display: "flex", gap: 8, marginTop: 8, alignItems: "center" } satisfies CSSProperties,
  footer: {
    marginTop: 9,
    paddingTop: 8,
    borderTop: "1px solid var(--border)",
    fontSize: 11,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  source: {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    fontSize: 10.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
