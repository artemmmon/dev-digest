/* interactive.ts — helpers for rows that are clickable as a whole but must stay
   accessible: the keyboard / screen-reader path is a real <button> or <Link> inside
   the row, and the row's own click only widens the mouse target. */
import type React from "react";

/** Reset for a <button> that should look like the text/row it wraps. */
export const unstyledButton: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  font: "inherit",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

/** Clicks that started on these already do something; the row must not act on them too. */
const HANDLED_BY_CHILD = "a,button,input,textarea,select,label,[data-row-ignore]";

/**
 * Props for a row container that acts on a click anywhere on it. The container is
 * `role="presentation"` — not itself a control — so the row must contain a real
 * button/link doing the same thing for keyboard and assistive-tech users. Clicks on
 * controls inside the row (links, buttons, `data-row-ignore` areas) are left to them.
 */
export function rowClickProps(onActivate: () => void) {
  return {
    role: "presentation" as const,
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).closest(HANDLED_BY_CHILD)) return;
      onActivate();
    },
  };
}
