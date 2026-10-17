/** Constants for AppShell (extracted magic values). */

/** Window (ms) to press the second key of a `g`-then-key navigation chord. */
export const G_NAV_TIMEOUT_MS = 1200;

/** Nav item keys whose label is not a literal in the vendored nav: key -> full message path. */
export const NAV_LABEL_KEYS: Record<string, string> = {
  eval: "eval.nav.label",
  "multi-agent": "shell.nav.multi-agent",
};
