# Insights — cross-package

Non-obvious findings that span packages. Package-local findings go to `<package>/INSIGHTS.md`.
Written via the `engineering-insights` skill: append-only, one entry per finding.

---

## What Works

## What Doesn't Work

### 2026-09-15 — Docs drift from code
- README: "two built-in reviewers" — seed creates three (General, Security, Performance).
- README recommends `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — default provider is OpenRouter.
- README troubleshooting suggests `docker compose down -v`; `e2e/README.md` warns it wipes real data.
- TESTING.md says `server/package.json` is `skip-worktree` — locally it is not (`git ls-files -v` → `H`).
- `agent-runner` (lesson L06) is referenced in `.gitignore`, comments and `server-unit.yml`, but the folder doesn't exist.
Where: `README.md:73` ("two built-in reviewers"), `TESTING.md:96` (the `skip-worktree`
claim), `.gitignore:5` (`agent-runner/dist/`).

### 2026-09-16 — `client/docs/design/**` in the diff poisons a review run
The design export is ~30 JSX files of MOCK data (a fake PR #482 "Add rate limiting…" with
`file_refs: ["src/middleware/ratelimit.ts:12-18"]`). When a PR touches it, the reviewer sees
91 changed files / 137k input tokens and reports findings about files that exist only inside
those fixtures — grounding then drops them (`file '…' not present in diff`), so the run
costs full price and persists zero findings. Exclude vendored/fixture paths from the review
diff before blaming the model. Seen on PR #1 (`0/2 passed`, run `0d14f36c`).
Where: `client/docs/design/src/data.jsx`, `reviewer-core/src/grounding.ts:61`.

## Codebase Patterns

### 2026-09-15 — `vendor/shared` copies have diverged
`server/src/vendor/shared` and `client/src/vendor/shared` differ in `adapters.ts`,
`contracts/eval-ci.ts`, `knowledge.ts`, `productionize.ts`, `trace.ts`. The server
copy has `AgentManifest`, `AgentVersion`, `commitFiles`, `sync`, `diffNameOnly` and
`'openrouter'` in `LLMProvider.id`. `reviewer-core` reads the server copy.
Check with `diff -rq server/src/vendor/shared client/src/vendor/shared`.
Where: `client/src/vendor/shared/adapters.ts:77` vs `server/src/vendor/shared/adapters.ts:83`
(`LLMProvider.id`).

### 2026-09-15 — `server/clones/` contains this repo
`DEVDIGEST_CLONE_DIR=./clones` → `server/clones/artemmmon/dev-digest/` is a full
checkout of the project. Git ignores it, grep/search does not — results get doubled.
Where: `server/src/platform/config.ts:67` (the clone-dir default).

### 2026-09-15 — Two identical compose files
`docker-compose.yml` and `server/docker-compose.yml` are byte-identical; `scripts/dev.sh` uses the root one.
Where: `scripts/dev.sh:57` (`docker compose up -d`, run from the repo root).

### 2026-09-16 — Grounding gate 1 is an exact string match on the diff's file path
`groundFindings` first checks `filesInDiff.has(finding.file)` — no normalisation, no suffix
match — and only then checks the line range. A model that writes `src/server/cost.ts` for
`server/src/modules/pulls/cost.ts` loses an otherwise valid finding, and the trace reason
reads "file '…' not present in diff" (vs the line-range reason). When a run reports
`0/N passed`, read the drop reasons in the trace log before assuming the model hallucinated
the issue itself — it may only have hallucinated the path.
Where: `reviewer-core/src/grounding.ts:52-84`.

### 2026-09-17 — The PR-list COST is rounded for display, so it never matches the stored sum
`formatCost` uses adaptive precision: a stored `0.01259424466` renders as `$0.013`, not `$0.0126`.
Anything quoting the cost outside the UI (a demo narration, a test, a doc) has to quote the
rendered string or the raw number, not mix them. The same trap sits one level up: `COST`, `SCORE`
and `FINDINGS` in the list describe the latest review *round*, while the severity pills on a single
run card describe that one agent — two different numbers with the same shape.
Where: `client/src/lib/format-cost.ts:1`, `server/docs/0001-latest-review-is-a-batch.md:1`.

## Tool & Library Notes

### 2026-09-17 — Lint was removed from the starter on purpose, and history is not a source
`c6af1e4` ("revert: restore main to the starter state") discarded three merged student
PRs and with them `eslint.config.mjs` in client/server/reviewer-core, `.dependency-cruiser.cjs`
and the `pnpm lint` / `pnpm arch` CI steps. `git show c6af1e4^:server/eslint.config.mjs`
still shows them — do not restore those files, they are someone else's homework. Write a
config for the package you are in instead.
Where: `.github/workflows/server-unit.yml:69` (this branch's own lint step).

### 2026-09-17 — `no-undef` must be off for TypeScript, or every Node global errors
Without the `globals` package, `js.configs.recommended` reports `'process' is not defined`
across a Node package. typescript-eslint's own guidance is to disable the rule for TS: tsc
already resolves every identifier. The client keeps it on and declares globals for its two
root config files instead, because `next.config.mjs` is plain JS.
Where: `server/eslint.config.mjs:25`, `client/eslint.config.mjs:26` (the globals block).

### 2026-09-17 — Demo videos are recorded by a skill, not by hand
`/demo-film` (personal skill) drives an isolated VS Code, the staged Terminal and Chrome to
record `hw/LNN/demo-LNN.mp4` from `hw/LNN/demo/{cues.json,scenes.mjs,config.json}`; repo-specific
rules (URLs, the seeded second repo to keep off camera, controls that must never be clicked) live
in the project skill. Filming needs a second display and the app stack up.
Where: `.claude/skills/devdigest-demo/SKILL.md:1`, `hw/L01/demo/scenes.mjs:1`.

## Recurring Errors & Fixes

### 2026-09-17 — `eslint --fix` leaves a whitespace-only line when it drops a disable directive
Removing an "unused eslint-disable directive" deletes the comment text but keeps the
indentation, so the file ends up with a `   ` line that no linter then complains about.
After a `--fix` run that reported unused directives, grep the diff for whitespace-only
lines (`git diff | grep -n '^+[[:space:]]\+$'`) before committing.
Where: `server/test/integration.it.test.ts:13` and
`server/test/agents-versions.it.test.ts:17` (the `console.warn` the directive sat above).


### 2026-09-15 — `ERR_PNPM_IGNORED_BUILDS` on `pnpm install`
Local pnpm 12 (CI pins pnpm 10) fails install until every dependency with an install
script is listed under `allowBuilds`, and writes a placeholder `pnpm-workspace.yaml`.
A new such dependency → add it there with an explicit `true`/`false`; all current ones are
`false` (prebuilt binaries / optional addons).
Where: `client/pnpm-workspace.yaml:3` and `server/pnpm-workspace.yaml:3` (`allowBuilds`).

### 2026-09-16 — A glob pattern in a block comment can close the comment
Documenting a basename glob inside `/** … */` breaks the file: the pattern contains
`*` followed by `*/`, which terminates the comment mid-sentence. `tsc` then reports
something unrelated and far away (`TS1443: Module declaration names may only use ' or "
quoted strings`, `TS1160: Unterminated template literal`). Write it as `**` + `/name`,
or use `//`. A directory pattern like `dir/**` is safe — no `*/` in it.
Where: `server/src/modules/reviews/diff-filter.ts:17` (the pattern-forms comment),
`server/src/modules/reviews/constants.ts:28` (`REVIEW_EXCLUDED_PATHS`).

## Open Questions

### 2026-09-15 — Undocumented task IDs in comments
Comments reference internal IDs (F1, A2, A6, T1.3, T2.2, T3) with no legend anywhere.
Where: `server/src/platform/model-router.ts:2` ("A6 — Cost discipline (§11)").

## Session Notes

### 2026-09-17 — Closing the HW1 documentation criteria (L01)
Added ESLint to all four packages and wired it into CI, wrote the naming conventions and
the lock-file do-not-touch rule into the root `CLAUDE.md`, gave all 39 existing INSIGHTS
entries a verified `file:line` anchor, and filled the eight empty per-package `docs/` and
`specs/` folders with one doc + one spec each. The PR-list COST stays scoped to the latest
review round; the reasoning now lives in an ADR instead of only in a commit message.
Where: `server/docs/0001-latest-review-is-a-batch.md`, `.claude/skills/engineering-insights/SKILL.md:5`.
