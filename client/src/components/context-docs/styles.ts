import type { CSSProperties } from "react";
import { unstyledButton } from "@/lib/interactive";

/** Co-located styles for the context-docs components. */
export const s = {
  typeBadge: (color: string): CSSProperties => ({
    fontSize: 10.5,
    fontWeight: 600,
    color,
    background: `color-mix(in srgb, ${color} 12%, transparent)`,
    padding: "1px 7px",
    borderRadius: 4,
    whiteSpace: "nowrap",
  }),

  // ---- list
  wrap: { maxWidth: 720 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 14px", lineHeight: 1.5 } satisfies CSSProperties,
  filter: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    marginBottom: 12,
    color: "var(--text-muted)",
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
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: (kind: "attached" | "missing" | "inherited" | "unattached", compact: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: compact ? "8px 10px" : "10px 12px",
    borderRadius: 7,
    border: kind === "missing" ? "1px dashed var(--warn)" : "1px solid var(--border)",
    background: kind === "unattached" ? "var(--bg-elevated)" : "var(--bg-hover)",
    opacity: kind === "unattached" ? 0.78 : 1,
  }),
  dragRow: (dragging: boolean, dropEdge: "top" | "bottom" | null): CSSProperties => ({
    opacity: dragging ? 0.5 : undefined,
    boxShadow:
      dropEdge === "top"
        ? "inset 0 2px 0 var(--accent)"
        : dropEdge === "bottom"
          ? "inset 0 -2px 0 var(--accent)"
          : undefined,
  }),
  /** The reorder handle is a real button so the keyboard can move the row (ArrowUp / ArrowDown). */
  grip: (enabled: boolean): CSSProperties => ({
    ...unstyledButton,
    display: "inline-flex",
    color: "var(--text-muted)",
    cursor: enabled ? "grab" : "default",
    flexShrink: 0,
  }),
  /** Keeps the paths aligned on rows that have no grip. */
  gripSpacer: { display: "inline-block", width: 14, flexShrink: 0 } satisfies CSSProperties,
  checkbox: (on: boolean, readOnly: boolean): CSSProperties => ({
    width: 16,
    height: 16,
    padding: 0,
    borderRadius: 4,
    flexShrink: 0,
    cursor: readOnly ? "default" : "pointer",
    border: `1.5px solid ${on ? "var(--accent)" : "var(--border-strong)"}`,
    background: on ? "var(--accent)" : "transparent",
    display: "grid",
    placeItems: "center",
    opacity: readOnly ? 0.6 : 1,
  }),
  pathCell: { flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6, overflow: "hidden" } satisfies CSSProperties,
  pathName: { fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" } satisfies CSSProperties,
  pathDir: {
    fontSize: 11,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  via: { fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  preview: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 8px",
    borderRadius: 6,
    cursor: "pointer",
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-secondary)",
    fontSize: 11.5,
    fontWeight: 600,
    flexShrink: 0,
  } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", padding: "6px 2px" } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    paddingTop: 14,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  total: (over: boolean): CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    color: over ? "var(--crit)" : "var(--text-secondary)",
  }),
  footerNote: { marginLeft: "auto", fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,

  // ---- drawer / content
  meta: { display: "inline-flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  metaItem: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  attachRow: { display: "flex", marginBottom: 14 } satisfies CSSProperties,
  body: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    padding: "12px 18px 16px",
  } satisfies CSSProperties,
  notice: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  skeletonStack: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;
