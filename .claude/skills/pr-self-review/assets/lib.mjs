// Shared helpers for collect-diff.mjs and gate-check.mjs. No dependencies, Node >= 22.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));

export function git(args, { cwd, allowFail = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (allowFail) return null;
    throw err;
  }
}

export function repoRoot(cwd = process.cwd()) {
  return git(['rev-parse', '--show-toplevel'], { cwd }).trim();
}

export function loadRouting() {
  return JSON.parse(readFileSync(join(HERE, 'routing.json'), 'utf8'));
}

/** Glob → RegExp. `**` any depth, `*`/`?` inside a segment, `{a,b}` alternatives. */
export function globToRegExp(glob) {
  let re = '';
  let braceDepth = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '{') {
      braceDepth++;
      re += '(?:';
    } else if (c === '}' && braceDepth > 0) {
      braceDepth--;
      re += ')';
    } else if (c === ',' && braceDepth > 0) {
      re += '|';
    } else {
      re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

export function makeMatcher(globs) {
  const res = globs.map(globToRegExp);
  return (path) => res.some((r) => r.test(path));
}

function refExists(ref, cwd) {
  return Boolean(git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd, allowFail: true }));
}

/**
 * What to compare against, and how wide the review is:
 *  - `custom`       an explicit --base
 *  - `unpushed`     the branch already has a live upstream: only what is not on the remote yet
 *  - `pull-request` a branch never pushed: everything since the merge-base with the default branch
 * @returns {{ ref: string, scope: 'custom' | 'unpushed' | 'pull-request' }}
 */
export function resolveBase(routing, cwd, override) {
  if (override) {
    if (!refExists(override, cwd)) throw new Error(`base ref does not exist: ${override}`);
    return { ref: override, scope: 'custom' };
  }
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], { cwd, allowFail: true })?.trim();
  if (upstream && refExists(upstream, cwd)) return { ref: upstream, scope: 'unpushed' };
  for (const ref of routing.baseRefs) {
    if (refExists(ref, cwd)) return { ref, scope: 'pull-request' };
  }
  throw new Error(`none of the base refs exist: ${routing.baseRefs.join(', ')}`);
}

/**
 * Everything that will end up in the PR: commits since the merge-base, plus staged,
 * unstaged and untracked files. Renames are reported as delete + add.
 * @returns {{ base: string, scope: string, mergeBase: string, headSha: string, branch: string, files: {path: string, status: 'A'|'M'|'D'}[] }}
 */
export function changedFiles(routing, cwd, baseOverride) {
  const { ref: base, scope } = resolveBase(routing, cwd, baseOverride);
  const mergeBase = git(['merge-base', base, 'HEAD'], { cwd }).trim();
  const headSha = git(['rev-parse', 'HEAD'], { cwd }).trim();
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }).trim();

  const byPath = new Map();
  const tracked = git(['diff', '--name-status', '-z', '--no-renames', mergeBase], { cwd }).split('\0');
  for (let i = 0; i + 1 < tracked.length; i += 2) {
    const status = tracked[i][0];
    byPath.set(tracked[i + 1], status === 'D' ? 'D' : status === 'A' ? 'A' : 'M');
  }
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'], { cwd }).split('\0');
  for (const p of untracked) if (p) byPath.set(p, 'A');

  const files = [...byPath]
    .map(([path, status]) => ({ path, status }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  return { base, scope, mergeBase, headSha, branch, files };
}

/** Changed files minus routing.excluded — the set every later step (routing, hash, gate) agrees on. */
export function includedFiles(routing, change) {
  const isExcluded = makeMatcher(routing.excluded);
  return change.files.filter((f) => !isExcluded(f.path));
}

function fileFingerprint(root, path) {
  const abs = join(root, path);
  try {
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) return `link:${readlinkSync(abs)}`;
    if (st.isFile()) return createHash('sha256').update(readFileSync(abs)).digest('hex');
    return 'other';
  } catch {
    return 'deleted';
  }
}

/** Content-based hash of the reviewed change set. Changes when any included file, or the merge-base, changes. */
export function diffHash(root, mergeBase, paths) {
  const h = createHash('sha256');
  h.update(`base:${mergeBase}\n`);
  for (const p of [...paths].sort()) h.update(`${p}\0${fileFingerprint(root, p)}\n`);
  return h.digest('hex');
}

/** Directory names under .claude/skills that contain a SKILL.md. */
export function installedSkills(root) {
  const dir = join(root, '.claude', 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
}

export function branchSlug(branch) {
  return branch.replace(/[^A-Za-z0-9._-]+/g, '_');
}

/** Where verdicts live: inside the git dir, so they are never committed. Worktree-safe. */
export function verdictDir(cwd) {
  const p = git(['rev-parse', '--git-path', 'pr-self-review'], { cwd }).trim();
  return p.startsWith('/') ? p : join(cwd, p);
}

export function verdictPath(cwd, branch) {
  return join(verdictDir(cwd), `${branchSlug(branch)}.json`);
}

/** What the gate compares a stored verdict against. */
export function currentState(root, routing, baseOverride) {
  const change = changedFiles(routing, root, baseOverride);
  const files = includedFiles(routing, change);
  return {
    branch: change.branch,
    base: change.base,
    scope: change.scope,
    headSha: change.headSha,
    mergeBase: change.mergeBase,
    empty: files.length === 0,
    diffHash: diffHash(root, change.mergeBase, files.map((f) => f.path)),
  };
}
