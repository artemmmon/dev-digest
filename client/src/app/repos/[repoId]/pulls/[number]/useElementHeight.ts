/* useElementHeight.ts — the PR-detail route measures its own header, rather than the
   header publishing its height onto DOM it doesn't own (client INSIGHTS.md, "Sticky
   elements under the PR header"). ResizeObserver is guarded: jsdom has none. */
"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/** `[ref, height]` — attach `ref` to the element to measure; `height` updates on resize. */
export function useElementHeight<T extends HTMLElement>(): [RefObject<T | null>, number | null] {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, height];
}
