/* use-search-param-state.ts — a string state that lives in the URL query (?key=value),
   so a tab or an open drawer survives reload and can be linked to. */
"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * `[value, setValue]` for one query parameter. `null` (or the default) removes it
 * from the URL; setting replaces the history entry rather than adding one.
 */
export function useSearchParamState(
  key: string,
  fallback: string,
): [string, (next: string | null) => void];
export function useSearchParamState(
  key: string,
  fallback: null,
): [string | null, (next: string | null) => void];
export function useSearchParamState(key: string, fallback: string | null) {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = search.get(key) ?? fallback;

  const setValue = useCallback(
    (next: string | null) => {
      const sp = new URLSearchParams(search.toString());
      if (next == null) sp.delete(key);
      else sp.set(key, next);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [key, pathname, router, search],
  );

  return [value, setValue];
}
