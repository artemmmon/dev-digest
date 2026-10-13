// dep-report.mjs and make-fixture.mjs on throw-away repos: no network, no installs.
//   node --test .claude/skills/dependency-checker/assets/tests/*.test.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORT = join(HERE, '..', 'dep-report.mjs');
const FIXTURE = join(HERE, '..', '..', 'evals', 'setup', 'make-fixture.mjs');

const tmp = mkdtempSync(join(tmpdir(), 'dep-checker-test-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

const run = (script, args, opts = {}) => spawnSync('node', [script, ...args], { encoding: 'utf8', ...opts });
const report = (root, ...flags) => {
  const r = run(REPORT, ['--root', root, '--format', 'json', ...flags]);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

test('--packages narrows the report, not the discovery: the relative import still resolves to its package', () => {
  const dest = join(tmp, 'mini');
  const made = run(FIXTURE, [dest, '--no-modules']);
  assert.equal(made.status, 0, made.stderr);

  const wide = report(dest);
  const narrow = report(dest, '--packages', 'server');
  assert.deepEqual(narrow.packages.map((p) => p.dir), ['server']);

  const toOf = (r) => r.violations.filter((v) => v.from === 'server').map((v) => v.to);
  assert.ok(toOf(wide).includes('reviewer-core'), 'the fixture plants a relative import into reviewer-core');
  assert.deepEqual(toOf(narrow), toOf(wide), 'the target must not become null when reviewer-core is not analysed');
});

test('--packages with a name that matches nothing is an error that lists the packages', () => {
  const r = run(REPORT, ['--root', join(tmp, 'mini'), '--packages', 'nope']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /matched none of: .*server/);
});

test('a file at the package root that is not config counts as source', () => {
  const root = join(tmp, 'rootsrc');
  mkdirSync(join(root, 'app'), { recursive: true });
  writeFileSync(join(root, 'app', 'package.json'), JSON.stringify({ name: 'app', dependencies: { leftpad: '^1.0.0' } }));
  writeFileSync(join(root, 'app', 'server.mjs'), "import leftpad from 'leftpad';\nconsole.log(leftpad);\n");
  const entry = report(root).packages[0].entries.find((e) => e.name === 'leftpad');
  assert.equal(entry.refs.src, 1, 'an entry point at the root is runtime code');
});

test('make-fixture refuses a non-empty folder it did not make, and the working directory', () => {
  const foreign = join(tmp, 'foreign');
  mkdirSync(foreign);
  writeFileSync(join(foreign, 'precious.txt'), 'keep me');
  const r = run(FIXTURE, [foreign, '--no-modules']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /refusing to delete/);
  assert.deepEqual(readdirSync(foreign), ['precious.txt']);

  const here = run(FIXTURE, ['.', '--no-modules'], { cwd: foreign });
  assert.equal(here.status, 2);
  assert.deepEqual(readdirSync(foreign), ['precious.txt']);
});

test('make-fixture rebuilds its own folder, and takes the destination as the first non-flag argument', () => {
  const dest = join(tmp, 'again');
  assert.equal(run(FIXTURE, ['--no-modules', dest]).status, 0);
  assert.equal(run(FIXTURE, [dest, '--no-modules']).status, 0, 'a fixture it made is rebuilt without --force');
});

test('a major mismatch is not hidden when only one side is installed', () => {
  const root = join(tmp, 'drift');
  for (const [name, range] of [['a', '^3.23.0'], ['b', '^4.0.0']]) {
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(join(root, name, 'package.json'), JSON.stringify({ name, dependencies: { zod: range } }));
  }
  // `a` is installed at 3.23.8, `b` is not installed at all.
  const mod = join(root, 'a', 'node_modules', 'zod');
  mkdirSync(mod, { recursive: true });
  writeFileSync(join(mod, 'package.json'), JSON.stringify({ name: 'zod', version: '3.23.8' }));
  const drift = report(root).drift.find((d) => d.name === 'zod');
  assert.equal(drift.kind, 'major');
});
