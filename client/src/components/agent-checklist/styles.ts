import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "0 0 8px",
  } satisfies CSSProperties,
  heading: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 12 } satisfies CSSProperties,
  link: {
    border: "none",
    background: "transparent",
    padding: 0,
    color: "var(--accent-text)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 0, margin: 0, padding: 0, listStyle: "none" } satisfies CSSProperties,
  // No padding on the row: the vertical space lives in `label` below, inside the kit Checkbox's
  // <label>, so the whole row height is clickable (a click between two rows used to hit nothing).
  row: { padding: 0 } satisfies CSSProperties,
  label: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    minWidth: 0,
    padding: "7px 0",
  } satisfies CSSProperties,
  name: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 500,
  } satisfies CSSProperties,
  estimate: {
    fontSize: 11,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  } satisfies CSSProperties,
} as const;
