/** A 0..1 ratio as a whole percent ("78%"). `null`/`undefined` = no data → "—". */
export function formatPercent(ratio: number | null | undefined): string {
  if (ratio == null) return "—";
  return `${Math.round(ratio * 100)}%`;
}
