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

### 2026-09-18 — A repo URL is a filesystem boundary, not just input
`parseRepoUrl` output becomes `<cloneDir>/<owner>/<name>`, and `SimpleGitClient.clone()` deletes a
destination that has no `.git`. The old unanchored regex let `https://github.com/../x` through, i.e.
an `rm -rf` of a sibling of the clone dir, and cloned the raw user URL (any host). Now three layers:
`RepoInput` regex (both contract copies), the anchored `GITHUB_URL_REGEX`, and `insideDir()` in the
adapter. The clone job rebuilds the URL with `githubCloneUrl(owner, name)` and ignores `payload.url`.
Where: `src/adapters/git/simple-git.ts:140`, `src/modules/repos/constants.ts:21`.

### 2026-09-18 — Transactions: build the repository on `tx`
A repository typed on `DbOrTx` (pool or open transaction) runs unchanged inside `db.transaction`:
`this.db.transaction((tx) => work(new AgentsRepository(tx)))`. Not hypothetical: before the row lock,
three concurrent `PUT /agents/:id` produced versions `[2, 2, 3]` and dropped a snapshot
(`onConflictDoNothing`). Read-then-write paths lock with `.for('update')` inside the transaction.
Where: `src/db/client.ts:15`, `src/modules/agents/repository.ts:162`.

### 2026-09-18 — GitHub auth for git: a per-command header, never the remote URL
`SimpleGitClient` sends the PAT as `-c http.https://github.com/.extraheader=AUTHORIZATION: basic …`
(the same form `actions/checkout` uses) on clone/fetch only. Clones made before this kept the token
in `origin`; `scrubOrigin()` strips it on the next clone/fetch/sync, so an old clone is clean after
one Refresh. Private-repo fetches depend on the token being in Settings, not in the clone.
Where: `src/adapters/git/simple-git.ts:90`.

### 2026-09-18 — Jobs on one repo are serialised by `repoJobKey`
Clone, index, refresh and resync all register with `{ serializeBy: repoJobKey }` (`repo:<repoId>`),
so a Refresh can't re-clone a directory the indexer is reading. A timed-out attempt aborts
`ctx.signal` and holds the key until the handler settles, at most `ABORT_GRACE_MS` (30 s) — the
repo-intel pipeline ignores the signal today, so its overlap is bounded, not impossible. A job
waiting for its key holds a p-queue slot.
Where: `src/platform/jobs.ts:31`, `src/modules/_shared/jobs.ts:1`.

### 2026-09-19 — Where a shared contract goes so both rings can import it
A file named `ports.ts` counts as core for depcruise — including `modules/_shared/ports.ts`, which
holds `JobQueue`, `RunBusPort`, the job kinds and `repoJobKey`. An adapter may not import any
`modules/**` file, so a constant both an adapter and a module need goes to `vendor/shared`
(`contracts/code-index.ts`: `SUPPORTED_EXT`, walk limits). Another module's types come through its
`types.ts`/`index.ts` only (`agents/types.ts`, `repos/types.ts`), which re-export from its `ports.ts`.
Where: `src/modules/_shared/ports.ts:1`, `src/vendor/shared/contracts/code-index.ts:1`.

### 2026-09-19 — Wiring lives in container getters: `reviewDeps`, `repoIntelDeps`
A service takes a plain deps object; `Container` builds it (`container.reviewDeps`,
`container.repoIntelDeps`) and routes call `new XService(container.xDeps)`. Tests build the same
object from fakes and real pure adapters (`test/helpers/repo-intel.ts`), so no test casts a fake
Container or patches a private field. The parse concurrency (`cpus() - 1`) is decided in the
container, not in the pipeline.
Where: `src/platform/container.ts:119`, `test/helpers/repo-intel.ts:11`.

### 2026-09-19 — `parseUnifiedDiff` lives in reviewer-core
The parser was an adapter file but is pure and is what grounding depends on, so it moved to
`reviewer-core/src/diff.ts`; the git adapter, the mocks and the review module import it from
`@devdigest/reviewer-core`. reviewer-core's own vitest config aliases `@devdigest/reviewer-core` to
its `src`, because its tests borrow the server mocks, which import it through that alias.
Where: `../reviewer-core/src/diff.ts:1`, `../reviewer-core/vitest.config.ts:12`.


## Tool & Library Notes

### 2026-09-17 — The "routes don't touch drizzle" rule fails on the starter's own routes
`CLAUDE.md` says modules are layered routes → service → repository, so the obvious ESLint
rule is `no-restricted-imports` for `drizzle-orm` under `src/modules/**/routes.ts`. Turning
it on reports `pulls`, `settings` and `workspace`, which all query the DB from the handler.
The rule is written up but left out of the config until those three grow a repository —
enabling it means rewriting starter code, not fixing a violation you introduced.
Where: `eslint.config.mjs:33`, `src/modules/pulls/routes.ts:3`.


### 2026-09-18 — Layer rules live in the onion-architecture skill, with a known-violations baseline
The 2026-09-17 entry left layer rules out of eslint because starter code breaks them. They now
run as dependency-cruiser from the skill; `known-violations.json` (40 entries) hides existing
debt, so only new violations fail. Rejected: eslint `no-restricted-imports` has no baseline, so
it would fail on day one. To move it into CI later, point `depcruise` at the same config + baseline.
Where: `../.claude/skills/onion-architecture/assets/dependency-cruiser.cjs:57`.

