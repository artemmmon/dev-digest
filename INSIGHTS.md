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

## Codebase Patterns

### 2026-09-15 — `vendor/shared` copies have diverged
`server/src/vendor/shared` and `client/src/vendor/shared` differ in `adapters.ts`,
`contracts/eval-ci.ts`, `knowledge.ts`, `productionize.ts`, `trace.ts`. The server
copy has `AgentManifest`, `AgentVersion`, `commitFiles`, `sync`, `diffNameOnly` and
`'openrouter'` in `LLMProvider.id`. `reviewer-core` reads the server copy.
Check with `diff -rq server/src/vendor/shared client/src/vendor/shared`.

### 2026-09-15 — `server/clones/` contains this repo
`DEVDIGEST_CLONE_DIR=./clones` → `server/clones/artemmmon/dev-digest/` is a full
checkout of the project. Git ignores it, grep/search does not — results get doubled.

### 2026-09-15 — Two identical compose files
`docker-compose.yml` and `server/docker-compose.yml` are byte-identical; `scripts/dev.sh` uses the root one.

## Tool & Library Notes

## Recurring Errors & Fixes

## Open Questions

### 2026-09-15 — Undocumented task IDs in comments
Comments reference internal IDs (F1, A2, A6, T1.3, T2.2, T3) with no legend anywhere.

## Session Notes
