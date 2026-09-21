import type { CSSProperties } from "react";
import { GUTTER_WIDTH, LINE_HEIGHT, TEXT_PAD_RIGHT, VERTICAL_PAD } from "./constants";

/** Co-located styles for MarkdownCodeEditor. */
const text = {
  fontSize: 12.5,
  lineHeight: `${LINE_HEIGHT}px`,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
} satisfies CSSProperties;

export const s = {
  scroller: { flex: 1, minHeight: 0, overflow: "auto", background: "var(--bg-surface)" } satisfies CSSProperties,
  frame: {
    position: "relative",
    minHeight: "100%",
    boxSizing: "border-box",
    padding: `${VERTICAL_PAD}px 0`,
  } satisfies CSSProperties,
  row: { display: "flex", ...text } satisfies CSSProperties,
  number: {
    width: GUTTER_WIDTH,
    textAlign: "right",
    paddingRight: 14,
    color: "var(--text-muted)",
    userSelect: "none",
    flexShrink: 0,
    boxSizing: "border-box",
  } satisfies CSSProperties,
  code: { flex: 1, minWidth: 0, paddingRight: TEXT_PAD_RIGHT } satisfies CSSProperties,
  placeholder: { color: "var(--text-muted)" } satisfies CSSProperties,
  /** Transparent input laid exactly over the coloured lines: it takes the keystrokes and shows the caret. */
  input: {
    ...text,
    position: "absolute",
    top: VERTICAL_PAD,
    bottom: VERTICAL_PAD,
    left: GUTTER_WIDTH,
    right: 0,
    margin: 0,
    padding: `0 ${TEXT_PAD_RIGHT}px 0 0`,
    border: "none",
    outline: "none",
    resize: "none",
    overflow: "hidden",
    background: "transparent",
    color: "transparent",
    caretColor: "var(--text-primary)",
  } satisfies CSSProperties,
} as const;
