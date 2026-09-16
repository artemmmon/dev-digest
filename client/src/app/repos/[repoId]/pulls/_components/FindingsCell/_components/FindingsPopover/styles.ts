import type { CSSProperties } from "react";

/** Co-located styles for FindingsPopover. Ported from FindingsTooltip in
    docs/design/src/prdetail_runs.jsx. */
export const s = {
  /**
   * Invisible positioned wrapper. The 8px offset from the trigger is its PADDING, not a
   * margin on the card: margins are not hit-testable, so a gap there is a dead strip that
   * fires `mouseleave` and closes the popover before the pointer can reach it.
   */
  anchor: (placement: "up" | "down"): CSSProperties => ({
    position: "absolute",
    left: 0,
    ...(placement === "up"
      ? { bottom: "100%", paddingBottom: 8 }
      : { top: "100%", paddingTop: 8 }),
    zIndex: 30,
  }),
  card: {
    width: 360,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 10,
    boxShadow: "var(--shadow-modal)",
    padding: 12,
    animation: "ddpop .12s ease",
    cursor: "default",
    textAlign: "left",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    marginBottom: 9,
  } satisfies CSSProperties,
  // Scrolls vertically past a few findings. `overflowX: hidden` is deliberate: everything
  // inside wraps (see `file`/`title`/`rationale`), so a horizontal bar would only ever be
  // a layout bug — never an affordance.
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 9,
    maxHeight: 300,
    overflowY: "auto",
    overflowX: "hidden",
  } satisfies CSSProperties,
  item: (last: boolean): CSSProperties => ({
    paddingBottom: last ? 0 : 9,
    borderBottom: last ? undefined : "1px solid var(--border)",
  }),
  titleRow: { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" } satisfies CSSProperties,
  title: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-primary)",
    minWidth: 0,
    wordBreak: "break-word",
  } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 3,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  // A repo-relative path is one unbreakable token wider than the card. It wraps
  // instead of truncating: the tail (file name + line range) is the useful part.
  file: {
    fontSize: 11,
    color: "var(--accent-text)",
    minWidth: 0,
    wordBreak: "break-word",
  } satisfies CSSProperties,
  rationale: {
    fontSize: 11.5,
    color: "var(--text-secondary)",
    lineHeight: 1.45,
    marginTop: 5,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    wordBreak: "break-word",
  } as CSSProperties,
  note: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
