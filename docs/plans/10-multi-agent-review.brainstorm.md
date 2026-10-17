# Brainstorm: Multi-Agent Review (agent-id list on the review request, parallel runs, results page with groups)
Status: chosen: option 1
Spec: specs/14-multi-agent-review.md (SPEC-14, `Status: approved`)

## Problem

SPEC-14 fixes the behaviour and the wire: one review request can carry a list of agent ids, the agents run in parallel, and a new page shows every review batch of a PR (one column per agent run, Columns / Tabs, "Where agents disagree", totals, run selector, View trace). The user fixed these decisions already (not re-opened): optional agent-id list on the existing `POST /pulls/:id/review`, parallel execution, the page shows ALL batches (a one-agent batch is one column), latest run on entry plus a selector of up to 10 runs, sidebar item plus PR header link, groups by file plus overlapping inclusive ranges computed at read time, View trace reuses the existing drawer, no Learn button.

Hard constraints from the user: a SIMPLE implementation (reuse over new code, no new model call); at most 3-5 implementer groups; implementers write no tests; `ci/` and `agent-runner/` unchanged; worktree A (this feature) merges first and worktree B reads attribution (finding -> review `agent_id`/`run_id` -> `agent_runs.source`), so that chain must stay intact.

This brief compares ways to **build** it. The real choices are: (1) what a "multi-agent run" is in storage, (2) where the run-trace drawer lives, (3) how the executor goes parallel, (4) where groups and conflicts are computed. (2), (3) and the smaller derivations have one sensible form under every storage option, so they are written once as **common decisions** and are not scored; (1) and (4) split the scored options.

Tags: **fact** = seen in a file or page in this run; **inference** = my conclusion from facts.

## Context found

Spec and the batch concept
- **fact** The spec leaves "how a batch maps onto the stored parent-run record" to the brainstorm and fixes only AC-11 (store the parent for every run started by a request) (`specs/14-multi-agent-review.md:76-79,116`). OQ-1 default: a stored run with no batch is its own multi-agent run with one column; OQ-2 default for a deleted agent: stored name else "Unknown agent" (`:250-251`).
- **fact** `ReviewService.runReview` already makes ONE `randomUUID()` per request and passes it as `batchId` to every `createAgentRun`, then returns run ids and fires the executor without awaiting (`server/src/modules/reviews/service.ts:154-175`). It is the only caller of `createAgentRun` (rg over `server/src`).
- **fact** `agent_runs.batch_id` is a nullable uuid with no FK, "null for older and CI runs" (`server/src/db/schema/runs.ts:36-37`). The `status` CHECK allows only `running|done|failed|cancelled` (`runs.ts:52-55`).
- **fact** `multi_agent_runs` is a stub: `id`, `workspace_id`, `pr_id` (FK cascade), `ran_at` (`runs.ts:67-76`); nothing in `server/src` reads or writes it (rg finds only the barrel `db/schema.ts:39,86`).
- **fact** The PR list cost and findings rollup and Smart Diff all define "the PR's latest round" as the runs sharing `agent_runs.batch_id` (`server/src/modules/_shared/latest-round.ts:1-8`, `modules/pulls/cost.ts:4`, `server/INSIGHTS.md:81-92,369-378`). **inference** a second grouping key for the same notion (a `multi_agent_run_id`) would give two answers to "which runs belong together" for old and new data.
- **fact** `GET /pulls/:id/reviews` already returns, per review, `run_id`, `agent_id`, `agent_name`, `batch_id`, verdict, summary, score and findings with eval markers (`server/src/vendor/shared/contracts/review-api.ts:30-47`, `server/src/modules/reviews/service.ts:197-216`). `RunSummary` (all runs of a PR incl. failed, with state, error, duration, tokens, cost, score) has NO batch id (`vendor/shared/contracts/trace.ts:111-132`), but `listRunsForPull` already selects the whole `agent_runs` row (`modules/reviews/repository/run.repo.ts:40-69`). **inference** the whole read model composes from these two existing reads plus one pure grouping helper; the only genuinely new query is the per-agent estimate (AC-26).
- **fact** The starter already ships unused contracts `AgentColumn`, `Conflict`, `ConflictTake`, `MultiAgentRun` in `server/src/vendor/shared/contracts/observability.ts:35-86` (exported at `vendor/shared/index.ts:30`): column `status` is `done|failed|running` (`:41`), a conflict has a single `line` (`:68`), no groups, tokens, error or totals. rg finds no consumer in `server/src`, `server/test`, `mcp/src` or `client/src` outside the vendored copies. **inference** they can be replaced in place with the spec's shape (SPEC-14 `:85-93`); nothing to migrate.