### 2026-09-18 — dependency-cruiser quirks when writing rules for this package
`octokit` is ESM-only and stays unresolved (path = bare `octokit`), so package rules must match
`(^|node_modules/)pkg(/|$)`. Nested quantifiers such as `(\.pnpm/[^/]+/)?` fail with "unsafe regular
expression". `depcruise src/modules/x` follows imports into other modules and reports their
violations too; to scope a report, run on `src` and grep the path.
Where: `../.claude/skills/onion-architecture/assets/dependency-cruiser.cjs:27`.

### 2026-09-18 — Supersedes "Layer rules live in the onion-architecture skill, with a known-violations baseline"
Still true: the rules live in the skill, not in eslint/CI. What changed: the baseline now has 45
entries, not 40. Application code is now fail-closed. `application-allowed-packages` allows only
zod, graphology, p-queue and `crypto`/`path`/`util`, so `fs/promises` and `os` in `repo-intel` were
added to the baseline as debt. An eval found the previous SDK list let an unlisted `@slack/web-api`
import through. A new pure library must be added to `APPLICATION_PKGS`.
Where: `../.claude/skills/onion-architecture/assets/dependency-cruiser.cjs:47`, rule at `:76`.

### 2026-09-18 — Batched upsert in Drizzle: `excluded.<column>` and one row per key
`onConflictDoUpdate` with `set` values written as the sql template `excluded.title` updates each row from its own
VALUES tuple. Postgres rejects a batch that hits the same conflict key twice ("cannot affect row a
second time"), so dedupe by the key first — GitHub's paginated PR list can repeat a PR.
Where: `src/modules/pulls/repository.ts:50`.

### 2026-09-19 — Supersedes "Layer rules live in the onion-architecture skill, with a known-violations baseline"
The baseline is gone: the layering debt was paid down from 45 entries to zero (pulls, settings, repos,
agents, reviews, repo-intel), so `pnpm arch` runs the skill's config without `--ignore-known` and any
violation fails CI. The rules still live in the skill (`assets/dependency-cruiser.cjs`), not in eslint.
Two things the rules do not see: application code importing `platform/resilience.ts` /
`platform/run-logger.ts`, and `RepoIntelService` taking the concrete `RepoIntelRepository` class.
Where: `package.json:15`, `../.claude/skills/onion-architecture/assets/dependency-cruiser.cjs:1`.


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

### 2026-09-18 — Supersedes "Failed background job may crash the process (unverified)"
Verified, then fixed: `test/jobs.test.ts` saw the `done` rejection reach `unhandledRejection` for a
fire-and-forget `enqueue()`. `enqueue` now attaches `done.catch(() => {})` — the failure is already
persisted as `status='failed'`, and a caller that awaits `done` still gets the rejection.
Where: `src/platform/jobs.ts:102`.

### 2026-09-18 — Supersedes "`RunBus.complete()` doesn't release buffers"
`complete()` now drops a run's buffer, seq and completed flag after `COMPLETED_RETENTION_MS` (5 min).
The flip side: a late SSE subscriber to a run the bus forgot would wait forever, so
`ReviewService.runStream()` checks `agent_runs` first — unknown run → 404, finished and not on the
bus → the stream closes at once (the persisted trace has the log). Tests inject a fresh bus via
`ContainerOverrides.runBus`.
Where: `src/platform/sse.ts:90`, `src/modules/reviews/service.ts:80`.

### 2026-09-18 — Reconciling a new migration with the ahead-of-branch local DB
The local volume already had several objects of `0011_low_stark_industries` with identical definitions
(`findings_review_idx`, `agent_runs_status_ck`, …) from the integration branch, and `db:migrate` runs
a file in one transaction, so the first "already exists" rolls it all back. What worked: feed the
file to `psql -v ON_ERROR_ROLLBACK=on` (savepoint per statement) inside BEGIN/COMMIT together with
the `__drizzle_migrations` insert (hash = `shasum -a 256`, created_at = journal `when`), after checking
that every "already exists" object has the same definition. `pnpm db:migrate` is then a no-op.
Where: `src/db/migrations/0011_low_stark_industries.sql:1`.


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

### 2026-09-18 — onion-architecture skill
Added `.claude/skills/onion-architecture/`. It maps Onion rings onto `routes`, `service` and
`repository`, gives practices per tool and code patterns, and ships a runnable depcruise
check. The two Tool & Library entries above came from this work.
Where: `../.claude/skills/onion-architecture/SKILL.md:18`.

### 2026-09-18 — Phase 1 of the skills audit (security and crash fixes)
Repo URL hardening, job rejection fix, `API_HOST` (default `localhost`) and Postgres on
`127.0.0.1`, 5xx messages hidden outside development, test-connection saves a key only after it
passes, SSE 404 + RunBus retention. Plan: `~/.claude/plans/sunny-squishing-token.md`.
Where: `src/server.ts:29`.

### 2026-09-18 — Phase 2 of the skills audit (data integrity)
Indexes/CHECKs/FKs (migration 0011), transactions (agents, PR refresh, repo-intel replace*), batched
PR/settings upserts and agent-name lookup, JobRunner abort + per-repo serialisation + shutdown, git
token via header, GitHub errors → AppError, workspace scoping for runs/skills/repo-intel.
Where: `src/platform/jobs.ts:1`.

### 2026-09-19 — Phase 4 (server): layering debt to zero
Onion slices for pulls, settings, repos, agents, reviews and repo-intel; dead code and re-export
shims removed; response schemas on pulls/settings/repos/workspace; unit tests with fakes for the
services. Client refactors are tracked separately in `../client/INSIGHTS.md`.
Where: `src/modules/pulls/service.ts:1`.
