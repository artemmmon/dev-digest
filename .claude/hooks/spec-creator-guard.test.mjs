// Tests for spec-creator-guard.mjs: each case feeds one PreToolUse payload to the hook in a
// throw-away project dir and checks the exit code (0 = allow, 2 = block).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUARD = join(dirname(fileURLToPath(import.meta.url)), 'spec-creator-guard.mjs');
const DRAFT = '# Spec: Probe\nSpec ID: SPEC-10\nStatus: draft\n\n## Problem and user\nText.\n';

function project(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'spec-guard-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function run(root, tool_name, tool_input = {}) {
  const result = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name, tool_input }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
  return { code: result.status, stderr: result.stderr };
}

const allowed = (r) => assert.equal(r.code, 0, r.stderr);
const blocked = (r) => assert.equal(r.code, 2, 'expected the guard to block');

test('tools other than Write, Edit, Agent and MCP are not this hook\'s business', () => {
  const root = project();
  for (const tool of ['Read', 'Grep', 'Skill', 'SubagentHandback', 'SendMessage', '']) allowed(run(root, tool));
});

test('Agent: only the researcher may be started', () => {
  const root = project();
  allowed(run(root, 'Agent', { subagent_type: 'researcher', prompt: 'q' }));
  allowed(run(root, 'Task', { subagent_type: 'researcher', prompt: 'q' }));
  blocked(run(root, 'Agent', { subagent_type: 'implementer', prompt: 'q' }));
  blocked(run(root, 'Agent', { subagent_type: 'general-purpose', prompt: 'q' }));
  blocked(run(root, 'Agent', { subagent_type: 'fork', prompt: 'q' }));
  blocked(run(root, 'Agent', { prompt: 'q' }));
});

test('MCP: only Figma get_* tools pass', () => {
  const root = project();
  allowed(run(root, 'mcp__plugin_design_figma__get_design_context'));
  blocked(run(root, 'mcp__plugin_design_figma__authenticate'));
  blocked(run(root, 'mcp__claude_ai_Claude_Docs__batch'));
});

test('Write: a draft spec in a spec folder passes, anything else is blocked', () => {
  const root = project({ 'specs/README.md': '# Specs\n', 'server/src/a.ts': '' });
  allowed(run(root, 'Write', { file_path: 'specs/10-probe.md', content: DRAFT }));
  allowed(run(root, 'Write', { file_path: 'client/specs/10-probe.md', content: DRAFT }));
  allowed(run(root, 'Write', { file_path: 'specs/README.md', content: '# Specs\n- new line\n' }));
  blocked(run(root, 'Write', { file_path: 'server/src/a.ts', content: DRAFT }));
  blocked(run(root, 'Write', { file_path: 'docs/plans/10-probe.md', content: DRAFT }));
  blocked(run(root, 'Write', { file_path: 'specs/nested/10-probe.md', content: DRAFT }));
  blocked(run(root, 'Write', { file_path: 'specs/10-probe.txt', content: DRAFT }));
  blocked(run(root, 'Write', { file_path: 'specs/10-probe.md', content: DRAFT.replace('draft', 'approved') }));
  blocked(run(root, 'Write', { file_path: 'specs/10-probe.md', content: '# Spec: no status\n' }));
});

test('Write and Edit: implemented and legacy specs are read-only', () => {
  const root = project({
    'specs/09-legacy.md': '# Legacy\nStatus: done\n',
    'specs/08-legacy-approved.md': '# Legacy\nStatus: approved\n',
    'specs/10-implemented.md': DRAFT.replace('draft', 'implemented'),
  });
  blocked(run(root, 'Write', { file_path: 'specs/10-implemented.md', content: DRAFT }));
  blocked(run(root, 'Edit', { file_path: 'specs/10-implemented.md', old_string: 'implemented', new_string: 'draft' }));
  blocked(run(root, 'Edit', { file_path: 'specs/09-legacy.md', old_string: 'Legacy', new_string: 'New' }));
  blocked(run(root, 'Edit', { file_path: 'specs/08-legacy-approved.md', old_string: 'approved', new_string: 'draft' }));
});

test('amendment: an approved spec can only be changed by reopening it as a draft', () => {
  const root = project({ 'specs/10-approved.md': DRAFT.replace('draft', 'approved') });
  const edit = (old_string, new_string) => run(root, 'Edit', { file_path: 'specs/10-approved.md', old_string, new_string });
  blocked(edit('Text.', 'Better text.'));
  blocked(run(root, 'Write', { file_path: 'specs/10-approved.md', content: DRAFT.replace('draft', 'approved') }));
  allowed(edit('Status: approved', 'Status: draft\nAmended: 2026-10-04 — AC-9 added'));
  allowed(run(root, 'Write', { file_path: 'specs/10-approved.md', content: DRAFT }));
});

test('Edit: the status cannot change, whatever part of the line is replaced', () => {
  const root = project({ 'specs/10-probe.md': DRAFT });
  const edit = (old_string, new_string, extra = {}) =>
    run(root, 'Edit', { file_path: 'specs/10-probe.md', old_string, new_string, ...extra });
  allowed(edit('Text.', 'Better text.'));
  blocked(edit('Status: draft', 'Status: approved'));
  blocked(edit('draft', 'approved'));
  blocked(edit('draft', 'approved', { replace_all: true }));
  blocked(edit('Status: draft\n', ''));
  blocked(edit('Spec ID: SPEC-10\n', 'Spec ID: SPEC-10\nStatus: approved\n'));
});

test('a symlink cannot lead a write out of the spec folders', () => {
  const root = project({ 'specs/README.md': '# Specs\n', 'server/src/a.ts': '' });
  symlinkSync(join(root, 'server/src/a.ts'), join(root, 'specs/10-link.md'));
  blocked(run(root, 'Write', { file_path: 'specs/10-link.md', content: DRAFT }));
});
