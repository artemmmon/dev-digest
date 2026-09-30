import type { CSSProperties } from "react";

export const s = {
  list: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 } satisfies CSSProperties,
  header: (open: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    minWidth: 0,
    padding: "5px 6px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    color: "var(--text-primary)",
    background: open ? "var(--bg-hover)" : "transparent",
  }),
  chevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    flexShrink: 0,
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  }),
  codeIcon: { color: "var(--accent)", flexShrink: 0 } satisfies CSSProperties,
  symbol: {
    fontSize: 12.5,
    fontWeight: 600,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  count: { fontSize: 11, color: "var(--text-muted)", marginLeft: "auto", flexShrink: 0 } satisfies CSSProperties,
  body: { padding: "4px 0 8px 14px", minWidth: 0 } satisfies CSSProperties,
  /* Row = icon + a column (name, then file:line beneath it); `minWidth: 0` lets the column shrink
     below its content so nothing pushes past the card edge. */
  caller: {
    display: "flex",
    alignItems: "flex-start",
    gap: 7,
    padding: "3px 0 3px 18px",
    fontSize: 12.5,
    minWidth: 0,
    borderLeft: "1px solid var(--border-strong)",
  } satisfies CSSProperties,
  callerIcon: { color: "var(--text-muted)", flexShrink: 0, marginTop: 3 } satisfies CSSProperties,
  callerBody: { display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 } satisfies CSSProperties,
  callerName: {
    color: "var(--text-primary)",
    minWidth: 0,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  /* The path wraps only between `/` segments (<wbr/>), never at a hyphen inside one; a single
     segment wider than the card is clipped (full `file:line` sits in the `title`). */
  ref: { display: "block", minWidth: 0, maxWidth: "100%", overflow: "hidden" } satisfies CSSProperties,
  refSegment: { whiteSpace: "nowrap" } satisfies CSSProperties,
  plainRef: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  chips: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    minWidth: 0,
    padding: "8px 0 2px 18px",
  } satisfies CSSProperties,
  /* Badge is `nowrap` by default; a long endpoint/cron string must wrap inside the card instead. */
  chip: {
    minWidth: 0,
    maxWidth: "100%",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    textAlign: "left",
  } satisfies CSSProperties,
} as const;
