/* useElementHeight.ts — the PR-detail route measures its own header, rather than the
   header publishing its height onto DOM it doesn't own (client INSIGHTS.md, "Sticky
   elements under the PR header"). ResizeObserver is guarded: jsdom has none.
   The ref is a callback ref (not `useRef`) so the effect re-runs when the element
   mounts, including after an initial render (e.g. a loading state) where the node
   was still null — a plain `useRef` + effect with `[]` would observe nothing then
   run once and never see the element that shows up later. */
"use client";

import { useCallback, useEffect, useState } from "react";

/** `[ref, height]` — attach `ref` to the element to measure; `height` updates on resize. */
export function useElementHeight<T extends HTMLElement>(): [(node: T | null) => void, number | null] {
  const [node, setNode] = useState<T | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const ref = useCallback((el: T | null) => setNode(el), []);

  useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      // Border-box height (padding + border included) — the value sticky offsets
      // like `--pr-header-h` need. `contentRect` excludes them, which under-reports
      // the header's rendered box (client INSIGHTS.md, "Sticky elements under the
      // PR header"). `borderBoxSize` isn't in jsdom, so fall back to the live box.
      const borderBoxHeight = entry.borderBoxSize?.[0]?.blockSize;
      setHeight(borderBoxHeight ?? node.getBoundingClientRect().height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [ref, height];
}
