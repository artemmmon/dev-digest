// Tests for plans-guard.mjs: each case feeds one PreToolUse payload to the hook in a
// throw-away project dir and checks the exit code (0 = allow, 2 = block).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUARD = join(dirname(fileURLToPath(import.meta.url)), 'plans-guard.mjs');
const PLAN = '# Development Plan: Probe\nStatus: draft\n\n## Goal\nText.\n';
const BRIEF = '# Brainstorm: Probe\nStatus: awaiting choice\n\n## Problem\nText.\n';

function project(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'plans-guard-'));
  mkdirSync(join(root, 'docs/plans'), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function run(root, kind, tool_name, tool_input = {}) {
  const result = spawnSync(process.execPath, [GUARD, ...(kind ? ['--kind', kind] : [])], {
    input: JSON.stringify({ tool_name, tool_input }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  return { code: result.status, stderr: result.stderr };
}

const allowed = (r) => assert.equal(r.code, 0, r.stderr);
const blocked = (r) => assert.equal(r.code, 2, 'expected the guard to block');

test('a missing or unknown --kind blocks', () => {
  const root = project();
  blocked(run(root, null, 'Write', { file_path: 'docs/plans/06-probe.md', content: PLAN }));
  blocked(run(root, 'spec', 'Write', { file_path: 'docs/plans/06-probe.md', content: PLAN }));
});

test('tools other than Write and Edit are not this hook\'s business', () => {
  allowed(run(project(), 'plan', 'Read', { file_path: 'server/src/a.ts' }));
});

test('plan: only a draft docs/plans/NN-name.md passes', () => {
  const root = project({ 'server/src/a.ts': '' });
  allowed(run(root, 'plan', 'Write', { file_path: 'docs/plans/06-probe.md', content: PLAN }));
  blocked(run(root, 'plan', 'Write', { file_path: 'docs/plans/06-probe.brainstorm.md', content: PLAN }));
  blocked(run(root, 'plan', 'Write', { file_path: 'docs/plans/probe.md', content: PLAN }));
  blocked(run(root, 'plan', 'Write', { file_path: 'docs/plans/nested/06-probe.md', content: PLAN }));
  blocked(run(root, 'plan', 'Write', { file_path: 'docs/06-probe.md', content: PLAN }));
  blocked(run(root, 'plan', 'Write', { file_path: 'specs/10-probe.md', content: PLAN }));
  blocked(run(root, 'plan', 'Write', { file_path: 'server/src/a.ts', content: PLAN }));
  blocked(run(root, 'plan', 'Write', { file_path: 'docs/plans/06-probe.md', content: PLAN.replace('draft', 'approved') }));
  blocked(run(root, 'plan', 'Write', { file_path: 'docs/plans/06-probe.md', content: '# Development Plan: no status\n' }));
});

test('plan: an approved or running plan is read-only, and an Edit cannot change the status', () => {
  const root = project({
    'docs/plans/06-draft.md': PLAN,
    'docs/plans/07-approved.md': PLAN.replace('draft', 'approved'),
    'docs/plans/08-running.md': PLAN.replace('draft', 'in progress'),
  });
  const edit = (file, old_string, new_string) => run(root, 'plan', 'Edit', { file_path: `docs/plans/${file}`, old_string, new_string });
  allowed(edit('06-draft.md', 'Text.', 'Better text.'));
  blocked(edit('06-draft.md', 'draft', 'approved'));
  blocked(edit('06-draft.md', 'Status: draft\n', ''));
  blocked(edit('07-approved.md', 'Text.', 'Better text.'));
  blocked(edit('08-running.md', 'in progress', 'draft'));
});

test('brainstorm: only an awaiting-choice brief passes', () => {
  const root = project({ 'docs/plans/05-chosen.brainstorm.md': BRIEF.replace('awaiting choice', 'chosen: option 2') });
  allowed(run(root, 'brainstorm', 'Write', { file_path: 'docs/plans/06-probe.brainstorm.md', content: BRIEF }));
  blocked(run(root, 'brainstorm', 'Write', { file_path: 'docs/plans/06-probe.md', content: BRIEF }));
  blocked(run(root, 'brainstorm', 'Write', { file_path: 'docs/plans/06-probe.brainstorm.md', content: BRIEF.replace('awaiting choice', 'chosen: option 1') }));
  blocked(run(root, 'brainstorm', 'Edit', { file_path: 'docs/plans/05-chosen.brainstorm.md', old_string: 'Text.', new_string: 'New.' }));
});

test('a symlink cannot lead a write out of docs/plans', () => {
  const root = project({ 'server/src/a.ts': '' });
  symlinkSync(join(root, 'server/src/a.ts'), join(root, 'docs/plans/06-link.md'));
  blocked(run(root, 'plan', 'Write', { file_path: 'docs/plans/06-link.md', content: PLAN }));
});
