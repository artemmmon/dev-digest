import {
  CONFIG_FILE_PATTERNS,
  CONFIG_MAX_DEPTH,
  GENERATED_FILE_PATTERN,
  JUNK_DIR_PATTERN,
  LOCKFILE_PATTERN,
  MAX_CONFIG_FILES,
  SCAFFOLD_DIR_PATTERN,
  SECRET_FILE_PATTERN,
  SOURCE_EXTENSIONS,
  TEST_PATH_PATTERN,
} from './constants.js';

/** Pure file-selection and prompt-formatting helpers of the conventions extractor. */

const ROOT_GROUP = '(root)';

function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase();
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function depthOf(path: string): number {
  return path.split('/').length - 1;
}

function topLevelDir(path: string): string {
  const i = path.indexOf('/');
  return i === -1 ? ROOT_GROUP : path.slice(0, i);
}

/** Never read into a prompt, whatever the extension: credentials, keys, env files. */
export function isSecretPath(path: string): boolean {
  return SECRET_FILE_PATTERN.test(path);
}

export function isTestPath(path: string): boolean {
  return TEST_PATH_PATTERN.test(path);
}

/** Hand-written source code that is not a test, not generated, not vendored. */
export function isSampleableSource(path: string): boolean {
  if (!SOURCE_EXTENSIONS.has(extensionOf(path))) return false;
  if (isSecretPath(path) || isTestPath(path)) return false;
  if (JUNK_DIR_PATTERN.test(path) || GENERATED_FILE_PATTERN.test(path) || LOCKFILE_PATTERN.test(path)) {
    return false;
  }
  return true;
}

function isSampleableTest(path: string): boolean {
  if (!SOURCE_EXTENSIONS.has(extensionOf(path)) || !isTestPath(path)) return false;
  return !(isSecretPath(path) || JUNK_DIR_PATTERN.test(path) || GENERATED_FILE_PATTERN.test(path));
}

/**
 * Order 0..len-1 so that every prefix is spread evenly over the range (van der Corput).
 * Taking the first k gives k files spread across a folder rather than the first k alphabetically.
 */
function spreadOrder(len: number): number[] {
  const used = new Set<number>();
  const order: number[] = [];
  for (let k = 0; k < len; k++) {
    let frac = 0;
    let f = 0.5;
    for (let n = k; n > 0; n >>= 1, f /= 2) if (n & 1) frac += f;
    let pos = Math.min(len - 1, Math.floor(frac * len));
    while (used.has(pos)) pos = (pos + 1) % len;
    used.add(pos);
    order.push(pos);
  }
  return order;
}

/** Round-robin over top-level folders, biggest first; inside a folder, evenly spread. */
function roundRobin(paths: string[], n: number): string[] {
  const groups = new Map<string, string[]>();
  for (const p of [...paths].sort()) {
    const g = topLevelDir(p);
    const list = groups.get(g);
    if (list) list.push(p);
    else groups.set(g, [p]);
  }
  const queues = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([, list]) => spreadOrder(list.length).map((i) => list[i]!));
  const out: string[] = [];
  for (let round = 0; out.length < n; round++) {
    let progressed = false;
    for (const q of queues) {
      const p = q[round];
      if (p === undefined) continue;
      progressed = true;
      out.push(p);
      if (out.length >= n) break;
    }
    if (!progressed) break;
  }
  return out;
}

/** Config files worth showing (allowlist, depth <= 2, root first), at most `MAX_CONFIG_FILES`. */
export function pickConfigFiles(paths: string[], max = MAX_CONFIG_FILES): string[] {
  const ranked: Array<{ path: string; depth: number; kind: number }> = [];
  for (const path of paths) {
    const depth = depthOf(path);
    if (depth > CONFIG_MAX_DEPTH) continue;
    if (JUNK_DIR_PATTERN.test(path) || isSecretPath(path)) continue;
    const kind = CONFIG_FILE_PATTERNS.findIndex((re) => re.test(baseName(path)));
    if (kind === -1) continue;
    ranked.push({ path, depth, kind });
  }
  ranked.sort((a, b) => a.depth - b.depth || a.kind - b.kind || a.path.localeCompare(b.path));
  return ranked.slice(0, max).map((r) => r.path);
}

