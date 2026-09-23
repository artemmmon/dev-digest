/** Quick-fill values for an "Applies to" glob field (skills and agents), so nobody
    has to type raw globs. Shared: promoted here once agents needed the same set
    the Skills form already had. */
export const APPLIES_TO_PRESETS: readonly { key: string; value: string }[] = [
  { key: "flutter", value: "*.dart, pubspec.yaml, *.arb" },
  { key: "typescript", value: "*.ts, *.tsx, *.js, *.jsx, *.mjs, *.cjs" },
  { key: "python", value: "*.py" },
];

/** Comma text -> the wire's glob list; blank/all-empty -> `null` ("always applies"). */
export function parseAppliesTo(text: string): string[] | null {
  const patterns = text
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return patterns.length > 0 ? patterns : null;
}
