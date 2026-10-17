/* CompareView/helpers.ts — pure helpers of the Compare modal: a word-level diff of two system
   prompts (AC-47) and the skills whose version differs between two runs (AC-48). */
import type { EvalSkillVersion } from "@devdigest/shared";

export type DiffKind = "same" | "add" | "del";

export interface DiffToken {
  kind: DiffKind;
  /** Words with their original whitespace, so joining the tokens rebuilds the text. */
  text: string;
}

/** Largest LCS table, in cells, that is built; a bigger diff falls back to "all removed, all added". */
export const MAX_DIFF_CELLS = 4_000_000;

/**
 * Splits into words that carry their trailing whitespace; leading whitespace stays on the first
 * word. A text of whitespace only has no words, so it never counts as a change.
 */
function words(text: string): string[] {
  if (text.trim() === "") return [];
  const parts = text.split(/(?<=\s)(?=\S)/);
  // The split also cuts after leading whitespace; glue that whitespace back onto the first word.
  if (parts.length > 1 && parts[0]!.trim() === "") parts.splice(0, 2, parts[0]! + parts[1]!);
  return parts;
}

function push(out: DiffToken[], kind: DiffKind, text: string) {
  if (text === "") return;
  const last = out[out.length - 1];
  if (last && last.kind === kind) last.text += text;
  else out.push({ kind, text });
}

/**
 * Word-level diff of `older` against `newer` (longest common subsequence over words).
 * Whitespace differences alone do not count as a change. The common head and tail are cut off
 * first, and when the remaining middle needs more than `MAX_DIFF_CELLS` cells the whole middle is
 * shown as one removed block and one added block, so a very long prompt cannot freeze the page.
 * Adjacent tokens of one kind are merged.
 */
export function wordDiff(older: string, newer: string, maxCells: number = MAX_DIFF_CELLS): DiffToken[] {
  const a = words(older);
  const b = words(newer);
  // The word at an index, "" past the end; words are compared without their whitespace.
  const wa = (i: number) => (a[i] ?? "").trim();
  const wb = (j: number) => (b[j] ?? "").trim();

  let head = 0;
  while (head < a.length && head < b.length && wa(head) === wb(head)) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    wa(a.length - 1 - tail) === wb(b.length - 1 - tail)
  ) {
    tail++;
  }

  const out: DiffToken[] = [];
  for (let i = 0; i < head; i++) push(out, "same", b[i] ?? "");

  const aMid = a.slice(head, a.length - tail);
  const bMid = b.slice(head, b.length - tail);
  const n = aMid.length;
  const m = bMid.length;

  if (n === 0 || m === 0 || (n + 1) * (m + 1) > maxCells) {
    push(out, "del", aMid.join(""));
    push(out, "add", bMid.join(""));
  } else {
    // lcs(i, j) = length of the LCS of aMid[i..] and bMid[j..]
    const width = m + 1;
    const table = new Uint16Array((n + 1) * width);
    const lcs = (i: number, j: number) => table[i * width + j] ?? 0;
    const same = (i: number, j: number) => (aMid[i] ?? "").trim() === (bMid[j] ?? "").trim();
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * width + j] = same(i, j) ? lcs(i + 1, j + 1) + 1 : Math.max(lcs(i + 1, j), lcs(i, j + 1));
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (same(i, j)) {
        push(out, "same", bMid[j] ?? "");
        i++;
        j++;
      } else if (lcs(i + 1, j) >= lcs(i, j + 1)) {
        push(out, "del", aMid[i++] ?? "");
      } else {
        push(out, "add", bMid[j++] ?? "");
      }
    }
    while (i < n) push(out, "del", aMid[i++] ?? "");
    while (j < m) push(out, "add", bMid[j++] ?? "");
  }

  // The common tail is taken from the newer text, so it keeps its own whitespace.
  for (let k = b.length - tail; k < b.length; k++) push(out, "same", b[k] ?? "");
  return out;
}

export interface SkillChange {
  skill_id: string;
  name: string;
  change: "changed" | "added" | "removed";
  /** Version in the older run; null when the skill was added. */
  from: number | null;
  /** Version in the newer run; null when the skill was removed. */
  to: number | null;
}

/** Skills whose version differs, that only the newer run had (added) or only the older run had (removed). */
export function skillChanges(
  older: readonly EvalSkillVersion[],
  newer: readonly EvalSkillVersion[],
): SkillChange[] {
  const before = new Map(older.map((sk) => [sk.skill_id, sk]));
  const after = new Map(newer.map((sk) => [sk.skill_id, sk]));
  const out: SkillChange[] = [];
  for (const [id, now] of after) {
    const was = before.get(id);
    if (!was) out.push({ skill_id: id, name: now.name, change: "added", from: null, to: now.version });
    else if (was.version !== now.version) {
      out.push({ skill_id: id, name: now.name, change: "changed", from: was.version, to: now.version });
    }
  }
  for (const [id, was] of before) {
    if (!after.has(id)) out.push({ skill_id: id, name: was.name, change: "removed", from: was.version, to: null });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}