/** Source samples chosen without repo-intel: code only, round-robin across top-level folders. */
export function pickFallbackSamples(
  paths: string[],
  n: number,
  exclude: ReadonlySet<string> = new Set(),
): string[] {
  if (n <= 0) return [];
  const eligible = paths.filter((p) => !exclude.has(p) && isSampleableSource(p));
  const own = roundRobin(
    eligible.filter((p) => !SCAFFOLD_DIR_PATTERN.test(p)),
    n,
  );
  if (own.length >= n) return own;
  return [...own, ...roundRobin(eligible.filter((p) => SCAFFOLD_DIR_PATTERN.test(p)), n - own.length)];
}

/** A few test files, so the model sees how the repo tests. */
export function pickTestSamples(
  paths: string[],
  n: number,
  exclude: ReadonlySet<string> = new Set(),
): string[] {
  if (n <= 0) return [];
  return roundRobin(
    paths.filter((p) => !exclude.has(p) && isSampleableTest(p)),
    n,
  );
}

const DEP_LIST_LIMIT = 40;

/** The parts of a package.json that show conventions: scripts, engines, dependency names. Null if not JSON. */
export function summarizePackageJson(text: string): string | null {
  let pkg: unknown;
  try {
    pkg = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof pkg !== 'object' || pkg === null || Array.isArray(pkg)) return null;
  const p = pkg as Record<string, unknown>;
  const keys = (v: unknown) =>
    typeof v === 'object' && v !== null ? Object.keys(v as object) : [];
  const lines: string[] = [];
  if (typeof p.name === 'string') lines.push(`name: ${p.name}`);
  if (typeof p.type === 'string') lines.push(`type: ${p.type}`);
  if (typeof p.packageManager === 'string') lines.push(`packageManager: ${p.packageManager}`);
  const engines = keys(p.engines).map((k) => `${k} ${String((p.engines as Record<string, unknown>)[k])}`);
  if (engines.length) lines.push(`engines: ${engines.join(', ')}`);
  const scripts = keys(p.scripts);
  if (scripts.length) lines.push(`scripts: ${scripts.join(', ')}`);
  const deps = keys(p.dependencies);
  if (deps.length) lines.push(`dependencies: ${deps.slice(0, DEP_LIST_LIMIT).join(', ')}`);
  const dev = keys(p.devDependencies);
  if (dev.length) lines.push(`devDependencies: ${dev.slice(0, DEP_LIST_LIMIT).join(', ')}`);
  return lines.join('\n');
}

const TREE_DIR_LIMIT = 12;
const TREE_EXT_LIMIT = 8;

/** A few lines of layout: file count, top-level folders with sizes, most common extensions. */
export function treeSummary(paths: string[]): string {
  const dirs = new Map<string, number>();
  const exts = new Map<string, number>();
  for (const p of paths) {
    const g = topLevelDir(p);
    dirs.set(g, (dirs.get(g) ?? 0) + 1);
    const ext = extensionOf(p);
    if (ext) exts.set(ext, (exts.get(ext) ?? 0) + 1);
  }
  const top = (m: Map<string, number>, limit: number) =>
    [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
  const dirText = top(dirs, TREE_DIR_LIMIT)
    .map(([d, c]) => (d === ROOT_GROUP ? `${d} (${c})` : `${d}/ (${c})`))
    .join(', ');
  const extText = top(exts, TREE_EXT_LIMIT)
    .map(([e, c]) => `.${e} ${c}`)
    .join(', ');
  return [`Tracked files: ${paths.length}`, `Top-level: ${dirText}`, `Extensions: ${extText}`].join('\n');
}

/** Prefix every line with its 1-based number, as `  12| code`, so the model can cite lines. */
export function numberLines(text: string, firstLine = 1): string {
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const width = String(firstLine + lines.length - 1).length;
  return lines.map((l, i) => `${String(firstLine + i).padStart(width)}| ${l}`).join('\n');
}

/**
 * The part of a file that fits in `maxChars`, cut at a line boundary.
 * `truncated` is how many lines were left out (0 = whole file).
 */
export function clipToChars(text: string, maxChars: number): { text: string; truncated: number } {
  if (text.length <= maxChars) return { text, truncated: 0 };
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 1 > maxChars && kept.length > 0) break;
    kept.push(line);
    used += line.length + 1;
  }
  return { text: kept.join('\n'), truncated: lines.length - kept.length };
}
