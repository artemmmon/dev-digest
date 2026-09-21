/* crumb.tsx — the breadcrumb the shell shows, set by whichever page is on screen.
   The shell lives in the root layout (so it survives navigation); a page tells it
   where it is with `usePageCrumb`. */
"use client";

import React from "react";
import type { Crumb } from "@devdigest/ui";

interface CrumbApi {
  crumb: Crumb[];
  setCrumb: (crumb: Crumb[]) => void;
}

const CrumbContext = React.createContext<CrumbApi | null>(null);

export function CrumbProvider({ children }: { children: React.ReactNode }) {
  const [crumb, setCrumb] = React.useState<Crumb[]>([]);
  const value = React.useMemo(() => ({ crumb, setCrumb }), [crumb]);
  return <CrumbContext.Provider value={value}>{children}</CrumbContext.Provider>;
}

/** The current breadcrumb (read by the shell). */
export function useCrumb(): Crumb[] {
  return React.useContext(CrumbContext)?.crumb ?? [];
}

// A layout effect, so the crumb is in place before the first paint of the page.
const useLayoutEffectOnClient = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/**
 * Set the shell's breadcrumb for this page; cleared when the page unmounts. Pass a
 * fresh array every render if you like — only a change in its content updates the shell.
 */
export function usePageCrumb(crumb: Crumb[]): void {
  const api = React.useContext(CrumbContext);
  const setCrumb = api?.setCrumb;
  const key = JSON.stringify(crumb);
  useLayoutEffectOnClient(() => {
    setCrumb?.(JSON.parse(key) as Crumb[]);
    return () => setCrumb?.([]);
  }, [key, setCrumb]);
}
