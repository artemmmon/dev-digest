// Human-readable duration of an agent run for the PR detail header and run list.
import prettyMilliseconds from 'pretty-ms';

/** How long a run took, e.g. "1m 12s". `durationSeconds` comes from the run record. */
export function formatRunDuration(durationSeconds: number | null): string {
  if (durationSeconds == null) return 'running';
  return prettyMilliseconds(durationSeconds, { secondsDecimalDigits: 0 });
}

/** Total time of a review round: the sum of its runs' durations. */
export function formatRoundDuration(durationsSeconds: Array<number | null>): string {
  const total = durationsSeconds.reduce<number>((sum, d) => sum + (d ?? 0), 0);
  return formatRunDuration(total);
}
