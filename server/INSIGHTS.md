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
Where: `src/platform/grounding.ts:6`, `src/platform/model-router.ts:15` (`Provider` has
no `openrouter`), `src/modules/reviews/service.ts:35`, `src/modules/polling/routes.ts:22`,
`src/modules/repos/service.ts:76`.

### 2026-09-16 — `review {all:true}` in tests runs seeded openrouter agents for real
`POST /pulls/:id/review {all:true}` also runs the seeded openrouter agents and any agent
created by earlier tests in the file. Without `overrides.llm.openrouter` they use the
real key from `~/.devdigest/secrets.json`; those runs stayed `running` for more than 10s
(real network, **unverified**). `waitForPrRuns` returns silently on timeout instead of failing.
Fix: mock every provider used in the file. The existing test "run all enabled agents" is affected.
Where: `test/reviews.it.test.ts:372` ("run all enabled agents"), `test/helpers/runs.ts:14`
(`waitForPrRuns`).

## Codebase Patterns

### 2026-09-15 — Queue state is in-memory only
The `jobs` table mirrors status but nothing re-enqueues `queued` jobs after a
restart. Reviews run fire-and-forget in-process; `reapStaleRuns()` cleans up
orphaned `running` runs on boot. Assumes a single API instance.
Where: `src/platform/jobs.ts:49` (`enqueue`), `src/modules/reviews/service.ts:94`
(`reapStaleRuns`, called from `src/app.ts:81`).

### 2026-09-16 — New fields on the `run_traces` jsonb contract must be `nullish`
`getRunTrace` returns the stored jsonb as-is, with no migration and no parse, so traces
saved before a field existed don't have its key. Declare added `RunStats`/`RunTrace`
fields `.nullish()` and have the UI treat `undefined` like `null` (e.g. `cost_usd` → "—").
Where: `src/vendor/shared/contracts/trace.ts:66` (`RunStats.cost_usd`),
`src/modules/reviews/repository/run.repo.ts:190` (`getRunTrace`).

### 2026-09-16 — `rollupSeverities` was written for the PR list and left unwired
`modules/pulls/status.ts` has shipped a tested `rollupSeverities()` since the list was
built, but `pulls/routes.ts` carried a comment saying the severity breakdown was
"intentionally not surfaced", so nothing imported it. It is now the core of
`modules/pulls/findings.ts` (latest review per PR → tally → `PrMeta.findings_by_severity`).
Before writing a new list rollup, check `status.ts` / `cost.ts` for one that already exists.
Where: `src/modules/pulls/status.ts:23` (`rollupSeverities`),
`src/modules/pulls/findings.ts:70` (`severityByPr`), `src/modules/pulls/routes.ts:116`.

### 2026-09-16 — "The PR's latest review" means a batch, never the newest review row
One click on Run Review starts every enabled agent, so `reviews ORDER BY created_at
DESC LIMIT 1` returns an arbitrary agent of that round — whichever finished last. On
PR #1 that was a clean Performance pass (0 findings, score 100) sitting next to a
General run with 1 CRITICAL + 2 WARNING + 1 SUGGESTION and score 38, so the list
showed "—" and 100 while the Agent-runs tab showed five findings. Anything the list
summarises must group by `agent_runs.batch_id` (what COST already did) and take the
worst/sum across the round: `latestBatchByPr` in `pulls/cost.ts` +
`latestRoundReviewIds` in `pulls/findings.ts`. The client needs the same rule, so
`ReviewRecord.batch_id` is now served by `GET /pulls/:id/reviews`.
Where: `src/modules/pulls/findings.ts:39` (`latestRoundReviewIds`),
`src/modules/pulls/routes.ts:151`, `src/modules/reviews/repository/review.repo.ts:75`.

## Tool & Library Notes

## Recurring Errors & Fixes

### 2026-09-16 — Local dev DB is ahead of this branch's migrations
The `devdigest_pgdata` volume has 17 rows in `drizzle.__drizzle_migrations`, but the
repo has 10 (the volume was migrated from an integration branch). `agent_runs` already
has `cost_usd`, `critical_count` and similar columns, so `pnpm db:migrate` fails with
`column "cost_usd" ... already exists`. Fresh databases (Testcontainers, `scripts/e2e.sh`)
migrate fine. Decide with the owner whether to reset or reconcile; never `down -v` without asking.
Where: `src/db/migrations/meta/_journal.json:79` (the `0010_colossal_shaman` entry).

### 2026-09-16 — Reconciling the diverged dev DB without a reset
Follow-up to "Local dev DB is ahead": `0010_colossal_shaman` was reconciled by hand, no data lost.
Apply the new SQL with `ADD COLUMN IF NOT EXISTS`, then `INSERT INTO drizzle.__drizzle_migrations
(hash, created_at)` with hash = `shasum -a 256 <file>.sql` and created_at = the journal `when`;
`pnpm db:migrate` then reports applied. The migrator only runs files whose `when` is newer than the
last applied `created_at`.
Where: `src/db/migrations/meta/_journal.json:79`, `src/db/migrations/0010_colossal_shaman.sql:1`.

## Open Questions

### 2026-09-15 — Failed background job may crash the process (unverified)
`JobRunner.enqueue()` returns `{ id, done }`; `done` rejects on failure but nobody
awaits or catches it. On Node 22 an unhandled rejection exits the process.
Repro idea: add a repo with a non-existent URL.
Where: `src/platform/jobs.ts:49` (`enqueue`), `src/modules/repos/service.ts:68` (an
unawaited call site).

### 2026-09-15 — `RunBus.complete()` doesn't release buffers
The docstring says "release buffers/emitters", but only the emitter is deleted;
`buffers`, `seq` and `completed` grow for the life of the process.
Where: `src/platform/sse.ts:76` (`complete`).

### 2026-09-16 — `findings` has no index on `review_id`
Postgres does not index a foreign key automatically and `0000_init.sql` adds only the FK
constraint, so every read of findings by review is a sequential scan. The PR list now runs
one `IN (latest review ids)` query per page load on top of the existing reviews/runs
queries. Fine at seed scale; if the table grows, add the index in `db/schema/reviews.ts`
and regenerate with `pnpm db:generate` (never hand-write the migration).
Where: `src/db/schema/reviews.ts:28`, `src/db/migrations/0000_init.sql:378`,
`src/modules/pulls/routes.ts:163` (the `IN (latest review ids)` read).

## Session Notes

### 2026-09-16 — Run Cost Badge (L01)
Brought per-run `cost_usd` back and added `agent_runs.batch_id` so the PR list can sum
the latest batch. The entries above came from this work.
Where: `src/modules/pulls/cost.ts:19` (`latestBatchCostByPr`), spec `../specs/01-run-cost-badge.md`.

### 2026-09-16 — PR list severity breakdown (L01)
Added `PrMeta.findings_by_severity` (mirrored into `client/src/vendor/shared`) and
`modules/pulls/findings.ts`, following the cost-badge precedent: contract + pure rollup
module + one extra IN-query in the route, no schema change.
Where: `src/modules/pulls/findings.ts:70` (`severityByPr`), spec `../specs/02-findings-severity.md`.

