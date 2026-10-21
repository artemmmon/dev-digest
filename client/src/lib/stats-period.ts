/* stats-period.ts — the period model shared by the Agent Performance page and the agent Stats tab.
   The period lives in the URL as local dates (`?period=custom&from=2026-10-01&to=2026-10-07`); the API
   gets full ISO instants the browser computes from them (start / end of the local day), so the server
   never needs a time zone. Pure: no React, no I/O. */

/** What the user picked: a rolling window, or a custom range of local `YYYY-MM-DD` dates. */
export type StatsPeriodSelection =
  | { period: "1d" | "30d" }
  | { period: "custom"; from: string; to: string };

/** Why a custom range is not usable; `null` from `validateCustomRange` means it is. */
export type CustomRangeError = "startAfterEnd" | "endAfterToday" | "missing";

/** The period shown when the URL names none, an unknown one, or an invalid custom range (AC-5, AC-11). */
export const DEFAULT_STATS_PERIOD: StatsPeriodSelection = { period: "30d" };

/** An agent with fewer decisions (accepted + dismissed) than this has a "small sample" accept rate (AC-38). */
export const SMALL_SAMPLE_DECISIONS = 10;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` of `now` in the browser's local time zone. */
export function todayLocal(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Split `YYYY-MM-DD` into numbers; `null` when it is not a real calendar date (e.g. 2026-02-30). */
function parseDate(value: string): [number, number, number] | null {
  const m = DATE_RE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(y, mo - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== mo - 1 || probe.getDate() !== d) return null;
  return [y, mo, d];
}

/** Whether a custom range can be used: both dates real, start not after end, end not after `today` (AC-8). */
export function validateCustomRange(from: string, to: string, today: string): CustomRangeError | null {
  if (!parseDate(from) || !parseDate(to)) return "missing";
  // `YYYY-MM-DD` strings compare correctly as text.
  if (from > to) return "startAfterEnd";
  if (to > today) return "endAfterToday";
  return null;
}

/** The selection a URL describes; anything unknown or invalid becomes the default 30 days (AC-11, EC-8). */
export function parseStatsPeriod(
  params: { period?: string | null; from?: string | null; to?: string | null },
  today: string = todayLocal(),
): StatsPeriodSelection {
  const { period, from, to } = params;
  if (period === "1d" || period === "30d") return { period };
  if (period === "custom" && from && to && validateCustomRange(from, to, today) === null) {
    return { period: "custom", from, to };
  }
  return DEFAULT_STATS_PERIOD;
}

/** URL params for `useSearchParamsUpdate`: `null` removes a param (a non-custom period carries no dates). */
export function statsPeriodToSearch(sel: StatsPeriodSelection): {
  period: string;
  from: string | null;
  to: string | null;
} {
  if (sel.period === "custom") return { period: "custom", from: sel.from, to: sel.to };
  return { period: sel.period, from: null, to: null };
}

/** The query string of the stats endpoints; custom bounds are the local start and end of the chosen days. */
export function statsPeriodToApiQuery(sel: StatsPeriodSelection): string {
  const sp = new URLSearchParams({ period: sel.period });
  if (sel.period === "custom") {
    const [fy, fm, fd] = parseDate(sel.from) ?? [0, 1, 1];
    const [ty, tm, td] = parseDate(sel.to) ?? [0, 1, 1];
    sp.set("from", new Date(fy, fm - 1, fd, 0, 0, 0, 0).toISOString());
    sp.set("to", new Date(ty, tm - 1, td, 23, 59, 59, 999).toISOString());
  }
  return sp.toString();
}

/** Accepted + dismissed findings: the decisions an accept rate is computed from. */
export function decisionsOf(s: { accepted: number; dismissed: number }): number {
  return s.accepted + s.dismissed;
}

/** True when the decisions are too few for the accept rate to mean much (AC-38). */
export function isSmallSample(s: { accepted: number; dismissed: number }): boolean {
  return decisionsOf(s) < SMALL_SAMPLE_DECISIONS;
}
