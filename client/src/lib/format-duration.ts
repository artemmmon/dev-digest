/** Duration in ms as seconds with one decimal ("6.2s"). `null`/`undefined` = no data → "—". */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}
