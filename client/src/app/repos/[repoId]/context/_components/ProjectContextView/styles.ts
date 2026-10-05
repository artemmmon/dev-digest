import type { CSSProperties } from "react";
import { unstyledButton } from "@/lib/interactive";

/** Co-located styles for ProjectContextView. */
export const s = {
  page: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "20px 28px 14px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 } satisfies CSSProperties,
  repo: { color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: { fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  pattern: { fontSize: 11.5, color: "var(--text-primary)" } satisfies CSSProperties,
  centered: { padding: "24px 28px" } satisfies CSSProperties,
  skeletonStack: { display: "flex", flexDirection: "column", gap: 10, padding: "20px 28px" } satisfies CSSProperties,
  split: { flex: 1, display: "flex", minHeight: 0 } satisfies CSSProperties,
  rail: {
    width: 340,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    background: "var(--bg-surface)",
    overflow: "auto",
    padding: "10px 8px",
  } satisfies CSSProperties,
  railList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  item: (active: boolean): CSSProperties => ({
    ...unstyledButton,
    display: "block",
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    background: active ? "var(--bg-hover)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
  }),
  itemPath: { display: "block", fontSize: 12, wordBreak: "break-all" } satisfies CSSProperties,
  itemMeta: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 5, fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0, overflow: "auto", padding: "20px 28px" } satisfies CSSProperties,
  mainHead: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  mainPath: { fontSize: 13, fontWeight: 600, wordBreak: "break-all" } satisfies CSSProperties,
  mainMeta: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  content: { maxWidth: 720 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
