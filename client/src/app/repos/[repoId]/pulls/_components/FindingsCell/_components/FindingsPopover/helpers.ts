import type { FindingRecord } from "@devdigest/shared";

/** `12` for a single line, `12-18` for a range. */
export function lineLabel(f: FindingRecord): string {
  return f.end_line !== f.start_line ? `${f.start_line}-${f.end_line}` : `${f.start_line}`;
}

/** Bold/code markers removed — previews are one flat paragraph, not rendered markdown. */
export function stripMd(text: string): string {
  return (text ?? "").replace(/\*\*|`/g, "");
}
