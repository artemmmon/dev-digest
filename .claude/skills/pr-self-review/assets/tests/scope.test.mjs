import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changedFiles, currentState, installedSkills, loadRouting } from '../lib.mjs';
import { analyse } from '../collect-diff.mjs';
import { evaluate } from '../gate-check.mjs';
import { makeRepo, sh, write } from './helpers.mjs';

const routing = loadRouting();
const run = (root, base) =>
  analyse({ routing, root, change: changedFiles(routing, root, base), installed: installedSkills(root) });

/** A repo whose `feature` branch is already on a bare remote (upstream set). */
function repoWithUpstream() {
  const root = makeRepo();
  write(root, 'client/src/pushed.ts');
  sh(root, 'git', 'add', '-A');
  sh(root, 'git', 'commit', '-q', '-m', 'already on the remote');
  const bare = mkdtempSync(join(tmpdir(), 'pr-self-review-remote-'));
  sh(bare, 'git', 'init', '-q', '--bare');
  sh(root, 'git', 'remote', 'add', 'origin', bare);
  sh(root, 'git', 'push', '-q', '-u', 'origin', 'feature');
  return root;
}

test('scope: a branch that was never pushed is reviewed as the whole pull request', () => {
  const root = makeRepo();
  write(root, 'client/src/a.ts');
  const r = run(root);
  assert.equal(r.scope, 'pull-request');
  assert.equal(r.base, 'main');
});

test('scope: a branch with an upstream is reviewed only for what the remote does not have', () => {
  const root = repoWithUpstream();
  assert.equal(run(root).empty, true, 'nothing unpushed yet');

  write(root, 'client/src/new.ts');
  sh(root, 'git', 'add', '-A');
  sh(root, 'git', 'commit', '-q', '-m', 'unpushed');
  write(root, 'client/src/wip.ts');
  const r = run(root);
  assert.equal(r.scope, 'unpushed');
  assert.equal(r.base, 'origin/feature');
  assert.deepEqual(r.files.map((f) => f.path), ['client/src/new.ts', 'client/src/wip.ts']);
});

test('scope: an explicit base wins, and a missing one is an error', () => {
  const root = repoWithUpstream();
  const r = run(root, 'main');
  assert.equal(r.scope, 'custom');
  assert.deepEqual(r.files.map((f) => f.path), ['client/src/pushed.ts']);
  assert.throws(() => run(root, 'no-such-ref'), /does not exist/);
});

test('scope: an upstream whose remote branch is gone falls back to the whole pull request', () => {
  const root = repoWithUpstream();
  sh(root, 'git', 'update-ref', '-d', 'refs/remotes/origin/feature');
  const r = run(root);
  assert.equal(r.scope, 'pull-request');
  assert.deepEqual(r.files.map((f) => f.path), ['client/src/pushed.ts']);
});

test('gate: nothing unpushed is allowed; unpushed work needs a verdict for exactly that scope', () => {
  const root = repoWithUpstream();
  assert.equal(evaluate({ root, env: {} }).allow, true);
  write(root, 'client/src/new.ts');
  const r = evaluate({ root, env: {} });
  assert.equal(r.allow, false);
  assert.match(r.reason, /no verdict/);
  assert.equal(currentState(root, routing).scope, 'unpushed');
});
