/* use-stats-period.ts — the selected stats period, read from and written to the URL
   (`?period=&from=&to=`), so it survives reload and can be linked to (AC-10, AC-70). */
"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useSearchParamsUpdate } from "@/lib/use-search-param-state";
import { parseStatsPeriod, statsPeriodToSearch, type StatsPeriodSelection } from "@/lib/stats-period";

/** `[selection, setSelection]`: the selection is derived from the URL; setting it moves all three params in one navigation. */
export function useStatsPeriod(): [StatsPeriodSelection, (next: StatsPeriodSelection) => void] {
  const search = useSearchParams();
  const update = useSearchParamsUpdate();
  const period = search.get("period");
  const from = search.get("from");
  const to = search.get("to");
  const selection = useMemo(() => parseStatsPeriod({ period, from, to }), [period, from, to]);
  const setSelection = useCallback((next: StatsPeriodSelection) => update(statsPeriodToSearch(next)), [update]);
  return [selection, setSelection];
}
