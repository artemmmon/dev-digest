import { MAX_DIFF_CELLS } from "./constants";

export interface DiffLine {
  kind: "same" | "add" | "del";
  text: string;
}

/**
 * Line diff from `from` to `to` (longest common subsequence). "del" lines are only in `from`,
 * "add" lines only in `to`. Common head and tail are cut off first, which keeps the usual case
 * (a few edited lines in a long body) cheap; a huge middle falls back to "all replaced".
 */
export function lineDiff(from: string, to: string): DiffLine[] {
  const a = from.split("\n");
  const b = to.split("\n");
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const out: DiffLine[] = a.slice(0, head).map((text) => ({ kind: "same", text }));

  if (midA.length * midB.length > MAX_DIFF_CELLS) {
    out.push(...midA.map((text): DiffLine => ({ kind: "del", text })), ...midB.map((text): DiffLine => ({ kind: "add", text })));
  } else {
    // lcs[i][j] = length of the common subsequence of midA[i..] and midB[j..]
    const lcs = Array.from({ length: midA.length + 1 }, () => new Array<number>(midB.length + 1).fill(0));
    for (let i = midA.length - 1; i >= 0; i--) {
      for (let j = midB.length - 1; j >= 0; j--) {
        lcs[i]![j] = midA[i] === midB[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < midA.length && j < midB.length) {
      if (midA[i] === midB[j]) {
        out.push({ kind: "same", text: midA[i]! });
        i++;
        j++;
      } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
        out.push({ kind: "del", text: midA[i++]! });
      } else {
        out.push({ kind: "add", text: midB[j++]! });
      }
    }
    while (i < midA.length) out.push({ kind: "del", text: midA[i++]! });
    while (j < midB.length) out.push({ kind: "add", text: midB[j++]! });
  }

  out.push(...a.slice(a.length - tail).map((text): DiffLine => ({ kind: "same", text })));
  return out;
}

/** The calendar day of an ISO timestamp (UTC), e.g. "2026-05-30". */
export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}
