import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globToRegExp, loadRouting, changedFiles, installedSkills } from '../lib.mjs';
import { analyse } from '../collect-diff.mjs';
import { makeRepo, sh, write } from './helpers.mjs';

const routing = loadRouting();
const run = (root) => analyse({ routing, root, change: changedFiles(routing, root), installed: installedSkills(root) });

test('glob: ** crosses directories, * does not, {a,b} alternates', () => {
  assert.ok(globToRegExp('client/src/**/*.{ts,tsx}').test('client/src/app/a/B.tsx'));
  assert.ok(globToRegExp('client/src/**/*.{ts,tsx}').test('client/src/x.ts'));
  assert.ok(!globToRegExp('client/src/*.ts').test('client/src/a/x.ts'));
  assert.ok(globToRegExp('**/node_modules/**').test('server/node_modules/a/b.js'));
  assert.ok(!globToRegExp('client/src/**/*.ts').test('client/src/x.tsx'));
});

test('routing.json: every rule has at least one skill and unique id', () => {
  const ids = routing.rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const r of routing.rules) assert.ok(r.skills.length > 0, r.id);
});

test('UI-only change routes to frontend skills, never to backend skills', () => {
  const root = makeRepo();
  write(root, 'client/src/app/repos/page.tsx');
  write(root, 'client/src/app/repos/_components/List/List.tsx');
  write(root, 'client/messages/en/repos.json', '{}\n');
  const r = run(root);
  assert.deepEqual(Object.keys(r.skill_groups).sort(), ['frontend-architecture', 'next-best-practices', 'react-best-practices', 'security']);
  assert.ok(r.skill_groups['next-best-practices'].files.includes('client/src/app/repos/page.tsx'));
  assert.ok(!('onion-architecture' in r.skill_groups));
  assert.ok(!('fastify-best-practices' in r.skill_groups));
  assert.deepEqual(r.packages, ['client']);
});

test('backend change routes to onion + fastify; repository also to drizzle', () => {
  const root = makeRepo();
  write(root, 'server/src/modules/pulls/service.ts');
  write(root, 'server/src/modules/pulls/repository.ts');
  const r = run(root);
  assert.deepEqual(r.skill_groups['onion-architecture'].files, ['server/src/modules/pulls/repository.ts', 'server/src/modules/pulls/service.ts']);
  assert.deepEqual(r.skill_groups['drizzle-orm-patterns'].files, ['server/src/modules/pulls/repository.ts']);
  assert.ok(!('frontend-architecture' in r.skill_groups));
});

test('tests get the testing skill only, not the architecture skills', () => {
  const root = makeRepo();
  write(root, 'client/src/app/x/Foo.test.tsx');
  const r = run(root);
  assert.deepEqual(Object.keys(r.skill_groups), ['react-testing-library']);
});

test('excluded paths never appear; untracked and unstaged files do', () => {
  const root = makeRepo({ 'server/src/modules/a/service.ts': 'a\n' });
  write(root, 'server/clones/repo/big.ts');
  write(root, 'temp/notes.md');
  write(root, 'server/src/modules/a/service.ts', 'changed\n');
  write(root, 'server/src/modules/a/new.ts');
  const r = run(root);
  assert.deepEqual(r.files.map((f) => f.path), ['server/src/modules/a/new.ts', 'server/src/modules/a/service.ts']);
});

test('committed + uncommitted changes are both in the change set; empty when nothing changed', () => {
  const root = makeRepo();
  assert.equal(run(root).empty, true);
  write(root, 'client/src/a.ts');
  sh(root, 'git', 'add', '-A');
  sh(root, 'git', 'commit', '-q', '-m', 'c');
  write(root, 'client/src/b.ts');
  const r = run(root);
  assert.deepEqual(r.files.map((f) => f.path), ['client/src/a.ts', 'client/src/b.ts']);
});

test('diff_hash is stable across commit, changes on any content edit', () => {
  const root = makeRepo();
  write(root, 'client/src/a.ts', '1\n');
  const before = run(root).diff_hash;
  sh(root, 'git', 'add', '-A');
  sh(root, 'git', 'commit', '-q', '-m', 'c');
  assert.equal(run(root).diff_hash, before, 'committing the same content keeps the hash');
  write(root, 'client/src/a.ts', '2\n');
  assert.notEqual(run(root).diff_hash, before);
});

test('unrouted files land in correctness_only', () => {
  const root = makeRepo();
  write(root, 'e2e/specs/01.flow.json', '{}\n');
  const r = run(root);
  assert.deepEqual(r.correctness_only, ['e2e/specs/01.flow.json']);
});

test('generated files: hand-edited migration and lock file are suspicious, regenerated ones are not', () => {
  const root = makeRepo();
  write(root, 'server/src/db/migrations/0009_x.sql');
  write(root, 'client/pnpm-lock.yaml');
  let r = run(root);
  assert.equal(r.suspicious_generated.length, 2);
  assert.equal(r.skill_groups['zod'], undefined);

  write(root, 'server/src/db/schema.ts');
  write(root, 'server/src/db/migrations/meta/_journal.json');
  write(root, 'client/package.json');
  r = run(root);
  assert.deepEqual(r.suspicious_generated, []);
});

test('checks: only touched packages; reviewer-core pulls in the server; vendor/shared adds the contracts check', () => {
  const root = makeRepo();
  write(root, 'reviewer-core/src/a.ts');
  let r = run(root);
  assert.deepEqual(r.packages, ['reviewer-core', 'server']);
  assert.ok(!r.checks.some((c) => c.package === 'client'));

  write(root, 'client/src/vendor/shared/x.ts');
  r = run(root);
  assert.ok(r.checks.some((c) => c.id === 'shared-contracts'));
});

test('skill drift: an installed skill that routing does not know is reported', () => {
  const root = makeRepo();
  write(root, '.claude/skills/brand-new/SKILL.md');
  write(root, '.claude/skills/zod/SKILL.md');
  const r = run(root);
  assert.deepEqual(r.unmapped_skills, ['brand-new']);
  assert.ok(r.missing_skills.includes('frontend-architecture'), 'routing names skills that are not installed here');
  assert.deepEqual(r.skills_touched, ['brand-new', 'zod']);
});

test('reviewable = added/modified non-generated files: what the correctness reviewer reads', () => {
  const root = makeRepo({ 'client/src/gone.ts': 'x\n' });
  write(root, 'client/src/a.ts');
  write(root, 'client/pnpm-lock.yaml');
  sh(root, 'git', 'rm', '-q', 'client/src/gone.ts');
  const r = run(root);
  assert.deepEqual(r.reviewable, ['client/src/a.ts']);
  assert.deepEqual(r.deleted, ['client/src/gone.ts']);
});
