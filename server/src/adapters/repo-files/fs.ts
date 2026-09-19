import { readdir, stat, readFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { EXCLUDED_DIRS, MAX_FILE_SIZE, MAX_INDEXED_FILES, SUPPORTED_EXT } from '@devdigest/shared';

/**
 * File system access to a repo's clone for the repo-intel indexer (implements the
 * module's RepoFiles port).
 *
 * The walk applies:
 *   - EXCLUDED_DIRS  (node_modules, dist, build, coverage, .next, out, vendor, .git)
 *   - SUPPORTED_EXT  (.ts, .tsx, .js, .jsx, .mjs, .cjs)
 *   - MAX_FILE_SIZE  (400 KB) — larger files are counted in `stats.skippedTooLarge`
 *                    and left out of the result.
 *   - MAX_INDEXED_FILES (5000) — if exceeded, take the FIRST N (alphabetical) and
 *                    record `stats.bounded = total - N`.
 *
 * NOT YET HANDLED: `.gitignore` filtering (would need the `ignore` package, or
 * `git ls-files`); EXCLUDED_DIRS covers the heaviest dirs, so the practical loss is small.
 */

const EXCLUDED_SET: ReadonlySet<string> = new Set(EXCLUDED_DIRS);
const SUPPORTED_SET: ReadonlySet<string> = new Set(SUPPORTED_EXT);

export interface WalkStats {
  totalCandidates: number;
  skippedTooLarge: number;
  bounded: number;
}

export interface WalkResult {
  /** Paths relative to `root`, separator-normalized to forward slashes. */
  files: string[];
  stats: WalkStats;
}

export class FsRepoFiles {
  async walk(root: string): Promise<WalkResult> {
    const out: string[] = [];
    const stats: WalkStats = { totalCandidates: 0, skippedTooLarge: 0, bounded: 0 };

    await walkDir(root, root, out, stats);

    // Stable order: alphabetical relpath, so "first N when bounded" is reproducible.
    out.sort();

    if (out.length > MAX_INDEXED_FILES) {
      stats.bounded = out.length - MAX_INDEXED_FILES;
      out.length = MAX_INDEXED_FILES;
    }

    return { files: out, stats };
  }

  read(root: string, relPath: string): Promise<string> {
    return readFile(join(root, relPath), 'utf8');
  }
}

async function walkDir(root: string, dir: string, out: string[], stats: WalkStats): Promise<void> {
  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    // Unreadable directory (permissions, dangling symlink) — skip cleanly so the
    // indexer keeps making progress on the parts of the clone it CAN read.
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue; // never follow symlinks (loops, perf)
    const name = entry.name;

    if (entry.isDirectory()) {
      if (EXCLUDED_SET.has(name)) continue;
      await walkDir(root, join(dir, name), out, stats);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = extname(name).toLowerCase();
    if (!SUPPORTED_SET.has(ext)) continue;

    stats.totalCandidates += 1;

    const full = join(dir, name);
    let size: number;
    try {
      size = (await stat(full)).size;
    } catch {
      continue;
    }
    if (size > MAX_FILE_SIZE) {
      stats.skippedTooLarge += 1;
      continue;
    }

    // Posix-style relative path so DB rows are platform-agnostic (matches `pr_files.path`).
    out.push(relative(root, full).split(sep).join('/'));
  }
}
