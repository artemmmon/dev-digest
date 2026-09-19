# The gate

How a BLOCK verdict stops `git push`, `gh pr create` and `gh pr merge`, what it cannot stop, and how a
human overrides it. `[Sn]` numbers are the sources in [README.md](../README.md).

## Contents
- [Layers](#layers) · [Verdict file](#verdict-file) · [Freshness](#freshness) · [Override](#override) · [What the gate does not do](#what-the-gate-does-not-do) · [Install](#install)

## Layers

| Layer | Catches | Bypassed by |
|---|---|---|
| **Claude Code PreToolUse hook** (`.claude/settings.json`) | `git push`, `gh pr create`, `gh pr merge` run by Claude | commands it cannot parse; another tool; a human typing in a terminal |
| **git `pre-push` hook** (`scripts/install-hooks.sh`) | any `git push` from this clone: Claude, terminal, IDE | `git push --no-verify`; a clone without the hook installed |
| GitHub branch protection + required status check | merging on github.com | (not built, see below) |

Why two layers: the Claude hook is the only one that sees `gh pr create` and `gh pr merge`, because those are
not git operations; the git hook is the only one that also covers a human's terminal. The hook's
`if: "Bash(git *)"` filter is documented as best-effort for compound commands [S1][S2], so the script
re-checks the command itself (`isGatedCommand` in `gate-check.mjs`) and the git hook is the backstop.

A PreToolUse block is exit code 2 with the reason on stderr, which Claude reads; it holds even in bypass-permissions
mode [S1][S2]. The git hook exits 1, which aborts the push.

## Verdict file

`.git/pr-self-review/<branch>.json`, written by `write-verdict.mjs`. It lives inside the git dir so it is never
committed and is shared by worktrees of the same clone. Fields the gate reads: `verdict` (`PASS` | `BLOCK`),
`diff_hash`, `blocking[]`, `override`. Everything else (`findings`, `counts`, `head_sha`, `not_verified`) is for the report.

The verdict is computed by code, not by the model: BLOCK iff a check failed, a finding is CRITICAL, or a
generated file looks hand-edited. See [severity.md](severity.md).

## Freshness

The gate recomputes `diff_hash` from the working tree and compares it with the verdict's. The hash covers the
merge-base and the content of every changed, non-excluded file (commits + staged + unstaged + untracked).

| Situation | Result |
|---|---|
| No changes against the base | allowed (nothing to review) |
| No verdict | blocked: run `/pr-self-review` |
| Verdict older than an edit or a new commit that changed content | blocked as stale |
| `git commit` of files that were already reviewed | still fresh (same content, same hash) |
| Base branch moved (new merge-base) | stale |

## Override

Only a **human** overrides, and only at the git hook:

```bash
PR_SELF_REVIEW_OVERRIDE="hotfix: reviewed by hand, ticket 123" git push
```

- The reason must be non-empty. It is written into the verdict file and appended to `.git/pr-self-review/overrides.log`.
- A PASS needs no override; an override does nothing without a BLOCK verdict.
- The Claude hook never honors it. If a Bash command sets `PR_SELF_REVIEW_OVERRIDE`, the hook answers
  `permissionDecision: "ask"` [S1][S2] so the user sees a normal permission prompt, and Claude cannot grant itself a bypass.
  The skill also forbids Claude from adding it on its own.
- When a PR is opened after an override, the PR description must quote the reason from the verdict file.

## What the gate does not do

- **It cannot stop the Merge button on github.com.** Only server-side protection can, and a local status
  posted with `gh api` can be forged by whoever runs it. Not built; see open question 1 in
  [devdigest.md](devdigest.md).
- `gh pr merge <number>` for a *different* branch is judged against the checked-out branch's verdict.
- `git push --no-verify`, and clones where `install-hooks.sh` was never run, skip the git layer.
- Only the checked-out branch is gated (that is what the hash describes); pushing another ref or deleting
  a branch is allowed.
- It is a guardrail for the author's own workflow, not a security boundary.

## Install

```bash
./scripts/install-hooks.sh              # symlink the pre-push hook into .git/hooks (once per clone)
./scripts/install-hooks.sh --uninstall
node .claude/skills/pr-self-review/assets/gate-check.mjs status    # what would happen to a push now
```

The Claude Code hook needs no install: it is in `.claude/settings.json`. If a different `pre-push` hook
already exists the installer refuses and prints the line to add to it.
