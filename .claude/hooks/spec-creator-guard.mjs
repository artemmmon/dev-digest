#!/usr/bin/env node
// PreToolUse guard for the spec-creator agent (.claude/agents/spec-creator.md).
// Exit 0 = allow, exit 2 = block (stderr goes back to the agent).
//
// Default-deny: the agent declares `disallowedTools`, not a `tools` allowlist (it must keep Figma
// read tools reachable), so every tool the session has would otherwise be open to it.
// Allows:
//   - the read-only tools in READ_ONLY_TOOLS;
//   - the Agent tool only to start a `researcher` (read-only, one question each);
//   - Write/Edit of `specs/*.md` and `<package>/specs/*.md` only;
//   - spec files only while they are `Status: draft`, before and after the change
//     (approval is the user's);
//   - one exception, the amendment: an `approved` spec may be changed when the change itself
//     turns it back into `Status: draft`, so the user approves it again. Implemented and legacy
//     specs stay read-only;
//   - MCP calls only to Figma read tools (`get_*`).
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

const PACKAGES = ['server', 'client', 'reviewer-core', 'e2e', 'mcp'];
const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob', 'Skill', 'ToolSearch', 'TodoWrite'];
// The subagent tool is `Agent`; older builds call it `Task`.
const AGENT_TOOLS = ['Agent', 'Task'];
const RESEARCH_AGENT = 'researcher';
const STATUS_LINES = /^Status:[ \t]*(.*)$/gm;

function block(reason) {
  process.stderr.write(`spec-creator guard: ${reason}\n`);
  process.exit(2);
}

// Resolves symlinks on the deepest existing ancestor, so a link cannot lead a write out of specs/.
function realPath(target) {
  let existing = target;
  const tail = [];
  while (!existsSync(existing)) {
    tail.unshift(basename(existing));
    const parent = dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  return join(realpathSync(existing), ...tail);
}

// Every `Status:` line must say the same thing, so a second line cannot hide another status.
function hasStatus(text, wanted) {
  const statuses = [...text.matchAll(STATUS_LINES)].map((match) => match[1].trim());
  return statuses.length > 0 && statuses.every((status) => status === wanted);
}
const isDraft = (text) => hasStatus(text, 'draft');
// Only a current-template spec (`Spec ID:`) can be reopened; legacy specs have other statuses.
const isReopenable = (text) => hasStatus(text, 'approved') && /^Spec ID:/m.test(text);

// The file as the Edit tool would leave it; null when the edit cannot apply (the tool will fail).
function afterEdit(text, args) {
  const from = String(args.old_string ?? '');
  const to = String(args.new_string ?? '');
  if (from === '' || !text.includes(from)) return null;
  return args.replace_all === true ? text.split(from).join(to) : text.replace(from, () => to);
}

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  block('could not parse the hook input; refusing by default.');
}

const tool = input.tool_name ?? '';
const args = input.tool_input ?? {};

if (tool.startsWith('mcp__')) {
  const name = tool.split('__').pop() ?? '';
  if (/figma/i.test(tool) && name.startsWith('get_')) process.exit(0);
  block(`MCP tool "${tool}" is not allowed. Only Figma read tools (get_*) are.`);
}

if (READ_ONLY_TOOLS.includes(tool)) process.exit(0);

if (AGENT_TOOLS.includes(tool)) {
  if (args.subagent_type === RESEARCH_AGENT) process.exit(0);
  block(
    `you may start only the "${RESEARCH_AGENT}" agent (subagent_type: "${RESEARCH_AGENT}"), ` +
      `not "${args.subagent_type ?? 'the default agent'}". It is read-only; other agents can write.`,
  );
}

if (tool !== 'Write' && tool !== 'Edit') {
  block(
    `tool "${tool}" is not allowed. You may use ${READ_ONLY_TOOLS.join(', ')}, Figma read tools, ` +
      `Agent for "${RESEARCH_AGENT}", and Write/Edit inside the spec folders. Put anything else into your report.`,
  );
}

const root = realpathSync(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const rawPath = args.file_path;
if (typeof rawPath !== 'string' || rawPath === '') block('no file_path in the tool input.');

const target = realPath(resolve(root, rawPath));
const parts = relative(root, target).split(sep);

const inRootSpecs = parts.length === 2 && parts[0] === 'specs';
const inPackageSpecs = parts.length === 3 && PACKAGES.includes(parts[0]) && parts[1] === 'specs';
if (!(inRootSpecs || inPackageSpecs) || !target.endsWith('.md')) {
  block(
    `"${rawPath}" is outside the spec folders. You may write only specs/*.md and ` +
      `{${PACKAGES.join(',')}}/specs/*.md. Put anything else into your report.`,
  );
}

// The folder index is not a spec: no Status rules.
if (basename(target) === 'README.md') process.exit(0);

const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
if (current !== null && !isDraft(current) && !isReopenable(current)) {
  block(
    `"${rawPath}" is neither "Status: draft" nor "Status: approved". Implemented and legacy specs ` +
      'are read-only for you: write a new spec with "Supersedes:" instead, or report the change to the user.',
  );
}

const next = tool === 'Write' ? String(args.content ?? '') : afterEdit(current ?? '', args);
if (next !== null && !isDraft(next)) {
  block(
    current !== null && isReopenable(current)
      ? `"${rawPath}" is "Status: approved". To amend it, your first Edit must replace ` +
          '"Status: approved" with "Status: draft"; the user approves it again afterwards.'
      : 'a spec must keep exactly the status line "Status: draft" after your change. ' +
          'Only the user approves a spec.',
  );
}

process.exit(0);
