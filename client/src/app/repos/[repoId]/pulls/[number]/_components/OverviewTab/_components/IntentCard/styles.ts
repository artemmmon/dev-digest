import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  summary: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.5,
    fontStyle: "italic",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  columns: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
  } satisfies CSSProperties,
  columnLabel: (positive: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    marginBottom: 7,
    color: positive ? "var(--ok)" : "var(--text-muted)",
  }),
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 5,
  } satisfies CSSProperties,
  listItem: (positive: boolean): CSSProperties => ({
    display: "flex",
    gap: 7,
    fontSize: 12.5,
    lineHeight: 1.45,
    color: positive ? "var(--text-secondary)" : "var(--text-muted)",
  }),
  bullet: (positive: boolean): CSSProperties => ({
    marginTop: 1,
    color: positive ? "var(--ok)" : "var(--text-muted)",
  }),
  divider: { height: 1, background: "var(--border)" } satisfies CSSProperties,
  risksLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    marginBottom: 7,
  } satisfies CSSProperties,
  riskChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 7,
  } satisfies CSSProperties,
  incidentalPath: {
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  missingContext: {
    fontSize: 12,
    color: "var(--warn)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  stale: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 12,
  } satisfies CSSProperties,
  emptyText: {
    margin: 0,
    fontSize: 13.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
} as const;
