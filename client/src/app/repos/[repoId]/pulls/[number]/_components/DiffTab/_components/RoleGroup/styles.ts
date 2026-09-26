import type { CSSProperties } from "react";

export const s = {
  wrap: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
  } satisfies CSSProperties,
  header: {
    position: "sticky",
    top: "var(--pr-header-h, 0px)",
    zIndex: 4,
    background: "var(--bg-primary)",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    cursor: "pointer",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  colorSquare: (color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: 2,
    background: color,
    flexShrink: 0,
  }),
  label: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  desc: {
    fontSize: 12,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  counter: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--crit)",
    flexShrink: 0,
  } satisfies CSSProperties,
  filesCount: {
    marginLeft: "auto",
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  body: {
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
};

export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}
