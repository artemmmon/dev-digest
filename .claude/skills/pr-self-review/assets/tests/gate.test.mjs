import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentState, loadRouting, verdictPath } from '../lib.mjs';
import { evaluate, isGatedCommand, mentionsOverride } from '../gate-check.mjs';
import { buildVerdict } from '../write-verdict.mjs';
import { analyse } from '../collect-diff.mjs';
import { changedFiles, installedSkills } from '../lib.mjs';
import { makeRepo, sh, write } from './helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = join(HERE, '..', 'gate-check.mjs');
const routing = loadRouting();

function collect(root) {
  return analyse({ routing, root, change: changedFiles(routing, root), installed: installedSkills(root) });
}
function store(root, { findings = [], checks = [] } = {}) {
  const c = collect(root);
  const v = buildVerdict({ collect: c, checks, findings });
  const p = verdictPath(root, c.branch);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v));
  return v;
}
const critical = { severity: 'CRITICAL', file: 'server/src/modules/a/routes.ts', line: 3, rule: 'onion:no-db-in-routes', title: 'route queries the DB' };

test('command detection: gated commands, including compound ones; unrelated ones pass', () => {
  for (const c of ['git push', 'git push origin lesson-02', 'cd server && git push -u origin x', 'git -C . push', 'gh pr create --title x', 'FOO=1 gh pr merge 12', 'npm test; git push']) {
    assert.ok(isGatedCommand(c), c);
  }
  for (const c of ['git status', 'git log --oneline', 'echo git pushing', 'gh pr view 3', 'gh pr list', 'cat push.txt']) {
    assert.ok(!isGatedCommand(c), c);
  }
  assert.ok(mentionsOverride('PR_SELF_REVIEW_OVERRIDE="x" git push'));
  assert.ok(!mentionsOverride('git push'));
});

test('verdict: PASS with only warnings; BLOCK on a CRITICAL, a failed check, or a suspicious generated file', () => {
  const root = makeRepo();
  write(root, 'client/src/a.ts');
  const c = collect(root);
  assert.equal(buildVerdict({ collect: c, checks: [], findings: [{ ...critical, severity: 'WARNING' }] }).verdict, 'PASS');
  assert.equal(buildVerdict({ collect: c, checks: [], findings: [critical] }).verdict, 'BLOCK');
  assert.equal(buildVerdict({ collect: c, checks: [{ package: 'client', id: 'lint', cmd: 'pnpm lint', status: 'fail', exit_code: 1, output_tail: '' }], findings: [] }).verdict, 'BLOCK');
  assert.equal(buildVerdict({ collect: c, checks: [{ package: 'client', id: 'lint', cmd: 'x', status: 'error', exit_code: null, output_tail: 'no node_modules' }], findings: [] }).verdict, 'PASS', 'a check that could not run is reported, not blocking');
  write(root, 'client/pnpm-lock.yaml');
  assert.equal(buildVerdict({ collect: collect(root), checks: [], findings: [] }).verdict, 'BLOCK');
});

test('verdict: an unmapped skill counts as a WARNING and never blocks', () => {
  const root = makeRepo();
  write(root, '.claude/skills/brand-new/SKILL.md');
  const v = buildVerdict({ collect: collect(root), checks: [], findings: [] });
  assert.equal(v.verdict, 'PASS');
  assert.equal(v.counts.warning, 1);
  assert.deepEqual(v.unmapped_skills, ['brand-new']);
});

test('verdict: findings without file/line/rule are rejected', () => {
  const root = makeRepo();
  write(root, 'client/src/a.ts');
  const r = buildVerdict({ collect: collect(root), checks: [], findings: [{ severity: 'CRITICAL', title: 'vague' }] });
  assert.ok(r.error.length >= 3);
});

test('gate: empty diff is allowed; no verdict blocks', () => {
  const root = makeRepo();
  assert.equal(evaluate({ root, env: {} }).allow, true);
  write(root, 'client/src/a.ts');
  const r = evaluate({ root, env: {} });
  assert.equal(r.allow, false);
  assert.match(r.reason, /no verdict/);
});

test('gate: fresh PASS allows; committing the same content still allows; editing a file makes it stale', () => {
  const root = makeRepo();
  write(root, 'client/src/a.ts', '1\n');
  store(root);
  assert.equal(evaluate({ root, env: {} }).allow, true);
  sh(root, 'git', 'add', '-A');
  sh(root, 'git', 'commit', '-q', '-m', 'c');
  assert.equal(evaluate({ root, env: {} }).allow, true);
  write(root, 'client/src/a.ts', '2\n');
  const r = evaluate({ root, env: {} });
  assert.equal(r.allow, false);
  assert.match(r.reason, /stale/);
});

