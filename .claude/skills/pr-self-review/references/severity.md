# Severity rubric

CRITICAL blocks the push, so it is a **closed list**. Anything not on it is WARNING or
SUGGESTION, however much the reviewer dislikes it. Reviewers and the verifier both read this file.

## Contents
- [Levels](#levels) · [CRITICAL rule ids](#critical-rule-ids) · [WARNING](#warning) · [SUGGESTION](#suggestion) · [Evidence bar](#evidence-bar)

## Levels

| Level | Meaning | Effect |
|---|---|---|
| **CRITICAL** | Breaks a hard project rule, is exploitable, or is a demonstrable defect on a normal path | Verdict BLOCK; gate stops `git push`, `gh pr create`, `gh pr merge` |
| **WARNING** | Real deviation from a skill rule or convention that should be fixed in this PR | Reported, never blocks |
| **SUGGESTION** | Optional improvement, nit | Reported (collapsed), never blocks |

## CRITICAL rule ids

A finding is CRITICAL only if its `rule` starts with one of these ids (then `: <detail>`).

| Rule id | Raised by | Applies when | Not this |
|---|---|---|---|
| `check-failed` | `run-checks.mjs` | A deterministic check exits non-zero: typecheck, lint, unit tests, `pnpm arch`, `shared-contracts.sh check` | A check that could not run (deps missing) is `not_verified`, not CRITICAL |
| `onion-layer-violation` | onion-architecture | Inner ring names an outer one: DB, Fastify, SDK or `adapters/*` import in application code; a query or business branch in `routes.ts`; service built from the whole `Container`; SDK type crossing an adapter | Placement or naming inside a ring (WARNING) |
| `contract-drift` | zod / onion-architecture | `server/src/vendor/shared` edited but the client copy not synced, or the client copy edited directly | Style differences in a contract |
| `security-vuln` | security | A concrete exploitable path: injection, secret or token in code, missing authn/authz on a route that reads or mutates user data, SSRF, path traversal, unsafe deserialization, disabled TLS/CSRF/CORS protection | Missing hardening with no attack path (WARNING) |
| `hand-edited-generated` | `collect-diff.mjs` | A migration or lock file changed without its generator's other outputs (see `suspicious_generated`) | A regenerated migration or lock file |
| `cross-package-import` | frontend-architecture / onion-architecture | A relative import that leaves its package (`../../server/...`) instead of a tsconfig path alias | Deep relative import inside one package |
| `db-test-naming` | correctness | A server test that touches the DB but its file does not end in `.it.test.ts` (it would run in the DB-free CI lane and fail there) | Test placement elsewhere |
| `correctness-defect` | correctness | A concrete input on a normal path gives a wrong result, data loss, a crash or an unhandled rejection, and you can state the input | "Could be null", theoretical races, missing edge-case handling with no reachable trigger |

`typecheck` and `lint` cover the mechanical part of `cross-package-import` and most typing; a reviewer
adds it only when the tools miss it.

## WARNING

Rule from a skill that is not in the table above: file or folder placement, naming (`kebab-case.ts`,
`PascalCase.tsx`, `_components/<Name>/`), missing `index.ts`, component or hook too large, state in the
wrong place, i18n in the wrong file, missing zod response schema, missing test for new behaviour, N+1 in
a repository, unmapped skill, `not_verified` checks, findings the verifier downgraded.

## SUGGESTION

Naming polish, extra memoization, alternative structures, comments. Prefix nothing; list them last.

## Evidence bar

Every finding needs all of: `file`, `line` (a changed line), `rule` (skill principle/checklist item or a
rule id above), `evidence` (verbatim code, at most 3 lines), `fix` (what to change). A finding without
them is discarded by `write-verdict.mjs`. A CRITICAL that the verifier cannot confirm becomes WARNING.
Pre-existing problems on lines the change did not touch are not reported.
