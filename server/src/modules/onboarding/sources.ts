import { GENERATED_FILE_PATTERN, JUNK_DIR_PATTERN, LOCKFILE_PATTERN } from '@devdigest/shared';
import {
  COMPOSE_PATTERN,
  EXAMPLE_ENV_SUFFIXES,
  FALLBACK_SOURCE_COUNT,
  MANIFEST_PATTERN,
  MAX_CHAIN_LENGTH,
  MAX_CHAINS,
  MAX_RUN_FILES,
  README_PATTERN,
  RUN_FILE_MAX_DEPTH,
  SECRET_FILE_PATTERN,
  SOURCE_EXTENSIONS,
  TOP_FILE_COUNT,
  TREE_SUMMARY_LINES,
} from './constants.js';

/** Pure choice of which repository files a tour generation reads and shows. Paths in, paths out. */

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const depthOf = (path: string): number => path.split('/').length - 1;

/** A file that holds environment values: its base name starts or ends with `.env`. */
export function isEnvFile(path: string): boolean {
  const base = baseName(path).toLowerCase();
  return base.startsWith('.env') || base.endsWith('.env');
}

/** An environment file that ends with an example suffix — the only kind that may be read. */
export function isExampleEnvFile(path: string): boolean {
  if (!isEnvFile(path)) return false;
  const base = baseName(path).toLowerCase();
  return EXAMPLE_ENV_SUFFIXES.some((suffix) => base.endsWith(suffix));
}

/** Allowlist: an environment file is readable only as an example; keys and credentials never are. */
export function isReadable(path: string): boolean {
  if (SECRET_FILE_PATTERN.test(path)) return false;
  return !isEnvFile(path) || isExampleEnvFile(path);
}

function runCategory(path: string): number | null {
  const base = baseName(path);
  if (README_PATTERN.test(base)) return 0;
  if (MANIFEST_PATTERN.test(base)) return 1;
  if (COMPOSE_PATTERN.test(base)) return 2;
  if (isExampleEnvFile(path)) return 3;
  return null;
}

/** README first, then manifests, compose files and example env files; shallow before deep. */
export function pickRunFiles(tracked: readonly string[]): string[] {
  const found: Array<{ path: string; category: number; depth: number }> = [];
  for (const path of tracked) {
    const depth = depthOf(path);
    if (depth > RUN_FILE_MAX_DEPTH || !isReadable(path) || JUNK_DIR_PATTERN.test(path)) continue;
    const category = runCategory(path);
    if (category !== null) found.push({ path, category, depth });
  }
  found.sort((a, b) => a.category - b.category || a.depth - b.depth || a.path.localeCompare(b.path));
  return found.slice(0, MAX_RUN_FILES).map((f) => f.path);
}

function isTourSource(path: string): boolean {
  if (!isReadable(path)) return false;
  if (GENERATED_FILE_PATTERN.test(path) || JUNK_DIR_PATTERN.test(path) || LOCKFILE_PATTERN.test(path)) {
    return false;
  }
  const dot = baseName(path).lastIndexOf('.');
  const ext = dot < 0 ? '' : baseName(path).slice(dot + 1).toLowerCase();
  return SOURCE_EXTENSIONS.has(ext);
}

export interface Candidates {
  /** Files worth an excerpt and a mention, best first. */
  files: string[];
  /** Dependency chains reduced to tracked, readable files; each has at least two. */
  chains: string[][];
}

/**
 * Ranked files and chains kept only when tracked. With no ranked file at all (a Python or
 * Flutter repo, an index that has not run) the tracked source files, the manifests and the
 * README stand in, so a tour can still be written.
 */
export function pickCandidates(input: {
  topFiles: readonly string[];
  chains: readonly (readonly string[])[];
  tracked: readonly string[];
}): Candidates {
  const trackedSet = new Set(input.tracked);
  const usable = (p: string) => trackedSet.has(p) && isReadable(p);

  const ranked = input.topFiles.filter(usable).slice(0, TOP_FILE_COUNT);
  const chains = input.chains
    .map((chain) => chain.filter(usable).slice(0, MAX_CHAIN_LENGTH))
    .filter((chain) => chain.length >= 2)
    .slice(0, MAX_CHAINS);
  if (ranked.length > 0) return { files: [...new Set(ranked)], chains };

  const sources = input.tracked
    .filter(isTourSource)
    .sort((a, b) => depthOf(a) - depthOf(b) || a.localeCompare(b))
    .slice(0, FALLBACK_SOURCE_COUNT);
  return { files: [...new Set([...pickRunFiles(input.tracked), ...sources])], chains };
}

/** A path is a "source" of the tour only when the checkout tracks it, after a leading `./` is cut. */
export function normalizePath(path: string): string {
  const trimmed = path.trim();
  return trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
}

/** Language mix and top-level layout of the checkout, as two short text blocks. */
export function summarizeTracked(tracked: readonly string[]): { stack: string; tree: string } {
  const byExt = new Map<string, number>();
  const byTop = new Map<string, number>();
  for (const path of tracked) {
    const base = baseName(path);
    const dot = base.lastIndexOf('.');
    if (dot > 0) {
      const ext = base.slice(dot).toLowerCase();
      byExt.set(ext, (byExt.get(ext) ?? 0) + 1);
    }
    const slash = path.indexOf('/');
    const top = slash < 0 ? '.' : `${path.slice(0, slash)}/`;
    byTop.set(top, (byTop.get(top) ?? 0) + 1);
  }
  const stack = [...byExt.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([ext, n]) => `${ext}: ${n}`)
    .join(', ');
  const tree = [...byTop.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TREE_SUMMARY_LINES)
    .map(([dir, n]) => `${dir} (${n} files)`)
    .join('\n');
  return { stack: `Tracked files: ${tracked.length}. By extension — ${stack || 'none'}`, tree };
}