Start path
- **fact** `RunRequest` is `{ agentId?, all? }` (`vendor/shared/contracts/platform.ts:302-306`); the route body is optional-preprocessed and rate-limited to 10/min (`modules/reviews/routes.ts:21,31-36`). `resolveTargets` throws `NotFoundError` for an unknown or other-workspace `agentId` and runs a named agent whatever its `applies_to` (`service.ts:54-77`). **inference** AC-2/AC-4/NFR-3 are the existing `agentId` branch applied to a list, resolved fully before any run row is created.
- **fact** `ReviewRunResponse` is `{ pr_id, runs[], reviews[], skipped_agents[] }` (`review-api.ts:69-74`). The `mcp` package type-checks `RunSummary` and `ReviewRecord` against narrow local schemas with `Assignable<Server, Local>` (`mcp/src/api/schemas.ts:140-146`). **inference** adding optional or new fields is safe for `mcp`; changing an existing field's type is not.

Executor
- **fact** Shared preparation (diff load, `excludeFromReview`, intent once) runs before the per-agent loop (`modules/reviews/run-executor.ts:98-143`); the loop is a sequential `for` (`:145-184`). Preparation failure runs `failAll`, which marks every run failed with `Failed to load PR diff: <msg>`, `durationMs: 0` (`:77-105`). **inference** AC-8, AC-10 and NFR-2 already hold; only the loop changes for AC-7.
- **fact** `runOneAgent` catches every failure, persists status, error and trace, completes the bus and rethrows (`run-executor.ts:397-421`); the loop catches the rethrow (`:175-183`). Per-run duration is measured from `runOneAgent` start (`:200,335`), i.e. after preparation. The prep logger fans each event out to every run's own buffer (`platform/run-logger.ts:46-52`; `run-executor.ts:67-72`); the bus keeps a buffer and sequence per run id (`platform/sse.ts:25-60`). **inference** a parallel loop shares only read-only values (`diff`, `intentBlock`, `scopeFilter`); logs and sequence numbers are per run.
- **fact** `p-queue ^8.0.1` is a server dependency (`server/package.json:42`) used by `JobRunner` with concurrency 3 (`platform/jobs.ts:69`). **fact** p-queue's `concurrency` defaults to `Infinity` and a failing task rejects only its own `add()` promise (p-queue readme, URL under Sources). **inference** a capped queue below the agent count would break AC-7 ("each starting without waiting for another"); at `concurrency = jobs.length` it equals `Promise.allSettled`.
- **fact** `reviews/service.ts:116-124` `cancelRun` calls `bus.cancel(runId)` and then `bus.complete(runId)`; `RunBus.complete` deletes the run from its `cancelled` set (`platform/sse.ts:91-97`). **inference (not run)** a cancel may not be seen by a running agent at its next checkpoint, so EC-4 ("its column shows cancelled; the others continue") rests on the DB row only, as today. Not new, but the new page makes it visible.

State "queued"
- **fact** Rows are created with `status = 'running'` at request time (`run.repo.ts:147-159`), so no stored value says "waiting for preparation" (AC-48). **fact** `mcp` maps any status other than `running|done|cancelled` to `failed` (`mcp/src/wait.ts:14-21`) and the PR page polls on `status === "running"` (`client/src/lib/hooks/reviews.ts:47`). **inference** a new persisted `queued` status would be read as `failed` by `mcp` (spec: "`mcp` keeps working", `:43-44`) and would hide queued runs from `activeRunsForPull` (`run.repo.ts:28`) and the boot reaper (`:121-130`).
- **fact** The RunBus keeps each run's events while it runs (`sse.ts:58-80`) and `RunEvent` has an optional `data` field (`sse.ts:58,62`). **inference** a typed first-agent-event can mark "agent started", so `queued` = `running` row without that marker, with no schema change.

