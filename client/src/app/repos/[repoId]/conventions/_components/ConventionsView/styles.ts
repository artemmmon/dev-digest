import type { CSSProperties } from "react";

/** Co-located styles for ConventionsView. */
export const s = {
  page: { padding: "24px 28px 44px", maxWidth: 880, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 } satisfies CSSProperties,
  repo: { color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } satisfies CSSProperties,
  headerActions: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  loading: { marginTop: 8 } satisfies CSSProperties,
  loadingHint: { fontSize: 13, color: "var(--text-secondary)", margin: "0 0 14px" } satisfies CSSProperties,
  loadingTitle: { fontSize: 15, fontWeight: 600, margin: "0 0 4px" } satisfies CSSProperties,
  skeletonStack: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  alert: {
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  alertTitle: { fontWeight: 700, color: "var(--crit)" } satisfies CSSProperties,
  notice: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    border: "1px solid var(--ok)",
    background: "var(--ok-bg)",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 16,
    fontSize: 13,
  } satisfies CSSProperties,
  noticeText: { flex: 1 } satisfies CSSProperties,
  noticeLink: { color: "var(--accent-text)", textDecoration: "underline" } satisfies CSSProperties,
} as const;
