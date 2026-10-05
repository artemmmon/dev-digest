// Tests for check-plan.mjs: a well-formed plan passes, and each rule catches its fault.
// The --implemented cases build a throw-away git repo: no network, no dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKER, checkImplemented, checkPlan, specIds, stepFiles, parsePlan } from '../check-plan.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '../check-plan.mjs');

const SPEC = [
  '# Spec: Probe', 'Spec ID: SPEC-10', 'Status: approved', 'Supersedes: none', 'Packages: server', 'Sources: user brief', '',
  '## User stories', '- US-1: As a dev, I want a probe, so that I can test.', '',
  '## Acceptance criteria (EARS)', '- AC-1 (US-1): WHEN asked, the system shall answer.', '- AC-2 (US-1): The system shall log.', '',
  '## Edge cases', '- EC-1: empty input → `—` (AC-1)', '',
  '## Non-functional requirements', '- NFR-1: answers within 2 s', '',
].join('\n');

const PLAN = [
  '# Development Plan: Probe', 'Status: draft', 'Save as: docs/plans/06-probe.md', 'Spec: specs/10-probe.md', 'Brainstorm: none',
  'Execution mode: multi-agent (chosen by the user)', '',
  '## Goal', 'A probe.', '',
  '## Step groups', '| Group | Steps |', '|---|---|', '| G1 | 1–2 |', '',
  '## Steps',
  '### Step 1 — service (server)',
  '- Files: create `server/src/probe.ts` · modify `server/src/app.ts`',
  '- Change: add the probe.',
  '- Covers: AC-1, EC-1',
  '- Tests (test-writer): `server/test/probe.test.ts`',
  '- Done when: typecheck passes.',
  '### Step 2 — log (server)',
  '- Files: modify `server/src/app.ts`',
  '- Change: log it.',
  '- Covers: AC-2, NFR-1',
  '- Done when: the log line appears.', '',
  '## Verification', '`./scripts/check-changed.sh`', '',
  '## Insights to record', '- `server/INSIGHTS.md` · Codebase Patterns — the probe', '',
  MARKER, '',
  '## Design notes', 'None.', '',
].join('\n');

function project(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-plan-'));
  const all = { 'specs/10-probe.md': SPEC, 'server/src/app.ts': 'export {};\n', 'server/INSIGHTS.md': '# Insights\n', ...files };
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}
const write = (root, path, content) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};
const git = (root, ...args) => assert.equal(spawnSync('git', args, { cwd: root }).status, 0, `git ${args.join(' ')}`);

const errors = (text, root = project()) => checkPlan(text, root).filter((p) => p.level === 'error').map((p) => p.message);
const has = (list, part) => assert.ok(list.some((m) => m.includes(part)), `no "${part}" in:\n${list.join('\n')}`);
const swap = (from, to) => {
  assert.ok(PLAN.includes(from), `fixture lost "${from}"`);
  return PLAN.replace(from, to);
};

test('a well-formed plan has no errors and no warnings', () => {
  assert.deepEqual(checkPlan(PLAN, project()), []);
});

test('header, marker and sections', () => {
  has(errors(swap('# Development Plan: Probe', '# Probe')), '# Development Plan: <title>');
  has(errors(swap('Status: draft', 'Status: done')), 'Status must be one of');
  has(errors(swap('Execution mode: multi-agent (chosen by the user)\n', '')), '"Execution mode:" is missing');
  has(errors(swap('multi-agent (chosen', 'swarm (chosen')), 'Execution mode must be');
  has(errors(swap(`${MARKER}\n`, '')), 'marker');
  has(errors(swap('## Verification\n`./scripts/check-changed.sh`\n\n', '')), '"## Verification" is missing');
  has(errors(PLAN.replace(`${MARKER}\n\n`, '').replace('## Verification', `${MARKER}\n\n## Verification`)), 'must be above the marker');
});

test('a long brief is a warning, not an error', () => {
  const long = swap('A probe.', 'x'.repeat(21_000));
  const problems = checkPlan(long, project());
  assert.deepEqual(problems.map((p) => p.level), ['warning']);
});

