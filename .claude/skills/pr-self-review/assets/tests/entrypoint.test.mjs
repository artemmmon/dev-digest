import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRepo, write } from './helpers.mjs';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The scripts must run when reached through a symlinked directory whose path contains a space. */
function awkwardPath() {
  const dir = mkdtempSync(join(tmpdir(), 'pr self review '));
  mkdirSync(join(dir, 'sub dir'));
  symlinkSync(ASSETS, join(dir, 'sub dir', 'assets'));
  return join(dir, 'sub dir', 'assets');
}

test('collect-diff runs (and prints) through a symlink with a space in the path', () => {
  const root = makeRepo();
  write(root, 'client/src/a.ts');
  const r = spawnSync('node', [join(awkwardPath(), 'collect-diff.mjs'), '--summary'], { cwd: root, encoding: 'utf8' });
  // Exit 3 is fine here: the throw-away repo has none of the skills routing.json names. What matters is the output.
  assert.match(r.stdout, /scope: /, `printed nothing: ${r.stderr}`);
});

test('the gate does not fail open through such a path: no verdict still blocks', () => {
  const root = makeRepo();
  write(root, 'client/src/a.ts');
  const r = spawnSync('node', [join(awkwardPath(), 'gate-check.mjs'), 'status'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 1, `expected BLOCK, got: ${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /no verdict/);
});

test('the Claude hook blocks a bare `bash -c` push (no filter in settings.json to skip it)', () => {
  const root = makeRepo();
  write(root, 'client/src/a.ts');
  const r = spawnSync('node', [join(awkwardPath(), 'gate-check.mjs'), 'claude-hook'], {
    input: JSON.stringify({ tool_name: 'Bash', cwd: root, tool_input: { command: 'bash -c "git push origin x"' } }),
    encoding: 'utf8',
  });
  assert.equal(r.status, 2);
});
