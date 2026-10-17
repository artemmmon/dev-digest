/* useDialogA11y — what the kit Modal does not do (NFR-7): close on Escape, keep Tab inside the dialog, take
   focus in on open and give it back to the opener on close. `locked` suppresses Escape while something on
   top owns it (a confirmation dialog) or while a request runs. */
"use client";

import React from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusablesIn(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("hidden"));
}

export function useDialogA11y(rootRef: React.RefObject<HTMLElement | null>, onClose: () => void, locked: boolean) {
  const state = React.useRef({ onClose, locked });
  React.useEffect(() => {
    state.current = { onClose, locked };
  });

  React.useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const own = () => rootRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null;

    const dialog = own();
    if (dialog) (focusablesIn(rootRef.current ?? dialog)[0] ?? focusablesIn(dialog)[0] ?? dialog).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (state.current.locked) return;
        e.stopPropagation();
        state.current.onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const mine = own();
      if (!mine) return;
      const active = document.activeElement;
      const activeDialog = active instanceof Element ? active.closest('[role="dialog"]') : null;
      // Focus is in a dialog on top of this one (a confirmation): that dialog owns Tab.
      if (activeDialog && activeDialog !== mine) return;
      const items = focusablesIn(mine);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (!activeDialog) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, [rootRef]);
}
