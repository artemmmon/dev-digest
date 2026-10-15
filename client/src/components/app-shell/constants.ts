/** Constants for AppShell (extracted magic values). */

/** Window (ms) to press the second key of a `g`-then-key navigation chord. */
export const G_NAV_TIMEOUT_MS = 1200;

/** Nav item keys whose label lives in the `eval` message namespace: key -> message path. */
export const NAV_LABEL_KEYS: Record<string, string> = { eval: "nav.label" };
