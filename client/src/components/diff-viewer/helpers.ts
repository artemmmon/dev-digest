/** Pure helpers for the DiffViewer. */
import { languageOf, isGeneratedPath } from "@devdigest/shared";
import { HUNK_HEADER_RE } from "./constants";

export interface FileChip {
  /** Short label for the chip, e.g. `dart`, `tsx`, `yaml`. */
  label: string;
  /** Full name for the tooltip, e.g. `Dart`, `TypeScript (TSX)`. */
  name: string;
  /** True for a build-step output (`*.g.dart`, …) — never authored by hand. */
  generated: boolean;
}

/** Language/format chip for one changed file, or `null` when nothing is recognised. */
export function fileChip(path: string): FileChip | null {
  const info = languageOf(path);
  if (!info) return null;
  return { label: info.label, name: info.name, generated: isGeneratedPath(path) };
}

export interface Line {
  kind: "add" | "del" | "ctx" | "hunk";
  text: string;
  oldNo?: number;
  newNo?: number;
}

/** Parse unified-diff patch text into renderable lines with old/new line numbers. */
export function parsePatch(patch: string | null | undefined): Line[] {
  if (!patch) return [];
  const out: Line[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const m = raw.match(HUNK_HEADER_RE);
      if (m) {
        oldNo = parseInt(m[1]!, 10);
        newNo = parseInt(m[2]!, 10);
      }
      out.push({ kind: "hunk", text: raw });
    } else if (raw.startsWith("+")) {
      out.push({ kind: "add", text: raw.slice(1), newNo });
      newNo++;
    } else if (raw.startsWith("-")) {
      out.push({ kind: "del", text: raw.slice(1), oldNo });
      oldNo++;
    } else {
      out.push({ kind: "ctx", text: raw.slice(raw.startsWith(" ") ? 1 : 0), oldNo, newNo });
      oldNo++;
      newNo++;
    }
  }
  return out;
}