Client
- **fact** `RunTraceDrawer` takes `runId`, `agentName`, `prNumber`, `findings`, `running`, `onClose` and imports only `@/…` and its own folder (`client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.tsx:1-27`, rg of its files); only the PR page mounts it (`pulls/[number]/page.tsx:18,202`). `FindingCard` and `FindingCaseEditor` are props-driven and used by `FindingsPanel` and `DiffTab` of that route only (rg).
- **fact** The lint rule only forbids shared code importing `src/app` (`client/eslint.config.mjs:42-52`); route-to-route `_components` imports are not enforced (`.claude/skills/frontend-architecture/references/devdigest.md`, "Open questions" 3). **fact** The rule is: start in the route, promote to `src/components/<kebab-name>/` on the second consumer (same file, "Applying the generic rules"; root `AGENTS.md` Naming). The Multi-Agent page is that second consumer for all three components (AC-61/62 need the finding card and the eval-case editor, AC-73 the drawer).
- **fact** Neither `Drawer` (`client/src/vendor/ui/kit/Drawer.tsx:4-40`) nor `RunTraceDrawer` handles Escape (rg `Escape` in `vendor/ui` hits only the palette and `SearchableSelect`). NFR-5 requires "closes with Escape". **inference** a small keydown effect is a required addition to the drawer.
- **fact** `useRunEvents` opens one `EventSource` per run id (`client/src/lib/hooks/reviews.ts:244-300`), and the drawer opens its own for its run (`RunTraceDrawer.tsx:46`). **fact** Without HTTP/2 a browser allows 6 SSE connections per domain (MDN, URL under Sources); `server/src/app.ts:48` builds plain `Fastify({...})` and a grep of `app.ts` for `http2` finds nothing. **inference** one SSE stream per column plus the drawer would hit the cap for more than 5 agents (AC-57 expects more than 5 columns).
- **fact** `usePrRuns` already polls every 4 s while any run is running (`reviews.ts:41-48`); `useFindingAction` invalidates `keys.pr.reviews(prId)` only (`reviews.ts:204-222`); every query key comes from `lib/query-keys.ts` (`:13-30`). `activeKeyFor` already maps `/multi-agent` to the key `multi-agent` (`client/src/components/app-shell/helpers.ts:30`) and `shell.json:29` already holds the label, but `NAV` has no such item (`client/src/vendor/ui/nav.ts:25-39`). `runs.json` already holds a `page.*` block for this screen (`client/messages/en/runs.json:118-141`), with text that predates the spec ("fan-out via p-queue").

