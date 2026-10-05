import type { AgentContext, ProjectDocument } from "@devdigest/shared";

export type InheritedDoc = AgentContext["inherited"][number];

/**
 * How a row relates to the list's owner: `attached` (stored, in order), `missing` (stored but no
 * longer a document), `inherited` (read-only, through a skill) or `unattached`.
 */
export type RowKind = "attached" | "missing" | "inherited" | "unattached";

export interface DocRow {
  /** Repository-relative path; also the React key. */
  path: string;
  kind: RowKind;
  /** The server's entry for the path; absent for a missing row. */
  doc?: ProjectDocument;
  /** The skill an inherited row comes through. */
  skillName?: string;
}

/** "1234" → "1.2K". Token numbers always come from the server; this only formats them. */
export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : String(n);
}

/**
 * Every row in prompt order: attached paths in their stored order (a path that is no longer a
 * document stays, as `missing`), then the inherited ones, then every other document by ascending path.
 */
export function orderRows(documents: ProjectDocument[], attached: string[], inherited: InheritedDoc[] = []): DocRow[] {
  const byPath = new Map(documents.map((d) => [d.path, d]));
  const direct = [...new Set(attached)];
  const directSet = new Set(direct);
  const rows: DocRow[] = direct.map((path) => {
    const doc = byPath.get(path);
    return { path, kind: doc ? "attached" : "missing", doc };
  });
  const seen = new Set(directSet);
  for (const i of inherited) {
    if (seen.has(i.path)) continue;
    seen.add(i.path);
    rows.push({ path: i.path, kind: "inherited", doc: byPath.get(i.path), skillName: i.skill_name });
  }
  const rest = documents.filter((d) => !seen.has(d.path)).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const doc of rest) rows.push({ path: doc.path, kind: "unattached", doc });
  return rows;
}

/** Case-insensitive "path contains the typed text"; an empty filter matches everything. */
export function matchesFilter(path: string, filter: string): boolean {
  const q = filter.trim().toLowerCase();
  return !q || path.toLowerCase().includes(q);
}

/**
 * Move the attached path at `from` to position `to`. Indexes are positions in the full attached
 * list, not in a filtered view. A no-op (same index, or an index outside the list) returns the
 * SAME array so callers can skip the save.
 */
export function moveAttachedTo(attached: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || from >= attached.length || to < 0 || to >= attached.length) return attached;
  const next = [...attached];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Move the attached path at `index` one position (ArrowUp / ArrowDown on its grip). */
export function moveAttached(attached: string[], index: number, delta: -1 | 1): string[] {
  return moveAttachedTo(attached, index, index + delta);
}

/** Attach (appended last) or detach one path. */
export function toggleAttached(attached: string[], path: string): string[] {
  return attached.includes(path) ? attached.filter((p) => p !== path) : [...attached, path];
}

/** Sum of the server's token counts over the DISTINCT paths; a path without a document counts 0. */
export function totalTokens(documents: ProjectDocument[], paths: string[]): number {
  const byPath = new Map(documents.map((d) => [d.path, d.tokens]));
  let total = 0;
  for (const p of new Set(paths)) total += byPath.get(p) ?? 0;
  return total;
}

/** Split a path into its directory (with trailing slash) and file name. */
export function splitPath(path: string): { dir: string; name: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { dir: "", name: path } : { dir: path.slice(0, i + 1), name: path.slice(i + 1) };
}
