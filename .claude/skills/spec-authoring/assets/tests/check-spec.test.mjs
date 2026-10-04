// Tests for check-spec.mjs: the worked example must pass, and each rule must catch its fault.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSpec } from '../check-spec.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '../check-spec.mjs');
const EXAMPLE = readFileSync(join(here, '../../references/example-spec.md'), 'utf8');
const NAME = '00-run-cost-badge.md';

const errors = (text, name = NAME) => checkSpec(text, name).filter((p) => p.level === 'error').map((p) => p.message);
const warnings = (text) => checkSpec(text, NAME).filter((p) => p.level === 'warning').map((p) => p.message);
const has = (list, part) => assert.ok(list.some((m) => m.includes(part)), `no "${part}" in:\n${list.join('\n')}`);
const swap = (from, to) => {
  assert.ok(EXAMPLE.includes(from), `fixture lost "${from}"`);
  return EXAMPLE.replace(from, to);
};

test('the worked example has no errors and no warnings', () => {
  assert.deepEqual(checkSpec(EXAMPLE, NAME), []);
});

test('header: title, fields, status and file name', () => {
  has(errors(swap('# Spec: Run Cost Badge', '# Run Cost Badge')), '# Spec: <feature name>');
  has(errors(swap('Packages: server, client\n', '')), '"Packages:" is missing');
  has(errors(swap('Status: draft', 'Status: done')), 'Status must be one of');
  has(errors(EXAMPLE, '10-run-cost-badge.md'), 'does not match the file number');
  has(errors(EXAMPLE, 'RunCostBadge.md'), 'kebab-case');
});

test('sections: missing, empty, unknown', () => {
  has(errors(swap('## Untrusted inputs\nNone.\n', '')), '"## Untrusted inputs" is missing');
  has(errors(swap('## Untrusted inputs\nNone.\n', '## Untrusted inputs\n')), 'is empty');
  has(errors(swap('## Edge cases', '## Design\nText.\n\n## Edge cases')), 'not in the template');
});

test('user stories: shape and coverage', () => {
  has(errors(swap('As a developer, I want to see what each agent run cost,', 'Show the cost of each agent run,')), 'US-1 must read');
  has(errors(swap('- AC-4 (US-2)', '- AC-4 (US-1)').replace('- AC-5 (US-2)', '- AC-5 (US-1)').split('(US-1, US-2)').join('(US-1)')), 'US-2 has no acceptance criterion');
});

test('acceptance criteria: EARS shape, one shall, story reference', () => {
  has(errors(swap('WHEN an agent run completes, the server shall store', 'When an agent run completes, the server shall store')), 'keyword in capitals');
  has(errors(swap('WHEN an agent run completes, the server shall store', 'The server stores, when a run completes,')), '0 "shall"');
  has(errors(swap('the server shall store', 'the server shall validate and shall store')), '2 "shall"');
  has(errors(swap('WHEN an agent run completes, the server shall store', 'the server shall, WHEN a run completes, store')), 'no EARS pattern');
  has(errors(swap('- AC-1 (US-1): WHEN', '- AC-1: WHEN')), 'must name the stories');
  has(errors(swap('- AC-1 (US-1): WHEN', '- AC-1 (US-9): WHEN')), 'US-9, which does not exist');
  has(errors(swap('- AC-3 (US-1)', '- AC-2 (US-1)')), 'AC-2 is used twice');
});

test('acceptance criteria: vague words and compound responses are warnings', () => {
  has(warnings(swap('the server shall store the run\'s cost', 'the server shall quickly store the run\'s cost')), '"quickly" is not checkable');
  has(warnings(swap('the client shall show `—` in place of the cost', 'the client shall show `—` and hide the token count')), 'one response per criterion');
});

test('edge cases: arrow and a covering criterion that exists', () => {
  has(errors(swap('→ `—`, never `$0.00` (AC-3)', '→ `—`, never `$0.00`')), 'names no criterion');
  has(errors(swap('→ `—` in the list (AC-5)', '→ `—` in the list (AC-9)')), 'AC-9, which does not exist');
  has(errors(swap('a second review of the same pull request →', 'a second review of the same pull request:')), 'EC-3 must read');
});