test('steps: fields, sequence and files', () => {
  has(errors(swap('- Change: log it.\n', '')), 'Step 2 has no "- Change:" line');
  has(errors(swap('- Done when: the log line appears.', '- Done when:')), 'Step 2 has no "- Done when:" line');
  has(errors(swap('### Step 2', '### Step 3')), 'out of sequence');
  has(errors(swap('modify `server/src/app.ts`\n- Change: log', 'modify `server/src/gone.ts`\n- Change: log')), '"server/src/gone.ts" (modify) does not exist');
  assert.deepEqual(errors(swap('modify `server/src/app.ts`\n- Change: log', 'modify `server/src/probe.ts`\n- Change: log')), []);
  has(errors(swap('create `server/src/probe.ts` · modify `server/src/app.ts`', 'modify `server/src/probe.ts`').replace('modify `server/src/app.ts`\n- Change: log', 'create `server/src/probe.ts`\n- Change: log')), 'Step 1: "server/src/probe.ts" (modify) does not exist');
  const exists = checkPlan(PLAN, project({ 'server/src/probe.ts': '' }));
  has(exists.filter((p) => p.level === 'warning').map((p) => p.message), 'already exists');
});

test('stepFiles reads verbs and skips what is not a repo path', () => {
  const plan = parsePlan(swap('create `server/src/probe.ts` · modify `server/src/app.ts`', 'create `server/src/a.ts`, `server/src/b.ts` · modify `@devdigest/shared`, `src/**/*.ts`, `app.ts`, `.github/workflows/ci.yml`'));
  assert.deepEqual(stepFiles(plan.steps[0]).map((f) => `${f.verb} ${f.path}`), ['create server/src/a.ts', 'create server/src/b.ts', 'modify .github/workflows/ci.yml']);
});

test('coverage: every spec id is cited, nothing else is, and the spec is approved', () => {
  assert.deepEqual(specIds(SPEC), ['AC-1', 'AC-2', 'EC-1', 'NFR-1']);
  has(errors(swap('- Covers: AC-2, NFR-1', '- Covers: AC-2')), 'no step cites NFR-1');
  has(errors(swap('- Covers: AC-2, NFR-1', '- Covers: AC-2, NFR-1, AC-9')), 'cites AC-9');
  has(errors(PLAN, project({ 'specs/10-probe.md': SPEC.replace('approved', 'draft') })), 'only for an approved spec');
  has(errors(swap('Spec: specs/10-probe.md', 'Spec: specs/11-gone.md')), 'does not exist');
  assert.deepEqual(errors(swap('Spec: specs/10-probe.md', 'Spec: none').replace(/- Covers:.*\n/g, '')), []);
  assert.deepEqual(errors(swap('Status: draft', 'Status: implemented'), project({ 'specs/10-probe.md': SPEC.replace('approved', 'implemented') })), []);
});

test('--implemented: statuses, files, insights, unplanned changes and test names', () => {
  const root = project({ 'docs/plans/06-probe.md': PLAN });
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '.');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'base');
  const done = PLAN.replace('Status: draft', 'Status: implemented');
  write(root, 'docs/plans/06-probe.md', done);
  write(root, 'specs/10-probe.md', SPEC.replace('approved', 'implemented'));
  write(root, 'server/src/probe.ts', 'export const probe = 1;\n');
  write(root, 'server/test/probe.test.ts', "it('AC-1: answers', () => {});\nit('EC-1: empty', () => {});\n");
  write(root, 'server/src/extra.ts', 'export {};\n');
  const lines = checkImplemented(done, root, 'docs/plans/06-probe.md', 'HEAD');
  const row = (id) => lines.filter((l) => l.id === id).map((l) => `${l.level} ${l.message}`);
  assert.match(row('P1')[0], /^PASS/);
  assert.match(row('P2')[0], /^PASS/);
  assert.match(row('S1.files')[0], /^FAIL server\/src\/app\.ts is unchanged/);
  assert.match(row('I1')[0], /^FAIL/);
  assert.deepEqual(row('unplanned-change'), ['FAIL server/src/extra.ts']);
  assert.match(row('AC-1')[0], /^INFO named by server\/test\/probe\.test\.ts:1/);
  assert.match(row('AC-2')[0], /no changed test names it/);

  const cli = spawnSync(process.execPath, [SCRIPT, '--root', root, join(root, 'docs/plans/06-probe.md'), '--implemented', '--base', 'HEAD'], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stdout, /FAIL unplanned-change\s+server\/src\/extra\.ts/);
});

test('--hook: errors come back on stderr with exit 2; other paths are ignored', () => {
  const root = project({ 'docs/plans/06-probe.md': PLAN.replace(`${MARKER}\n`, '') });
  const run = (file_path) =>
    spawnSync(process.execPath, [SCRIPT, '--hook'], {
      input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path } }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      encoding: 'utf8',
    });
  const bad = run('docs/plans/06-probe.md');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /marker/);
  assert.equal(run('server/src/app.ts').status, 0);
  assert.equal(run('docs/plans/06-probe.brainstorm.md').status, 0);
});

test('no plan path is a usage error', () => {
  assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status, 3);
});
