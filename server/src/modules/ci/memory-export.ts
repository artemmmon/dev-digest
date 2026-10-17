export interface MemoryLine {
  kind: string;
  content: string;
}

/**
 * One JSON line `{"kind","content"}` per entry (AC-24); an empty string when there
 * are none (AC-25). Only these two fields leave DevDigest: no embedding, sources or
 * confidence.
 */
export function memoryJsonl(entries: readonly MemoryLine[]): string {
  if (entries.length === 0) return '';
  return entries.map((e) => JSON.stringify({ kind: e.kind, content: e.content })).join('\n') + '\n';
}
