import type { CSSProperties } from "react";

export const s = {
  wrap: {
    marginBottom: 14,
  } satisfies CSSProperties,
  /** Sticky and borderless (`diff.jsx` toggles a hover background instead of a border;
      the sticky role keeps `--bg-primary` opaque so scrolled-under code never shows
      through, and swaps to `--bg-surface` on hover like the design). */
  header: (hovered: boolean, open: boolean): CSSProperties => ({
    position: "sticky",
    top: "var(--pr-header-h, 0px)",
    zIndex: 4,
    background: hovered ? "var(--bg-surface)" : "var(--bg-primary)",
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "7px 10px",
    marginLeft: -10,
    marginBottom: open ? 8 : 0,
    borderRadius: 7,
    cursor: "pointer",
    userSelect: "none",
    transition: "background .12s",
  }),
  colorSquare: (color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: 2,
    background: color,
    flexShrink: 0,
  }),
  label: { fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  desc: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  right: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 9,
    flexShrink: 0,
  } satisfies CSSProperties,
  counter: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 10.5,
    fontWeight: 600,
    color: "var(--crit)",
  } satisfies CSSProperties,
  counterDot: {
    width: 6,
    height: 6,
    borderRadius: 99,
    background: "var(--crit)",
    flexShrink: 0,
  } satisfies CSSProperties,
  filesCount: {
    fontSize: 11,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;

export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .15s",
    flexShrink: 0,
  };
}
