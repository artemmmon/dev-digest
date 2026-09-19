# pr-self-review in DevDigest

How the skill maps onto this repository, plus what is known to be rough and what is still open.

## Contents
- [Repo facts the skill relies on](#repo-facts-the-skill-relies-on) · [Checks per package](#checks-per-package) · [Running it](#running-it) · [Known gaps](#known-gaps) · [Open questions](#open-questions)

## Repo facts the skill relies on

| Fact | Source | Used for |
|---|---|---|
| Four packages, each with its own lockfile and manager (server/client pnpm, reviewer-core/e2e npm) | root `AGENTS.md` | `routing.json` → `packages`, `generated.lockfiles` |
| Every package has `typecheck`, `lint`, `test` | root `AGENTS.md` | the deterministic checks |
| `server/clones/` holds a full copy of the repo | root `AGENTS.md` | `excluded`: never read, never hashed |
| `server/src/db/migrations/` is generated; lock files are never hand-edited | root `AGENTS.md` → Do not touch | `generated`, `hand-edited-generated` |
| `server/src/vendor/shared` is canonical, `client/src/vendor/shared` a byte-identical copy | root `AGENTS.md` → Cross-package rules | `shared-contracts` check, `contract-drift` |
| A server test that touches the DB must end in `.it.test.ts` | root `AGENTS.md` → Naming | `db-test-naming`, and why `test:unit` is used |
| `reviewer-core/**` also triggers the server CI lane | `.github/workflows/server-unit.yml` | server checks run when reviewer-core changes |
| `pnpm arch` runs the onion-architecture dependency-cruiser config | `server/package.json` | `arch` check |
| Branches `lesson-NN`, base is `main`, push and PR go to the fork only | root `AGENTS.md`, memory | base ref defaults to `origin/main` |

## Checks per package

| Package | Runs | Skipped on purpose |
|---|---|---|
| server | `typecheck`, `lint`, `test:unit`, `arch` | `.it.test.ts` (needs Postgres; CI lane `server-integration.yml`) |
| client | `typecheck`, `lint`, `test` | — |
| reviewer-core | `typecheck`, `lint`, `test` (+ all server checks) | — |
| e2e | `typecheck`, `lint` | the flows themselves (need browsers and alternate ports, `./scripts/e2e.sh`) |
| repo | `shared-contracts.sh check` when either `vendor/shared` copy changed | — |

`run-checks.mjs` needs Node ≥ 22 first on PATH (the packages require it). On a machine whose default
`node` is older, prefix the command, for example `PATH=/opt/homebrew/opt/node@22/bin:$PATH node …`.

## Running it

| You want | Command |
|---|---|
| The review | `/pr-self-review` (optionally `--base <ref>`) |
| What would be reviewed, no LLM | `node .claude/skills/pr-self-review/assets/collect-diff.mjs --summary` |
| Only the deterministic checks | `node …/collect-diff.mjs \| node …/run-checks.mjs` |
| Whether a push would pass right now | `node …/gate-check.mjs status` |
| Script tests | `node --test '.claude/skills/pr-self-review/assets/tests/*.test.mjs'` |
| Install the git hook | `./scripts/install-hooks.sh` |

## Known gaps

- **`client` `pnpm lint` also lints local build output.** `client/.next-e2e/` (created by `./scripts/e2e.sh`,
  git-ignored through `.next-*/`) is not in the ESLint ignore list, so a clone that has run e2e reports
  thousands of errors in generated files and `check-failed` blocks the push. Fix: add `.next-*/**` to the
  ignores in `client/eslint.config.mjs`, or delete `client/.next-e2e/` before reviewing. Found on `lesson-02`, 2026-09-19.
- No skill covers server test conventions, so server tests get the correctness reviewer only.
- `.it.test.ts` files are never run locally by this skill.

## Open questions

1. **Enforce on GitHub?** Publishing a `pr-self-review` commit status and requiring it in branch protection is
   the only way to stop the Merge button, but it is an outward-facing action and forgeable from a laptop. Decide
   whether the course fork wants it.
2. **CI twin.** Should `check-failed` items also run in CI as a required job? They already do (`client.yml`,
   `server-unit.yml`, …); this skill only moves them earlier.
3. **Cost.** A large PR (300+ files, as on `lesson-02`) spawns roughly 10 to 15 reviewers plus verifiers. If it is too
   slow, add `--only <skill>` and a per-skill file cap.
4. **`typescript-expert` scope.** Routed to `reviewer-core` only; revisit if the server grows type-level code.
