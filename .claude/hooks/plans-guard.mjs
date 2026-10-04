#!/usr/bin/env node
// PreToolUse guard (matcher `Write|Edit`) for the two agents that save their own result in
// docs/plans/: implementation-planner (`--kind plan`) and brainstorm (`--kind brainstorm`).
// Exit 0 = allow, exit 2 = block (stderr goes back to the agent).
//
// Both agents are otherwise read-only; this hook is what keeps Write/Edit to one file kind:
//   --kind plan        docs/plans/NN-short-name.md, never a *.brainstorm.md, and only while the
//                      plan is `Status: draft` before and after the change (approval is the user's;
//                      a plan in progress belongs to the implementer)
//   --kind brainstorm  docs/plans/NN-short-name.brainstorm.md, only as `Status: awaiting choice`
//                      (the main session records the user's choice)
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

const KINDS = {
  plan: { name: /^\d{2,}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/, status: 'draft', shown: 'docs/plans/NN-short-name.md' },
  brainstorm: { name: /^\d{2,}-[a-z0-9]+(?:-[a-z0-9]+)*\.brainstorm\.md$/, status: 'awaiting choice', shown: 'docs/plans/NN-short-name.brainstorm.md' },
};
const STATUS_LINES = /^Status:[ \t]*(.*)$/gm;

function block(reason) {
  process.stderr.write(`plans guard: ${reason}\n`);
  process.exit(2);
}

// Resolves symlinks on the deepest existing ancestor, so a link cannot lead a write out of docs/plans/.
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

// The file as the Edit tool would leave it; null when the edit cannot apply (the tool will fail).
function afterEdit(text, args) {
  const from = String(args.old_string ?? '');
  const to = String(args.new_string ?? '');
  if (from === '' || !text.includes(from)) return null;
  return args.replace_all === true ? text.split(from).join(to) : text.replace(from, () => to);
}

const kindFlag = process.argv.indexOf('--kind');
const kind = KINDS[process.argv[kindFlag + 1]];
if (kindFlag < 0 || !kind) block('the hook needs --kind plan or --kind brainstorm; refusing by default.');

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  block('could not parse the hook input; refusing by default.');
}

const tool = input.tool_name ?? '';
const args = input.tool_input ?? {};
if (tool !== 'Write' && tool !== 'Edit') process.exit(0);

const root = realpathSync(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const rawPath = args.file_path;
if (typeof rawPath !== 'string' || rawPath === '') block('no file_path in the tool input.');

const target = realPath(resolve(root, rawPath));
const parts = relative(root, target).split(sep);
if (parts.length !== 3 || parts[0] !== 'docs' || parts[1] !== 'plans' || !kind.name.test(parts[2])) {
  block(`"${rawPath}" is not ${kind.shown}. That is the only file you may write; put anything else into your report.`);
}

const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
if (current !== null && !hasStatus(current, kind.status)) {
  block(`"${rawPath}" is no longer "Status: ${kind.status}", so it is read-only for you. Report the change to the caller instead.`);
}

const next = tool === 'Write' ? String(args.content ?? '') : afterEdit(current ?? '', args);
if (next !== null && !hasStatus(next, kind.status)) {
  block(`the file must keep exactly the status line "Status: ${kind.status}" after your change. Only the user moves it on.`);
}

process.exit(0);