test('gate: BLOCK lists the criticals; override needs a reason, is recorded, and logged', () => {
  const root = makeRepo();
  write(root, 'server/src/modules/a/routes.ts');
  store(root, { findings: [critical] });
  const r = evaluate({ root, env: {} });
  assert.equal(r.allow, false);
  assert.match(r.reason, /routes\.ts:3 \[onion:no-db-in-routes\]/);
  assert.equal(evaluate({ root, env: { PR_SELF_REVIEW_OVERRIDE: '  ' } }).allow, false);
  const o = evaluate({ root, env: { PR_SELF_REVIEW_OVERRIDE: 'hotfix, reviewed by hand' } });
  assert.equal(o.allow, true);
  assert.equal(o.override, true);
  const stored = JSON.parse(readFileSync(verdictPath(root, 'feature'), 'utf8'));
  assert.equal(stored.override.reason, 'hotfix, reviewed by hand');
  assert.ok(existsSync(join(dirname(verdictPath(root, 'feature')), 'overrides.log')));
});

const hook = (root, command, extra = {}) =>
  spawnSync('node', [GATE, 'claude-hook'], { input: JSON.stringify({ tool_name: 'Bash', cwd: root, tool_input: { command } }), encoding: 'utf8', ...extra });

test('claude-hook: exit 2 + reason on a blocked push; exit 0 for unrelated commands and after PASS', () => {
  const root = makeRepo();
  write(root, 'client/src/a.ts');
  const blocked = hook(root, 'git push origin feature');
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /no verdict/);
  assert.equal(hook(root, 'git status').status, 0);
  store(root);
  assert.equal(hook(root, 'gh pr create --fill').status, 0);
});

test('claude-hook: an override in the command never bypasses — it asks a human', () => {
  const root = makeRepo();
  write(root, 'server/src/modules/a/routes.ts');
  store(root, { findings: [critical] });
  const r = hook(root, 'PR_SELF_REVIEW_OVERRIDE="agent says ok" git push');
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'ask');
});

test('git-hook: gates the checked-out branch, lets other refs and deletes through', () => {
  const root = makeRepo();
  write(root, 'client/src/a.ts');
  sh(root, 'git', 'add', '-A');
  sh(root, 'git', 'commit', '-q', '-m', 'c');
  const run = (input, env = {}) => spawnSync('node', [GATE, 'git-hook', 'origin', 'url'], { cwd: root, input, encoding: 'utf8', env: { ...process.env, ...env } });
  const sha = sh(root, 'git', 'rev-parse', 'HEAD').trim();
  assert.equal(run(`refs/heads/feature ${sha} refs/heads/feature ${'0'.repeat(40)}\n`).status, 1);
  assert.equal(run(`refs/heads/other ${sha} refs/heads/other ${'0'.repeat(40)}\n`).status, 0);
  assert.equal(run(`(delete) ${'0'.repeat(40)} refs/heads/feature ${sha}\n`).status, 0);
  assert.equal(run(`refs/heads/feature ${sha} refs/heads/feature ${'0'.repeat(40)}\n`, { PR_SELF_REVIEW_OVERRIDE: 'x' }).status, 1, 'override only matters once a BLOCK verdict exists');
  store(root);
  assert.equal(run(`refs/heads/feature ${sha} refs/heads/feature ${'0'.repeat(40)}\n`).status, 0);
});

test('currentState.diffHash equals the hash stored by collect-diff', () => {
  const root = makeRepo();
  write(root, 'client/src/a.ts');
  assert.equal(currentState(root, routing).diffHash, collect(root).diff_hash);
});

test('real `git push` through a pre-push hook: blocked without a verdict, passes after PASS, override works on BLOCK', () => {
  const root = makeRepo();
  const bare = mkdtempSync(join(tmpdir(), 'pr-self-review-remote-'));
  sh(bare, 'git', 'init', '-q', '--bare');
  sh(root, 'git', 'remote', 'add', 'origin', bare);
  const hookPath = join(root, '.git', 'hooks', 'pre-push');
  writeFileSync(hookPath, `#!/bin/sh\nexec node "${GATE}" git-hook "$@"\n`);
  chmodSync(hookPath, 0o755);
  write(root, 'server/src/modules/a/routes.ts');
  sh(root, 'git', 'add', '-A');
  sh(root, 'git', 'commit', '-q', '-m', 'c');
  const push = (env = {}) => spawnSync('git', ['push', '-q', 'origin', 'feature'], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });

  let r = push();
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no verdict/);

  store(root, { findings: [critical] });
  r = push();
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /BLOCK/);

  r = push({ PR_SELF_REVIEW_OVERRIDE: 'urgent fix' });
  assert.equal(r.status, 0, r.stderr);

  sh(root, 'git', 'checkout', '-q', '-b', 'second');
  write(root, 'client/src/b.ts');
  sh(root, 'git', 'add', '-A');
  sh(root, 'git', 'commit', '-q', '-m', 'd');
  store(root);
  r = spawnSync('git', ['push', '-q', 'origin', 'second'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
