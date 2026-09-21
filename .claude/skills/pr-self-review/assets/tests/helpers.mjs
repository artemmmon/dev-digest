import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const sh = (cwd, ...args) => execFileSync(args[0], args.slice(1), { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

export function write(root, rel, content = 'x\n') {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

/** Temp repo: `main` has a base commit, `feature` is checked out. */
export function makeRepo(baseFiles = {}) {
  const root = mkdtempSync(join(tmpdir(), 'pr-self-review-'));
  sh(root, 'git', 'init', '-q', '-b', 'main');
  sh(root, 'git', 'config', 'user.email', 't@t');
  sh(root, 'git', 'config', 'user.name', 't');
  sh(root, 'git', 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', 'base\n');
  for (const [p, c] of Object.entries(baseFiles)) write(root, p, c);
  sh(root, 'git', 'add', '-A');
  sh(root, 'git', 'commit', '-q', '-m', 'base');
  sh(root, 'git', 'checkout', '-q', '-b', 'feature');
  return root;
}