Upstream reference implementations (evidence only; the spec text I read does not itself cite them, the user's message does)
- **fact** `cf47df3f` (`feat(reviews): multi-agent review`): adds `agent_runs.multi_run_id` uuid FK -> `multi_agent_runs` (`ON DELETE set null`) plus an index (migration `0012_productive_cannonball.sql`), a separate `POST /pulls/:id/multi-agent-run` route, runs the agents with `Promise.allSettled` (`run-executor.ts` diff), and moves `RunTraceDrawer` to `client/src/components/RunTraceDrawer` (git rename list).
- **fact** `4f2c4131`: `conflicts.ts` (sweep over `[start_line,end_line]`, drops non-`done` columns from participants, requires 2+ participants), `multi-agent.repo.ts` (`createMultiAgentRun`, `attachRunsToMultiAgentRun`, per-agent estimate that averages ALL done runs), and a `LEARNINGS.md` entry that parallel worktrees share ONE Postgres, so a `db:migrate` in one worktree changes the schema of the others.
- **inference** both reference designs chose the "new link column" shape; neither handles old batches without a parent row, neither uses the last-5 window the spec requires (AC-26), and their conflict rule differs from SPEC-14 (single-agent runs and `failed` takes). Take the sweep idea, not the rules.

Worktree B
- **fact** Branch `emdash/export-to-ci-0b66o` has no commit beyond this branch's HEAD (`git log HEAD..emdash/export-to-ci-0b66o` is empty). **inference** B's read of the attribution chain cannot be checked from code; the rule is to leave `insertReview` (agent id, run id) and `agent_runs.source` as they are (`run-executor.ts:317-327`, `run.repo.ts:157`).

## Options

### Common decisions (same answer under every option unless an option says otherwise)

**D1 - Parallel executor (axis 3).** Replace the `for` at `run-executor.ts:145` by `await Promise.allSettled(jobs.map(...))` over the existing per-job body (the upstream choice too). Alternatives: `new PQueue({ concurrency: jobs.length })` (identical behaviour, extra object) or a fixed cap such as 3 (breaks AC-7 above the cap, see Context). Effects: error isolation is already inside `runOneAgent`; SSE is unchanged (`/runs/:id/events` is per run); cost per run is unchanged and the batch's wall time becomes the slowest agent; N concurrent provider calls raise the 429 risk, which EC-1 already covers by isolation. The fan-out is bounded by the workspace's agents once ids are de-duplicated (**inference**).

**D2 - States, totals and banner without a schema change.**
- `queued` is derived on read: the run row is `running` and the run's bus buffer has no "agent started" event; the executor emits one typed info event (`data: { phase: 'agent-started' }`) at the top of `runOneAgent`. Alternatives: a persisted `queued` status (rejected, see below) or a `started_at` column (exact and persistent, but a migration plus a new store call that the existing executor test fake does not implement - `server/test/reviews-service.test.ts:253,298`).
- Wall time (AC-38) = the largest `duration_ms` among the batch's finished runs: parallel agents start together right after preparation. For batches made before this feature (sequential) it is an underestimate; say so in the UI note or accept it (open question 5).
- The AC-54 banner: all columns `failed` with an error starting with a shared constant for the preparation prefix (`Failed to load PR diff:`, `run-executor.ts:105`); define it once in `reviews/constants.ts` and use it in both places.

**D3 - Drawer location (axis 2).** `git mv` `RunTraceDrawer`, `FindingCard` and `FindingCaseEditor` to `client/src/components/run-trace-drawer/`, `finding-card/`, `finding-case-editor/`; fix the imports in `pulls/[number]/page.tsx`, `FindingsPanel` and `DiffTab` and move their tests. Add the Escape handler. The alternative is `import … from "@/app/repos/[repoId]/pulls/[number]/_components/…"` from the new route: one line per component and not blocked by lint, but a route importing another route's private folder (against "features do not import each other"; the `no-restricted-imports` message itself says to move shared code into `src/components`).

**D4 - Live updates (axis 3, SSE).** The page polls its read endpoint every 4 s while any column is `queued` or `running` (the `usePrRuns` pattern) and refreshes the PR list rollups when the last one settles; only the open drawer streams SSE (one connection). Per-column SSE is the alternative; it hits the 6-connection cap above 5 agents (**inference**). Accept/dismiss uses `useFindingAction`; add the new multi-agent key under `keys.pr.*` and invalidate it there so AC-63 holds both ways.

**D5 - Endpoints and contracts (under every server-computing option).** Contracts: `RunRequest.agentIds` (`min(1)`, de-duplicated; precedence `agentIds` > `agentId` > `all`), `ReviewRunResponse.multi_agent_run_id`, a `MultiAgentFinding = FindingRecord.extend({ agent_id, agent_name, run_id })` (leaves `FindingRecord` and the `mcp` drift check untouched), `MultiAgentRun` (columns with state `queued|running|done|failed|cancelled`, groups with per-agent takes, conflicts, totals), a list item `{ id, ran_at, agent_count }`, and an estimate row. Routes in the reviews module: `GET /pulls/:id/multi-agent-runs` (up to 10, newest first), `GET /pulls/:id/multi-agent-runs/:runId` (or `/latest`), `GET` estimates. The grouping is a pure helper beside the service (application ring); a `MultiAgentService` built from `ReviewDeps` keeps `ReviewService` small.

### Option 1 - The batch IS the parent (no new table writes, no migration) + server computes - recommended
**How.** `multi_agent_run_id` on the wire = `agent_runs.batch_id`; the response of `POST /pulls/:id/review` returns the `batchId` it already generates. The read service takes the PR's runs (`listRunsForPull`, extended internally with `batch_id` and `source`) and reviews (`reviewsForPull`, which already carries agent name, eval markers and `batch_id`), groups runs by `batch_id` in memory, and treats a run with `batch_id = null` as its own batch whose id is the run's id (OQ-1 default; run ids and batch ids are both uuids and cannot collide). Groups/conflicts/totals come from a pure helper. `multi_agent_runs` stays a stub. One new store query: the last-5-done-runs estimate per agent (window function), averaged in a pure helper.
**Pros.** Zero schema change, so no shared-dev-DB drift between worktrees A and B and nothing to roll back. One definition of "which runs belong together" shared with the PR list and Smart Diff. Old and new batches go through the same code, including OQ-1. Smallest server diff. B's attribution chain is not touched.
**Cons.** A multi-agent run has no row of its own (no stored name or lineage for later features). Reading by id needs the PR in the path (no index on `batch_id` alone; fine for per-PR scans, **inference**). `queued` and the wall time lean on D2's derivations.
**Risks.** An in-memory-derived `queued` is correct only for a single API instance (already assumed, `server/AGENTS.md` Gotchas). `source = 'ci'` runs have a null batch and would show as one-column runs unless filtered (open question 3).

### Option 2 - Fill the stub and add a link column (the upstream shape) + server computes
**How.** On each request insert one `multi_agent_runs` row, add `agent_runs.multi_agent_run_id` (nullable FK, `ON DELETE set null`, index) via `pnpm db:generate`, write it from `createAgentRun`, return its id. Reads group by the link column; batches made before the feature (they have `batch_id` but no parent) still need a runtime fallback, because a backfill would be a hand-written migration (rejected below).
**Pros.** A real parent entity (own `ran_at`, workspace and PR scope, a place for future fields); matches the table's evident purpose and both references.
**Cons.** Two grouping keys (`batch_id` for the PR list and Smart Diff, the new FK for this page) that must agree; a legacy fallback path anyway; an extra insert, a port method, repository functions, a migration and index; parents outlive deleted runs (an empty parent must be filtered).
**Risks.** Migration on the shared dev DB: a `db:migrate` in one worktree changes the others (`4f2c4131:server/LEARNINGS.md`; local precedent `server/INSIGHTS.md:532-570`), and B may generate a migration with the same number, so the second merger must regenerate.

### Option 3 - Hybrid: write a `multi_agent_runs` row whose id equals the batch id (no new column)
**How.** On each request insert `multi_agent_runs(id = batchId, workspace_id, pr_id)`; no FK, no migration; the run side stays `batch_id`. The list is read from the parent table; batches with no parent row (all earlier ones) are appended by the Option 1 grouping.
**Pros.** No schema change and an explicit parent record; cheap list query.
**Cons.** Same two-path read as Option 2 (table plus fallback); the id equality is an unenforced convention (no FK); the parent row duplicates what `min(ran_at)` and a count already give; orphan parents after run deletion.
**Risks.** An extra write per request that is never read by anyone else; the two sources can drift.

### Option 4 - Baseline: thin server, the client composes the page
**How.** Server: only `agentIds`, the returned batch id, D1, the estimate endpoint, and `batch_id` added to `RunSummary`. Client: join `usePrRuns` and `usePrReviews` by `batch_id`/`run_id`, compute groups, conflicts and totals in a client helper, import the drawer and cards across routes.
**Pros.** Least server code; no new read endpoints.
**Cons.** Contradicts the approved wire (the response carries columns, groups, conflicts and totals - spec `:88-93`; AC-12 is about "a multi-agent run response"), so it needs a spec amendment; the business rule lives in the client; `queued` and the preparation banner cannot be derived without server help; no reuse for other consumers; the cross-route imports go against the frontend rules.
**Risks.** Re-approval of the spec; two queries must stay consistent per poll.

## Rejected upfront
| Option or variant | Rule broken | Source |
|---|---|---|
| Hand-written backfill migration that gives old batches a `multi_agent_runs` row (Option 2/3 legacy handling) | "`server/src/db/migrations/` - generated by `pnpm db:generate`; never hand-edit" | root `AGENTS.md`, Do not touch |
| Persisted `queued` value in `agent_runs.status` | breaks `mcp` (unknown status -> `failed`) and the "running"-keyed active list and reaper; spec says `mcp` keeps working | `mcp/src/wait.ts:14-21`, `run.repo.ts:28,121-130`, spec `:43-44` |
| `p-queue` with a fixed cap below the agent count | AC-7 (each run starts without waiting for another) | spec `:112` |
| A separate `POST /pulls/:id/multi-agent-run` route (the upstream shape) | the user's decision: optional list on the existing route | user message; spec `:104-106` |
| Storing groups, conflicts or estimates | spec Goals: "stores no derived data" | spec `:28-30` |
| Editing `client/src/vendor/shared` by hand for the new contracts | "Edit the server copy, then `./scripts/shared-contracts.sh sync`" | root `AGENTS.md`, Cross-package rules |
| A model call to write "did not flag" reasons or to cluster findings by text | spec non-goals and NFR-1 (0 model calls) | spec `:35-38,217` |

## Criteria & weights
Fixed before scoring.
| # | Criterion | Weight | Why |
|---|---|---|---|
| c1 | Fit with architecture, conventions and the approved spec | 5 | onion layers, `batch_id` semantics, client structure rules, wire contract |
| c2 | Scope and effort | 5 | the user's first constraint is SIMPLE, at most 5 implementer groups |
| c3 | Risk and reversibility | 4 | shared dev DB, merge order with B, legacy data, mcp |
| c4 | Testability | 3 | pure helpers, fakes that existing tests build by hand |
| c5 | Security surface | 3 | NFR-3: ids resolve inside the workspace only |
| c6 | UX / product fit | 3 | AC-36..58 behaviours incl. reload mid-run, old batches, banner |

## Scoring matrix
Scores 1-5 per criterion, then weighted total (max 115).

| Option | c1 (x5) | c2 (x5) | c3 (x4) | c4 (x3) | c5 (x3) | c6 (x3) | Weighted total |
|---|---|---|---|---|---|---|---|
| 1 - batch is the parent | 5 | 5 | 4 | 4 | 4 | 4 | **102** |
| 2 - stub + link column | 3 | 2 | 2 | 3 | 4 | 4 | 66 |
| 3 - hybrid (id = batch id) | 3 | 3 | 3 | 3 | 4 | 4 | 75 |
| 4 - client composes (baseline) | 2 | 4 | 3 | 3 | 4 | 2 | 69 |

Evidence per score (one line each)
- Option 1: c1 reuses the one batch notion that the PR list, Smart Diff and `latest-round.ts` already use and keeps grouping on the server as the spec says; c2 no schema, no new table writes, read model from two existing reads (`service.ts:197`, `run.repo.ts:40`); c3 nothing to migrate or roll back, but `queued` and old-batch wall time are derived/approximate (D2); c4 pure helpers testable, but a new store method touches the hand-built fakes (`test/reviews-service.test.ts:253`, `server/INSIGHTS.md:320`); c5 the PR is resolved with `getPull(workspaceId, …)` and agents with `getById(workspaceId, …)` before any read (`service.ts:73,143`); c6 meets all ACs, with the wall-time caveat for old batches.
- Option 2: c1 two grouping keys beside `batch_id` (`latest-round.ts:1-8`); c2 migration, FK, index, parent insert, ports, repository, plus the legacy fallback; c3 shared-DB drift and same-number migration risk (`4f2c4131:server/LEARNINGS.md`), orphan parents; c4 ordinary; c5 the parent row carries `workspace_id`, a direct check; c6 all ACs.
- Option 3: c1 id convention without a constraint; c2 no migration but an extra write plus the same two-path read; c3 no schema change, drift and orphans possible; c4 ordinary; c5 `workspace_id` on the parent; c6 all ACs.
- Option 4: c1 contradicts spec `:88-93` and puts a business rule in the client; c2 less server code, more client code, still needs the estimate endpoint; c3 spec re-approval, two queries per poll; c4 pure client helper is testable; c5 no new read surface; c6 `queued` and the preparation banner cannot be derived client-side.

## Sensitivity
- Option 1 scores at least as high as every other option on every criterion (it dominates), so no change of any weight, including moving the top weights c1 or c2 by +-1, changes the winner. Concretely: c2 5 -> 4 gives 97 / 64 / 72 / 65; c1 5 -> 4 gives 97 / 63 / 72 / 67 (options 1 / 2 / 3 / 4).
- The ranking of the runners-up is also stable (3 > 4 > 2 in both runs).
- The one input that is judgement, not fact, is c3 for Option 1 (derived `queued`): scored 3 instead of 4 it still wins (98).

## Recommendation
**Option 1**, with common decisions D1-D5. The `batch_id` the service already generates per request is exactly "all agent runs started by one review request"; reusing it satisfies AC-11 with no migration, keeps one notion of "round" across the PR list, Smart Diff and this page, and treats old batches, "Run all" and one-agent batches through the same code. Compute groups, conflicts and totals on the server in a pure helper; make the executor parallel with `Promise.allSettled`; move the drawer, finding card and case editor to `src/components/`; poll the read endpoint instead of one SSE stream per column.

What would flip it
- You want a multi-agent run to own data later (a name, a frozen cost snapshot, a "re-run of" link) or other modules to join on it -> Option 2.
- `queued` or the wall time must be exact and survive a restart -> keep Option 1 and add `agent_runs.started_at` (one additive migration, one store call, one fake to update).
- Worktree B starts giving CI-ingested runs a `batch_id` with another meaning -> the "batch = review request" assumption fails; prefer Option 2's explicit link.
- A spec amendment moves grouping to the client -> Option 4.

## For the planner

**Affected modules (paths).**
- server contracts: `server/src/vendor/shared/contracts/platform.ts` (`RunRequest`), `review-api.ts` (`ReviewRunResponse`), `observability.ts` (replace the unused stubs), then `./scripts/shared-contracts.sh sync`; `mcp` type-checks against `RunSummary`/`ReviewRecord`, so change those additively only.
- server reviews: `routes.ts`, `service.ts` (`resolveTargets`, `runReview`), `run-executor.ts` (loop, started-marker event, shared prep-error constant), new pure helper(s) beside the service (groups and conflicts, estimates, totals), new `multi-agent-service.ts`, `ports.ts` + `repository.ts` + `repository/run.repo.ts` (estimate query; batch id on the runs read), `constants.ts`. `platform/container.ts` and `reviewDeps` need no change if only `ReviewDeps` collaborators are used.
- client: new route `client/src/app/repos/[repoId]/multi-agent/` (suggested: `?pr=<number>&run=<id>&trace=<runId>` in the query string, matching AC-13 "no PR in the URL"); moved components under `src/components/`; `lib/hooks/` (new hook file or `reviews.ts`), `lib/query-keys.ts`, `vendor/ui/nav.ts` (+ `NAV_LABEL_KEYS` if the label comes from a feature namespace), `PrDetailHeader` (link), `RunReviewDropdown` (replaced by an agent checklist with checkboxes, AC-31..33), `messages/en/` (a new feature file or the existing `runs.json` `page.*` block, whose old text must be reconciled), `client/README.md` route map, `server/README.md` API map.

**Constraints.**
- Contracts: edit the server copy only, then sync; the client copy has `.js` stripped (`client/AGENTS.md` Gotchas).
- Migrations: Option 1 needs none. If one appears, `pnpm db:generate` only; worktrees A and B share one dev DB.
- Onion: grouping and estimate maths are pure (application ring); SQL only in the repository behind a `ReviewStore` method; routes stay thin; run `pnpm arch`.
- `ci/`, `agent-runner/`: untouched. Attribution: do not change `insertReview` fields (`agentId`, `runId`) or `agent_runs.source`.
- Rate limit of `POST /pulls/:id/review` stays 10/min (NFR-4).
- Estimates must use the last 5 done runs per agent (AC-26); the reference implementation averages all done runs, so do not copy it.
- Conflict rule per SPEC-14 `:80-83`: only agents whose run is `done` count as "did not flag"; failed/cancelled -> take "failed", queued/running -> "running". When one agent has several findings in a group, pick deterministically (highest severity, then earliest line) for AC-66 and for the severity comparison; a one-agent batch can never be a conflict (EC-10).
- `OQ-2`: the column name for a deleted agent is "Unknown agent" unless the stored trace name is read (`run_traces.trace.config.agent`); the default needs no extra read.
- No new test files (user rule). Adding a method the executor or service calls breaks hand-built fakes in `server/test/reviews-service.test.ts` at runtime, and `pnpm typecheck` does not see `server/test/**` (`server/INSIGHTS.md:320-331`): see open question 4.
- Client: pages stay thin; hooks only in `src/lib/hooks`; keys from the factory; strings from message files; `rowClickProps` for clickable rows (`client/AGENTS.md`). A start mutation must not be fired from a mount effect (Strict Mode hang, `client/INSIGHTS.md:558-565`); navigate to the results only after the list refetch (`:156-160`). Reuse `FindingCard` directly in Tabs mode; if `FindingsPanel` is reused its window-level j/k/a/d handler already skips targets inside `[role="dialog"]` (`:358-363`).

**INSIGHTS entries to read first.** `server/INSIGHTS.md:58-63` (queue and runs are in-memory, single instance), `:81-92` and `:369-378` (latest round = batch), `:320-331` (typecheck blind to tests), `:431-434` (eval markers per pull read - the finding cards in Tabs mode need them), `:532-570` (dev DB vs migrations), `:593-606` (shared pre-work and un-mocked providers in integration tests; this feature adds no new model call). `client/INSIGHTS.md:127-133` (SSE contract), `:135-139` (invalidate through the key factory), `:156-160`, `:358-363`, `:382-385` (sidebar label from a feature namespace), `:497-500`, `:558-565`. Root `INSIGHTS.md:262` (brainstorm stays one agent).

**Skills to apply.** `onion-architecture` (server layering, ports, `pnpm arch`), `zod` (new contracts, `min(1)` list, optional fields), `fastify-best-practices` (route schemas, params), `drizzle-orm-patterns` (only the windowed estimate query, a raw `sql` window), `frontend-architecture` (promote on second consumer, route layout, hooks and keys), `react-best-practices` and `next-best-practices` (polling, derived state, search-param state, no effects for derivable values), `security` (workspace-scoped ids; model text rendered as text or sanitised Markdown only, spec `:244-247`), `engineering-insights` (record the queued-derivation and cancel findings).

**Suggested split into 5 implementer groups** (tests: none, per the user; each group ends with the package type-checking):
| Group | Content | Package | Runs after |
|---|---|---|---|
| G1 | Contracts (request list, response id, replace observability stubs) + `shared-contracts.sh sync`; `resolveTargets` for `agentIds`; `runReview` returns the batch id; executor `Promise.allSettled` + started-marker event + prep-error constant | server | - |
| G2 | Read model: pure grouping/conflict/totals/estimate helpers, `MultiAgentService`, store method for estimates and batch id on the runs read, three GET routes | server | G1 (contracts) |
| G3 | Client foundation: move drawer + finding card + case editor, Escape handler, hooks, query keys, nav item, messages, PR header link | client | G1 (synced contracts) - may run in parallel with G2 |
| G4 | Configure run screen + PR page agent checklist (shared checklist component, estimate display, start and navigate) | client | G3 |
| G5 | Results view: route page, meta row, run selector, Columns/Tabs, "Where agents disagree", drawer wiring, polling, banner | client | G3 (parallel with G4 once G3's hooks exist) |

**Open questions for the user.**
1. Which option? (1. batch id is the parent, recommended / 2. fill the stub with a link column / 3. hybrid, parent id = batch id / 4. thin server, client composes - needs a spec amendment)
2. The cards in Tabs mode need `FindingCard` and the eval-case editor as well as the drawer: move all three to `src/components/` (recommended), or import them across routes? (1. move all three / 2. cross-route imports, no moves)
3. Runs with `source = 'ci'` have no batch: show them as one-column runs (OQ-1 default) or only batches started by a review request? (1. local only, recommended / 2. all, per OQ-1)
4. Existing unit tests build hand-written fakes; a new store call can turn them red though no new test is written. May implementers add the missing stub methods to the existing fakes? (1. yes, stubs only / 2. no, leave to a later test pass)
5. Wall time of batches made before this feature (they ran one after another): accept "slowest agent" as an approximation, or add `agent_runs.started_at` (one migration)? (1. accept / 2. add `started_at`)

## Sources
Files (all opened in this run): `specs/14-multi-agent-review.md`; `server/AGENTS.md`; `client/AGENTS.md`; `server/INSIGHTS.md`; `client/INSIGHTS.md`; root `INSIGHTS.md` (headings); `server/src/modules/reviews/{service,run-executor,routes,ports,deps,helpers,repository}.ts`, `reviews/repository/{run,review}.repo.ts`; `server/src/db/schema/runs.ts`; `server/src/platform/{sse,run-logger,jobs,container,app}.ts`; `server/src/modules/_shared/{latest-round,ports,context}.ts`; `server/src/modules/agents/ports.ts`; `server/src/vendor/shared/contracts/{platform,review-api,trace,observability,findings}.ts`; `mcp/src/wait.ts`, `mcp/src/api/schemas.ts`; client `src/lib/hooks/reviews.ts`, `src/lib/query-keys.ts`, `src/vendor/ui/nav.ts`, `src/vendor/ui/kit/Drawer.tsx`, `src/components/app-shell/helpers.ts`, `messages/en/runs.json`, the PR page and its `RunTraceDrawer`, `FindingCard`, `FindingCaseEditor`, `FindingsPanel`, `RunReviewDropdown`, `PrDetailHeader`; `.claude/skills/{onion-architecture,frontend-architecture}`; `docs/plans/09-eval-pipeline.brainstorm.md` (format); `server/test/reviews-service.test.ts` (fakes). Git: `cf47df3f` and `4f2c4131` (`git show`, `git grep`), `emdash/export-to-ci-0b66o` (`git log`, `git diff --stat`).
URLs fetched:
- https://developer.mozilla.org/en-US/docs/Web/API/EventSource - limit of 6 SSE connections per browser and domain without HTTP/2 (primary source).
- https://github.com/sindresorhus/p-queue/blob/main/readme.md - `concurrency` defaults to `Infinity`; a rejected task rejects only its own `add()` (primary source; the repo pins `^8.0.1`, the page is the current readme, so a version difference is possible).

## Not found
- The spec file I read does not itself mention the two upstream commits; they come from the user's message and I read them with `git show`.
- Worktree B's code: its branch has no commits yet, so how it reads `agent_runs.source` could not be checked.
- Whether CI-ingested runs (B) will carry a `batch_id`; today `source = 'ci'` rows are said to have a null batch (`runs.ts:36`) but nothing in `server/src` writes them.
- Runtime behaviour: I did not run the API, so the cancel path (`sse.ts:94` vs `service.ts:116-124`), the 4 s poll cadence and the SSE connection cap are inferences, not observed.
- A hard maximum on agents per request: neither the spec nor the code bounds it beyond the workspace's agent count.
- A design file for the route path: `client/docs/design/artboards.md` names the screens (N4 `ma-cols`, `ma-tabs`, `e-ma`) but I did not read their source (`screen_multiagent.jsx`) for layout details; the planner should, before the client groups.

## User decisions (2026-10-17)

- Option 1 chosen: the batch is the parent run (`agent_runs.batch_id`), no migration, groups computed by a pure server helper.
- Q2: move `RunTraceDrawer`, `FindingCard` and `FindingCaseEditor` to `src/components/`; add Escape to `Drawer`.
- Q3: only batches started by a review request; runs with `source='ci'` (null batch) are not shown.
- Q4: implementers may add stub methods to the existing hand-built test fakes (no new tests).
- Q5 (not asked, default applied): accept the "slowest agent" wall-time approximation for batches made before this feature; no `started_at` migration.
