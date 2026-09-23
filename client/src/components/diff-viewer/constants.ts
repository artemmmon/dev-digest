/** Constants for the DiffViewer. */

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Language-chip colour by `LanguageInfo.label` (`@devdigest/shared`). Unlisted labels fall back to grey. */
export const LANGUAGE_CHIP_COLOR: Record<string, string> = {
  dart: "#0175C2",
  ts: "#3178C6",
  tsx: "#3178C6",
  js: "#F0DB4F",
  jsx: "#F0DB4F",
  py: "#3776AB",
  go: "#00ADD8",
  rs: "#DEA584",
  java: "#B07219",
  kt: "#7F52FF",
  kts: "#7F52FF",
  swift: "#F05138",
  rb: "#CC342D",
  php: "#777BB4",
  cs: "#178600",
  html: "#E34C26",
  css: "#563D7C",
  scss: "#C6538C",
  sql: "#E38C00",
  sh: "#89E051",
  gradle: "#02303A",
  pubspec: "#0175C2",
  lint: "#0175C2",
  arb: "#0175C2",
};

export const DEFAULT_LANGUAGE_CHIP_COLOR = "var(--text-muted)";

export function colorForLanguage(label: string): string {
  return LANGUAGE_CHIP_COLOR[label] ?? DEFAULT_LANGUAGE_CHIP_COLOR;
}
