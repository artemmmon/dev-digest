# Routing: which skill reviews which file

The table is data, not prose: [`assets/routing.json`](../assets/routing.json) is the single source of
truth and `collect-diff.mjs` reads it. This file explains the decisions; if the two disagree, the JSON wins.

## Contents
- [How a file is routed](#how-a-file-is-routed) · [The rules](#the-rules) · [Files no rule matches](#files-no-rule-matches) · [Skills that are not review rubrics](#skills-that-are-not-review-rubrics) · [Drift check](#drift-check) · [Changing the table](#changing-the-table)

## How a file is routed

1. Files under `excluded` (`server/clones/`, `temp/`, `node_modules/`, build output) are dropped
   before anything else, including the hash. `CLAUDE.md` says to keep `server/clones/` out of every search.
2. Files under `generated` (migrations, lock files) are never reviewed by a skill. They are checked only
   for hand edits (see [severity.md](severity.md) → `hand-edited-generated`).
3. Every other file is matched against **all** rules. A file can match several and is then reviewed by
   the union of their skills. A rule's `ignore` list removes files from that rule only.
4. A skill's file group is the set of files any of its rules matched. Empty group = skill not run.

## The rules

| Rule | Files | Skills | Why this mapping |
|---|---|---|---|
| `client-src` | `client/src/**/*.{ts,tsx}` (not tests, not `vendor/`) | frontend-architecture, react-best-practices | UI placement rules + component/hook anti-patterns |
| `client-app-router` | `client/src/app/**` | + next-best-practices | Only App Router files have RSC/route-handler/metadata rules |
| `client-i18n` | `client/messages/**/*.json` | frontend-architecture | Its i18n section: one file per feature, `camelCase` keys |
| `client-tests` | `client/**/*.test.{ts,tsx}`, `client/test/**` | react-testing-library | Test rubric, not architecture rubric |
| `server-app` | `server/src/{modules,platform,adapters}/**`, `server/src/*.ts` (not tests) | onion-architecture, fastify-best-practices | Ring rules + Fastify route/plugin practice |
| `server-data` | `**/repository.ts`, `repository/**`, `server/src/db/**` (not migrations) | + drizzle-orm-patterns | Query and transaction patterns |
| `server-schema` | `server/src/db/schema*` | + postgresql-table-design | Types, indexes, constraints |
| `shared-contracts-server` | `server/src/vendor/shared/**` | zod, onion-architecture | Canonical contracts; they are the core ring |
| `shared-contracts-client` | `client/src/vendor/shared/**` | zod | A copy; `contract-drift` is caught by the check |
| `reviewer-core` | `reviewer-core/src/**` | typescript-expert, zod | Pure engine: types and schemas dominate |
| `security-surface` | all `.ts/.tsx/.mjs/.js`, `package.json`, `.env.example`, workflows, `docker-compose.yml`, `scripts/**` (not tests, not `client/src/vendor/`) | security | Any code can carry a vulnerability; dependencies and CI are attack surface |

Server tests (`server/test/**`, `*.test.ts`) match no skill rule on purpose: no skill in the project
teaches server test conventions. The correctness reviewer covers them, including `db-test-naming`.

## Files no rule matches

Docs, JSON configs, e2e flows, shell scripts outside `scripts/`, server and reviewer-core tests. They are
listed as `correctness_only` and are read by the **correctness reviewer**, which also reads every file
above. The report shows them so the author can see what got only one pair of eyes.

## Skills that are not review rubrics

`routing.json` → `nonReviewSkills` names skills that produce content rather than judge it
(`mermaid-diagram`, `engineering-insights`, `devdigest-demo`) and `pr-self-review` itself. They are never
spawned as reviewers.

## Drift check

`collect-diff.mjs` compares `.claude/skills/*/SKILL.md` with the table:

- installed skill that is neither routed nor listed in `nonReviewSkills` → `unmapped_skills`
  (reported as a WARNING: "skill X exists but reviews nothing — add it to routing.json");
- rule that names a skill that is not installed → `missing_skills`, exit code 3, the run stops.

## Changing the table

1. Edit `assets/routing.json` (keep rule ids unique, every rule needs at least one skill).
2. Update the table above.
3. Run `node --test '.claude/skills/pr-self-review/assets/tests/*.test.mjs'`.
4. Bump the version and add a changelog row in [README.md](../README.md).

`typescript-expert` is routed to `reviewer-core` only. The client and server already type-check in
strict mode; add it elsewhere only if a package starts doing type-level programming.
