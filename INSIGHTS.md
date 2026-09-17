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

## Tool & Library Notes

## Recurring Errors & Fixes

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
