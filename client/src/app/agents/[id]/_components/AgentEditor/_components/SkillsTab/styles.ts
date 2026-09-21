import type { CSSProperties } from "react";
import { unstyledButton } from "@/lib/interactive";

export const s = {
  wrap: { maxWidth: 680 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  filter: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    width: 200,
  } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  orderHint: { fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 14px" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: (on: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: on ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: on ? 1 : 0.7,
  }),
  /** The row being dragged, and where a drop would land (a line on the edge it moves across). */
  dragRow: (dragging: boolean, dropEdge: "top" | "bottom" | null): CSSProperties => ({
    opacity: dragging ? 0.5 : undefined,
    boxShadow:
      dropEdge === "top"
        ? "inset 0 2px 0 var(--accent)"
        : dropEdge === "bottom"
          ? "inset 0 -2px 0 var(--accent)"
          : undefined,
  }),
  /** The drag handle is a real button so the keyboard can move the row (ArrowUp / ArrowDown). */
  grip: (enabled: boolean): CSSProperties => ({
    ...unstyledButton,
    display: "inline-flex",
    color: "var(--text-muted)",
    cursor: enabled ? "grab" : "default",
    flexShrink: 0,
  }),
  nameCell: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  name: { fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", padding: "6px 2px" } satisfies CSSProperties,
  empty: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
