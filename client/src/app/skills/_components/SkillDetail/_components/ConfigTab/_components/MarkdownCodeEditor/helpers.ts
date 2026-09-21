import type { CSSProperties } from "react";

/** Colour of one line, as in the design: headings in the accent, list items dimmed. */
export function lineStyle(line: string): CSSProperties {
  if (line.startsWith("#")) return { color: "var(--accent-text)", fontWeight: 600 };
  if (line.startsWith("-")) return { color: "var(--text-secondary)" };
  return { color: "var(--text-primary)" };
}
