"use client";

import React from "react";
import type { TourSectionKind } from "@devdigest/shared";
import { ACTIVE_THRESHOLD_PX, SCROLL_OFFSET_PX } from "../constants";

/** The nearest ancestor of `from` that actually scrolls vertically, or null when the window scrolls. */
function scrollParent(from: HTMLElement | null): HTMLElement | null {
  let el = from?.parentElement ?? null;
  while (el) {
    const overflowY = getComputedStyle(el).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 4) return el;
    el = el.parentElement;
  }
  return null;
}

/** Top of `el` measured from the top of the scrolled content of `container`. */
function topWithin(el: HTMLElement, container: HTMLElement): number {
  return el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
}

function scrollToCard(kind: TourSectionKind, from: HTMLElement | null, behavior: ScrollBehavior): void {
  const card = document.getElementById(kind);
  if (!card) return;
  const container = scrollParent(from);
  if (container) {
    container.scrollTo?.({ top: Math.max(0, topWithin(card, container) - SCROLL_OFFSET_PX), behavior });
  } else {
    window.scrollTo?.({ top: card.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET_PX, behavior });
  }
}

/**
 * Which section is at the top of the visible area, and how to jump to one.
 * `wrapRef` is the element holding the cards; `enabled` is true while they are on screen. While enabled, the
 * nearest scrolling ancestor is listened to (passive, cleaned up); on first show, a page-address anchor that
 * is one of the section kinds scrolls to that card — any other anchor is ignored.
 */
export function useActiveSection(
  wrapRef: React.RefObject<HTMLElement | null>,
  kinds: readonly TourSectionKind[],
  enabled: boolean,
) {
  const [active, setActive] = React.useState<TourSectionKind | undefined>(kinds[0]);

  React.useEffect(() => {
    if (!enabled) return;
    const container = scrollParent(wrapRef.current);

    const hash = window.location.hash.slice(1);
    const anchored = kinds.find((kind) => kind === hash);
    if (anchored) {
      scrollToCard(anchored, wrapRef.current, "auto");
      setActive(anchored);
    }
    if (!container) return;

    const onScroll = () => {
      let current = kinds[0];
      for (const kind of kinds) {
        const card = document.getElementById(kind);
        if (card && topWithin(card, container) - container.scrollTop <= ACTIVE_THRESHOLD_PX) current = kind;
      }
      setActive(current);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [enabled, kinds, wrapRef]);

  /** Scroll the section's card to the top of the visible area and put its kind into the page address. */
  const jumpTo = React.useCallback(
    (kind: TourSectionKind) => {
      setActive(kind);
      scrollToCard(kind, wrapRef.current, "smooth");
      window.history.replaceState(null, "", `#${kind}`);
    },
    [wrapRef],
  );

  return { active, jumpTo };
}
