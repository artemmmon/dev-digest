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

/** How long the page must stay still before a jump counts as finished. */
const JUMP_SETTLE_MS = 150;
/** Slack for "scrolled to the very end" (sub-pixel scroll positions). */
const BOTTOM_SLACK_PX = 2;

/**
 * Which section is at the top of the visible area, and how to jump to one.
 * `wrapRef` is the element holding the cards; `enabled` is true while they are on screen. While enabled, the
 * nearest scrolling ancestor is listened to (passive, cleaned up); on first show, a page-address anchor that
 * is one of the section kinds scrolls to that card — any other anchor is ignored.
 *
 * A jump owns the highlight: while its smooth scroll runs, scroll events do not move it (no flicker through
 * the sections in between), and afterwards the chosen section stays highlighted until the user scrolls to
 * another one — a card near the end of the page can never reach the top, so position alone would hand the
 * highlight back to an earlier section.
 */
export function useActiveSection(
  wrapRef: React.RefObject<HTMLElement | null>,
  kinds: readonly TourSectionKind[],
  enabled: boolean,
) {
  const [active, setActive] = React.useState<TourSectionKind | undefined>(kinds[0]);
  /** The section a jump is scrolling to, while that scroll runs. */
  const jumpingTo = React.useRef<TourSectionKind | null>(null);
  /** After a jump: the chosen section, and what position alone said when the scroll stopped. */
  const pinned = React.useRef<{ kind: TourSectionKind; byPosition: TourSectionKind | undefined } | null>(null);
  const settleTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /** The section position alone points at: the last card at or above the threshold, or the last one at the very end. */
  const byPosition = React.useCallback((): TourSectionKind | undefined => {
    const container = scrollParent(wrapRef.current);
    if (!container) return kinds[0];
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - BOTTOM_SLACK_PX) {
      return kinds[kinds.length - 1];
    }
    let current = kinds[0];
    for (const kind of kinds) {
      const card = document.getElementById(kind);
      if (card && topWithin(card, container) - container.scrollTop <= ACTIVE_THRESHOLD_PX) current = kind;
    }
    return current;
  }, [kinds, wrapRef]);

  /** (Re)start the wait for the jump's scroll to stop; when it does, pin the chosen section. */
  const armSettle = React.useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      const kind = jumpingTo.current;
      jumpingTo.current = null;
      if (kind) pinned.current = { kind, byPosition: byPosition() };
    }, JUMP_SETTLE_MS);
  }, [byPosition]);

  React.useEffect(() => {
    if (!enabled) return;
    const container = scrollParent(wrapRef.current);

    const hash = window.location.hash.slice(1);
    const anchored = kinds.find((kind) => kind === hash);
    if (anchored) {
      jumpingTo.current = anchored;
      armSettle();
      scrollToCard(anchored, wrapRef.current, "auto");
      setActive(anchored);
    }
    if (!container) return;

    let frame: number | null = null;
    const update = () => {
      frame = null;
      if (jumpingTo.current) return;
      const current = byPosition();
      if (pinned.current) {
        if (current === pinned.current.byPosition) return;
        pinned.current = null;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (jumpingTo.current) {
        armSettle();
        return;
      }
      if (frame === null) frame = requestAnimationFrame(update);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = null;
      jumpingTo.current = null;
    };
  }, [enabled, kinds, wrapRef, byPosition, armSettle]);

  /** Scroll the section's card to the top of the visible area and put its kind into the page address. */
  const jumpTo = React.useCallback(
    (kind: TourSectionKind) => {
      pinned.current = null;
      jumpingTo.current = kind;
      armSettle();
      setActive(kind);
      scrollToCard(kind, wrapRef.current, "smooth");
      window.history.replaceState(null, "", `#${kind}`);
    },
    [wrapRef, armSettle],
  );

  return { active, jumpTo };
}
