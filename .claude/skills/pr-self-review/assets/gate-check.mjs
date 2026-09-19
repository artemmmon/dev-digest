#!/usr/bin/env node
// The gate. Blocks `git push`, `gh pr create` and `gh pr merge` unless a fresh PASS verdict exists.
//
//   gate-check.mjs claude-hook   Claude Code PreToolUse hook (JSON on stdin; exit 2 blocks)
//   gate-check.mjs git-hook      git pre-push hook (ref lines on stdin; exit 1 blocks)
//   gate-check.mjs status        human-readable state of the current branch
//
// Allowed when: the change set is empty, OR the stored verdict is PASS and its diff_hash matches the
// working tree, OR the verdict is BLOCK and PR_SELF_REVIEW_OVERRIDE holds a reason (git hook only —
// see references/gate.md for why the Claude hook asks a human instead).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { currentState, git, loadRouting, repoRoot, verdictDir, verdictPath } from './lib.mjs';

export const OVERRIDE_VAR = 'PR_SELF_REVIEW_OVERRIDE';
const GATED = /(?:^|[\s;&|(])(?:gh\s+pr\s+(?:create|merge)|git\s+(?:-\S+\s+(?:\S+\s+)?)*push)(?=\s|$|[;&|)])/;
const OVERRIDE_IN_COMMAND = new RegExp(`(?:^|[\\s;&|(])${OVERRIDE_VAR}=`);

/** Heredoc bodies are data, not commands: keep the `<<EOF` line, drop everything up to the terminator. */
function stripHeredocs(text) {
  return text.replace(/(<<-?\s*(['"]?)(\w+)\2[^\n]*\n)[\s\S]*?\n[ \t]*\3[ \t]*(?=\n|$)/g, '$1');
}

/** Text that is really executed, found by looking inside `bash -c '…'`, `eval '…'`, `$(…)` and backticks. */
function executedInner(text) {
  const inner = [];
  for (const m of text.matchAll(/\b(?:bash|sh|zsh|eval)\b(?:\s+-\w+)*\s+(['"])([\s\S]*?)\1/g)) inner.push(m[2]);
  for (const m of text.matchAll(/\$\(([^()]*)\)/g)) inner.push(m[1]);
  for (const m of text.matchAll(/`([^`]*)`/g)) inner.push(m[1]);
  return inner;
}

/** Drop quoted strings: `git commit -m "mention git push"` is not a push. */
function stripQuotes(text) {
  return text.replace(/'[^']*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

/** Every piece of the command that could run: the top level plus nested shells and substitutions. */
function commandLayers(command, depth = 0) {
  const body = stripHeredocs(command);
  const layers = [stripQuotes(body)];
  if (depth < 3) for (const inner of executedInner(body)) layers.push(...commandLayers(inner, depth + 1));
  return layers;
}

export function isGatedCommand(command) {
  return commandLayers(command).some((layer) => GATED.test(layer));
}
export function mentionsOverride(command) {
  return commandLayers(command).some((layer) => OVERRIDE_IN_COMMAND.test(layer));
}

/** @returns {{ allow: boolean, reason: string, override?: boolean }} */
export function evaluate({ root, routing = loadRouting(), env = process.env, now = new Date() }) {
  const state = currentState(root, routing);
  if (state.empty) return { allow: true, reason: 'no changes against the base branch' };

  const path = verdictPath(root, state.branch);
  const hint = 'Run /pr-self-review (Claude Code) and fix or dismiss every CRITICAL finding.';
  if (!existsSync(path)) {
    return { allow: false, reason: `pr-self-review: no verdict for branch "${state.branch}". ${hint}` };
  }
  let verdict;
  try {
    verdict = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { allow: false, reason: `pr-self-review: verdict file is unreadable (${path}). ${hint}` };
  }
  if (verdict.diff_hash !== state.diffHash) {
    return { allow: false, reason: `pr-self-review: the verdict is stale — files changed after the review (reviewed ${verdict.head_sha?.slice(0, 8)}, now ${state.headSha.slice(0, 8)} + working tree). ${hint}` };
  }
  if (verdict.verdict === 'PASS') return { allow: true, reason: 'fresh PASS verdict' };

  const reason = (env[OVERRIDE_VAR] ?? '').trim();
  if (reason) {
    verdict.override = { reason, at: now.toISOString() };
    writeFileSync(path, JSON.stringify(verdict, null, 2));
    mkdirSync(verdictDir(root), { recursive: true });
    appendFileSync(join(verdictDir(root), 'overrides.log'), `${JSON.stringify({ at: now.toISOString(), branch: state.branch, head_sha: state.headSha, diff_hash: state.diffHash, reason, blocking: verdict.blocking })}\n`);
    return { allow: true, override: true, reason: `BLOCK verdict overridden: ${reason}` };
  }
  const lines = verdict.blocking.map((b) =>
    b.source === 'check' ? `  - check failed: ${b.package} ${b.id} (${b.cmd})`
    : b.source === 'generated' ? `  - ${b.file}: ${b.reason}`
    : `  - ${b.file}:${b.line} [${b.rule}] ${b.title}`);
  return {
    allow: false,
    reason: `pr-self-review: BLOCK — ${verdict.blocking.length} critical issue(s):\n${lines.join('\n')}\nFix them and run /pr-self-review again. A human can override with ${OVERRIDE_VAR}="<reason>" git push.`,
  };
}

function main() {
  const mode = process.argv[2];
  const stdin = () => { try { return readFileSync(0, 'utf8'); } catch { return ''; } };

  if (mode === 'claude-hook') {
    let input;
    try { input = JSON.parse(stdin()); } catch { process.exit(0); }
    const command = input?.tool_input?.command ?? '';
    if (input?.tool_name !== 'Bash' || !isGatedCommand(command)) process.exit(0);
    let root;
    try { root = repoRoot(input.cwd || process.cwd()); } catch { process.exit(0); }
    // Never let the agent grant itself an override: put a human in the loop.
    if (mentionsOverride(command)) {
      console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: `This command sets ${OVERRIDE_VAR}, which bypasses the pr-self-review gate. Approve only if you decided to override.` } }));
      process.exit(0);
    }
    const r = evaluate({ root, env: {} });
    if (r.allow) process.exit(0);
    console.error(r.reason);
    process.exit(2);
  }

  if (mode === 'git-hook') {
    const refs = stdin().split('\n').filter(Boolean).map((l) => l.split(' '));
    let root;
    try { root = repoRoot(); } catch { process.exit(0); }
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, allowFail: true })?.trim();
    const ZERO = /^0+$/;
    // Only the checked-out branch is gated (that is what the verdict describes); deletes and other refs pass.
    const pushesCurrent = refs.length === 0 || refs.some(([local, sha]) => local === `refs/heads/${branch}` && !ZERO.test(sha));
    if (!pushesCurrent) process.exit(0);
    const r = evaluate({ root });
    if (r.allow) {
      if (r.override) console.error(r.reason);
      process.exit(0);
    }
    console.error(r.reason);
    process.exit(1);
  }

  if (mode === 'status') {
    const root = repoRoot();
    const r = evaluate({ root, env: {} });
    console.log(`${r.allow ? 'ALLOW' : 'BLOCK'} — ${r.reason}`);
    process.exit(r.allow ? 0 : 1);
  }

  console.error('usage: gate-check.mjs claude-hook | git-hook | status');
  process.exit(64);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
