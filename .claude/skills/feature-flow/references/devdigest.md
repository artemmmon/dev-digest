# Feature flow in DevDigest

How the route in [SKILL.md](../SKILL.md) maps onto this repository.

## Which stage is this feature in?

| You find | Stage | Next |
|---|---|---|
| No spec for the feature | 1 | `spec-creator` |
| Spec `Status: draft` | 1 | The user reviews and approves it |
| Spec `approved`, no `docs/plans/NN-*.brainstorm.md` | 2 | `brainstorm` |
| Brief `Status: awaiting choice` | 2 | The user picks an option |
| Brief `chosen: option <k>`, no plan | 3 | `implementation-planner` |
| Plan `Status: draft` | 3 | `check-plan.mjs`, then the user approves |
| Plan `approved` | 4 | Pre-flight, then the first group |
| Plan `in progress` | 4–6 | The implementation reports say which groups are done; `git status` shows the rest |
| Plan `implemented` / `partial` | 7–9 | Verifier, security, docs |
| Spec `implemented`, docs written | 9 | `/pr-self-review` |

A fix or a small feature with no spec starts at stage 2 or 3 with the request as the requirements.

## Statuses

| File | Values | Who writes them |
|---|---|---|
| Spec (`Spec ID:` line) | `draft` → `approved` → `implemented` | `spec-creator` · the user (or the main session on their word) · `implementer` |
| Brief | `awaiting choice` → `chosen: option <k>` | `brainstorm` · the main session after the user picks |
| Plan | `draft` → `approved` → `in progress` → `implemented` \| `partial` | `implementation-planner` · the main session on the user's word · `implementer` |

Guards: `.claude/hooks/spec-creator-guard.mjs` (spec stays a draft in the agent's hands),
`.claude/hooks/plans-guard.mjs` (planner writes only a draft plan; brainstorm only an
awaiting-choice brief). `check-plan.mjs` fails a plan whose spec is not approved.

## Pre-flight (before stage 4)

```sh
git status --short                                   # know what is already changed
git merge-base HEAD main                             # <base> for every later agent
node .claude/skills/feature-flow/assets/check-plan.mjs docs/plans/NN-name.md
ls server/node_modules client/node_modules >/dev/null   # deps installed in this checkout/worktree
docker compose ps                                    # only when the plan says "Needs Postgres: yes"
```

- **Postgres.** If the plan needs it and it is down, start it with `./scripts/dev.sh --db-only`
  (never `docker compose down -v`). Without it every `.it.test.ts` item ends as "cannot verify"
  and the verdict is INCOMPLETE.
- **Dependencies.** A fresh git worktree has no `node_modules`; `check-changed.sh` then reports
  every check as "could not run". Install per package with its own manager (pnpm / npm).
- **Node.** The scripts fall back to `/opt/homebrew/opt/node@22/bin` when the shell's node is older.

## The handoff note (planning session → execution session)

The planning session ends with a note of about ten lines; the execution session starts from it,
with the `feature-flow` skill, instead of resuming a long context:

```
Feature: <name> · Spec: specs/NN-name.md (approved) · Plan: docs/plans/NN-name.md (approved)
Mode: multi-agent · Groups: G1 (server, steps 1–4) → G2 ∥ G3 …
Needs Postgres: yes/no
Decisions not in the files: <anything the user said that the spec and plan do not record; ideally "none">
Next: pre-flight, then G1
```

## What the checks cost in context

| Command | Use |
|---|---|
| `./scripts/check-changed.sh --quick` | A group that is not the last: typecheck + `vitest related` for the changed files |
| `./scripts/check-changed.sh` | The last group, fix mode, `test-writer`, the verifier: every check of the touched packages |
| `./scripts/check-changed.sh --check <id> --only <pkg>` | Re-running one failing check while fixing it |

A package stops at its first failing check, so a type error does not also print lint and test
failures. `--all` turns that off.

## Known gaps and open questions

1. **Frontmatter hooks in a live run are unverified.** The guards and both check hooks are tested
   as scripts (`node --test`), not inside a running subagent (root `INSIGHTS.md` → Open
   Questions). On the first real run, confirm that the planner's Write to another path is blocked
   and that a plan without the marker returns the check's error.
2. **`--quick` was not run against real packages** when it was added (the worktree had no
   dependencies). If `vitest related` behaves differently in a package, fall back to
   `--check typecheck` for intermediate groups.
3. **Review twice.** Architecture and security are judged by their agents and again by the
   per-skill reviewers of `/pr-self-review`. That is deliberate: the agents find problems while a
   fix is cheap, the gate decides whether the branch may be pushed.
4. **`server/INSIGHTS.md` and `client/INSIGHTS.md` are 40–50 KB.** Only the planner reads them
   whole. Splitting them by module would break the `path:line` citations in existing plans.
