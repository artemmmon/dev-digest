# Insights — server

Non-obvious findings about the API. Indexer findings go to `src/modules/repo-intel/INSIGHTS.md`,
cross-package ones to `../INSIGHTS.md`.
Written via the `engineering-insights` skill: append-only, one entry per finding.

---

## What Works

## What Doesn't Work

### 2026-09-15 — Refactoring leftovers
- `src/platform/{grounding,prompt,structured}.ts` only re-export `reviewer-core`.
- `src/platform/model-router.ts` is unused: `Provider` lacks `openrouter`, and
  `PromptCache`'s default clock `() => 0` means entries never expire.
- `ReviewService` builds its own `ReviewRepository` instead of `container.reviewRepo`.
- `polling` writes to the DB directly from the route (no service/repository).
- A comment in `modules/repos/service.ts` mentions `POST /repos/:id/reindex`; the route is `/resync`.

### 2026-09-16 — `review {all:true}` in tests runs seeded openrouter agents for real
`POST /pulls/:id/review {all:true}` also runs the seeded openrouter agents and any agent
created by earlier tests in the file. Without `overrides.llm.openrouter` they use the
real key from `~/.devdigest/secrets.json`; those runs stayed `running` for more than 10s
(real network, **unverified**). `waitForPrRuns` returns silently on timeout instead of failing.
Fix: mock every provider used in the file. The existing test "run all enabled agents" is affected.
Where: `test/reviews.it.test.ts`, `test/helpers/runs.ts`.

## Codebase Patterns

### 2026-09-15 — Queue state is in-memory only
The `jobs` table mirrors status but nothing re-enqueues `queued` jobs after a
restart. Reviews run fire-and-forget in-process; `reapStaleRuns()` cleans up
orphaned `running` runs on boot. Assumes a single API instance.

### 2026-09-16 — New fields on the `run_traces` jsonb contract must be `nullish`
`getRunTrace` returns the stored jsonb as-is, with no migration and no parse, so traces
saved before a field existed don't have its key. Declare added `RunStats`/`RunTrace`
fields `.nullish()` and have the UI treat `undefined` like `null` (e.g. `cost_usd` → "—").
Where: `src/vendor/shared/contracts/trace.ts`, `modules/reviews/repository/run.repo.ts`.

## Tool & Library Notes

## Recurring Errors & Fixes

### 2026-09-16 — Local dev DB is ahead of this branch's migrations
The `devdigest_pgdata` volume has 17 rows in `drizzle.__drizzle_migrations`, but the
repo has 10 (the volume was migrated from an integration branch). `agent_runs` already
has `cost_usd`, `critical_count` and similar columns, so `pnpm db:migrate` fails with
`column "cost_usd" ... already exists`. Fresh databases (Testcontainers, `scripts/e2e.sh`)
migrate fine. Decide with the owner whether to reset or reconcile; never `down -v` without asking.
Where: `src/db/migrations/`.

### 2026-09-16 — Reconciling the diverged dev DB without a reset
Follow-up to "Local dev DB is ahead": `0010_colossal_shaman` was reconciled by hand, no data lost.
Apply the new SQL with `ADD COLUMN IF NOT EXISTS`, then `INSERT INTO drizzle.__drizzle_migrations
(hash, created_at)` with hash = `shasum -a 256 <file>.sql` and created_at = the journal `when`;
`pnpm db:migrate` then reports applied. The migrator only runs files whose `when` is newer than the
last applied `created_at`. Where: `src/db/migrations/meta/_journal.json`.

## Open Questions

### 2026-09-15 — Failed background job may crash the process (unverified)
`JobRunner.enqueue()` returns `{ id, done }`; `done` rejects on failure but nobody
awaits or catches it. On Node 22 an unhandled rejection exits the process.
Repro idea: add a repo with a non-existent URL.
Where: `src/platform/jobs.ts`, `src/modules/repos/service.ts`.

### 2026-09-15 — `RunBus.complete()` doesn't release buffers
The docstring says "release buffers/emitters", but only the emitter is deleted;
`buffers`, `seq` and `completed` grow for the life of the process.
Where: `src/platform/sse.ts`.

## Session Notes

### 2026-09-16 — Run Cost Badge (L01)
Brought per-run `cost_usd` back and added `agent_runs.batch_id` so the PR list can sum
the latest batch (spec `../specs/01-run-cost-badge.md`). The entries above came from this work.
