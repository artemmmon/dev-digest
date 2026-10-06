/* use-diff-jump.ts — open the Files changed tab at a file (and line) from another tab.
   One `router.push` carries `tab`, `file` and `line` together, so the browser's Back button
   returns to the tab the jump started from (`useSearchParamState` replaces the entry instead). */
"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** `(file, line?)` → navigate to `?tab=diff&file=…&line=…`; a missing or non-positive line is left out. */
export function useDiffJump(): (file: string, line?: number | null) => void {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return useCallback(
    (file, line) => {
      const sp = new URLSearchParams(search.toString());
      sp.set("tab", "diff");
      sp.set("file", file);
      if (line != null && Number.isInteger(line) && line > 0) sp.set("line", String(line));
      else sp.delete("line");
      router.push(`${pathname}?${sp.toString()}`);
    },
    [pathname, router, search],
  );
}