test('inputs: one provenance tag, and a reason for every new call', () => {
  has(errors(swap('[deterministic: reviews]', 'computed')), 'exactly one provenance tag');
  has(errors(swap('| [deterministic: reviews] | Runs started by one review request |', '| [new: 1 LLM call] | |')), 'why nothing existing can serve');
  assert.deepEqual(errors(swap('| [deterministic: reviews] |', '| [new: 2 LLM calls] |')), []);
});

test('untrusted inputs and open questions', () => {
  has(errors(swap('## Untrusted inputs\nNone.', '## Untrusted inputs\n| Input | Who controls it | Where it goes | Required handling |\n|---|---|---|---|\n| PR title | PR author | UI | |')), 'all four cells');
  has(errors(swap(' — default if unanswered:\n  no; a failed run shows no cost.', '')), 'default if unanswered');
});

test('what, not how: a code path in the body is an error, a diagram is not scanned', () => {
  has(errors(swap('Already returned per run', 'See `server/src/modules/pulls/cost.ts`')), 'is a code path');
  assert.deepEqual(errors(swap('  UI->>API: start review (one request)', '  UI->>API: shall shall src/a/b.ts')), []);
});

test('CLI: scans the spec folders, skips legacy specs, exits 1 on errors', () => {
  const root = mkdtempSync(join(tmpdir(), 'spec-check-'));
  mkdirSync(join(root, 'specs'));
  mkdirSync(join(root, 'client/specs'), { recursive: true });
  writeFileSync(join(root, 'specs/README.md'), '# Specs\n');
  writeFileSync(join(root, 'specs/01-legacy.md'), '# Legacy\nStatus: done\n');
  writeFileSync(join(root, 'specs/00-run-cost-badge.md'), EXAMPLE);
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });

  let result = run();
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /1 spec\(s\), 0 error\(s\)/);

  writeFileSync(join(root, 'client/specs/00-run-cost-badge.md'), EXAMPLE);
  result = run();
  assert.equal(result.status, 1);
  assert.match(result.stdout, /SPEC-00 is also used by/);
});

test('CLI: every spec path given is checked, with or without --root', () => {
  const root = mkdtempSync(join(tmpdir(), 'spec-check-'));
  const good = join(root, '00-run-cost-badge.md');
  const broken = join(root, '00-broken.md');
  writeFileSync(good, EXAMPLE);
  writeFileSync(broken, EXAMPLE.replace('Status: draft\n', ''));
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

  // A path as the first argument used to be dropped when --root was absent.
  let result = run(broken);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /"Status:" is missing/);
  assert.match(result.stdout, /1 spec\(s\), 1 error\(s\)/);

  result = run(broken, good);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /2 spec\(s\)/);

  result = run(good);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /1 spec\(s\), 0 error\(s\)/);

  result = run('--root', root, broken);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /1 spec\(s\), 1 error\(s\)/);
});

test('hook mode: exit 2 with the errors on stderr, silent on a clean spec or another file', () => {
  const root = mkdtempSync(join(tmpdir(), 'spec-check-'));
  mkdirSync(join(root, 'specs'));
  writeFileSync(join(root, 'specs/00-run-cost-badge.md'), EXAMPLE);
  writeFileSync(join(root, 'specs/00-broken.md'), EXAMPLE.replace('Status: draft\n', ''));
  writeFileSync(join(root, 'specs/README.md'), '# Specs\n');
  const hook = (file_path) =>
    spawnSync(process.execPath, [SCRIPT, '--hook'], {
      input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path } }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      encoding: 'utf8',
    });

  assert.equal(hook('specs/00-run-cost-badge.md').status, 0);
  assert.equal(hook('specs/README.md').status, 0);
  const broken = hook('specs/00-broken.md');
  assert.equal(broken.status, 2);
  assert.match(broken.stderr, /"Status:" is missing/);
});
