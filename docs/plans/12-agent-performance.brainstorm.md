# Brainstorm: Agent Performance (one aggregation rule for the per-agent Stats read and the workspace dashboard)
Status: chosen: D1 option 3 (new agent-performance module, rows + pure aggregator), D3 K1; open questions 1-5 accepted as recommended (2026-10-21)
Spec: specs/16-agent-performance.md (SPEC-16, `Status: approved`)

Numbering: `ls docs/plans` ends at `11-export-to-ci`; plans are numbered sequentially, not by spec id, so this brief is `12` and the plan will be `docs/plans/12-agent-performance.md`.

Notation: **[F]** = fact (I opened it), **[I]** = inference. Nothing was run (read-only): `pnpm arch`, the SQL and the bundle build are untested.

## Problem

SPEC-16 fixes the behaviour and the wire. It states the observable equality (AC-83..AC-87) and leaves "how the two reads share one rule" open (`specs/16-agent-performance.md:88-89`). The decisions that remain:

1. **D1 (main)**: where the aggregation rule lives on the server (module and layer), whether it runs in SQL or in TypeScript, and how `GET /agents/:id/stats` and the workspace read both call it (AC-88, AC-89, NFR-1).
2. **D2**: workspace endpoint versus N per-agent calls (settled by the spec, see "Rejected upfront").
3. **D3**: the client shape: how the Stats tab and the global page share the period control, URL state, query hooks and the loading/error/empty states.

Done condition: the user picks an option for D1 and D3 and answers the open questions; `implementation-planner` then writes the plan. This brief writes no steps and no code. Cost stays at zero model calls in every option (NFR-1): all options read only stored runs and finding decisions.

## Context found

| # | Claim | F/I | Evidence |
|---|---|---|---|
| 1 | No route serves `GET /agents/:id/stats`. The `AgentStats` contract exists (15 fields incl. `findings_total`, `dismiss_rate`, `avg_findings_per_run`, `avg_latency_ms`, `findings_by_severity`, `trend`) and is used by no server or client code; it is only declared in both vendored copies and is inlined in the committed runner bundle (grep hit on `dismiss_rate` in `agent-runner/dist/index.js`). | F | `server/src/vendor/shared/contracts/observability.ts:116-146`, `server/src/modules/agents/routes.ts:25-40` (route list has no stats), `rg AgentStats` hits only the two vendor copies, `docs/plans/10-multi-agent-review.md`, the spec and `agent-runner/dist/index.js` |
| 2 | The spec's per-agent field list differs from the existing `AgentStats` (adds `runs_done/failed/cancelled`, `cost_partial`, `last_run_at`, cost per model, `avg_duration_ms`; drops severity, trend, `avg_latency_ms`). So the contract is reshaped, not just extended. | F (both lists) / I (reshape) | `specs/16-agent-performance.md:91-100`, `observability.ts:123-145` |
| 3 | `agent_runs` holds everything the dashboard needs: `agent_id` (set null on agent delete), `ran_at` (default now, written when the run is created in `running`), `model`, `duration_ms`, `cost_usd` (`double precision`, nullable), `status` (check: running/done/failed/cancelled), `source` (`local`/`ci`). Only index is `(pr_id, ran_at desc)`. | F | `server/src/db/schema/runs.ts:26-51`, `server/src/modules/reviews/repository/run.repo.ts:201-226` |
| 4 | Decisions: `findings.accepted_at` / `dismissed_at` (accept clears dismissed and the reverse, so a finding is in exactly one of three states). The link to a run is `reviews.run_id` (cascade) then `findings.review_id`. Seeded findings have no run. | F | `server/src/db/schema/reviews.ts:36,68-69`, `server/src/modules/reviews/repository/review.repo.ts:138,151` |
| 5 | `findings.kind` is not only `finding`: `secret_leak`, `lethal_trifecta`, `phantom`, `hook`, `out_of_scope` also exist. The spec does not say whether signal kinds count as decisions or pending. | F (enum) / I (gap) | `server/src/vendor/shared/contracts/findings.ts:17-24`, `specs/16-agent-performance.md:78-79` |
| 6 | CI runs reach `agent_runs` only when the server verified a result artifact; the row is written with `status: 'done'`, `source: 'ci'`, `ran_at` = workflow `run_started_at`, no review and no findings. So a CI run can never be failed/cancelled in `agent_runs`, and never adds decisions (EC-3 holds by construction). | F | `server/src/modules/ci/repository.ts:250-262`, `server/src/modules/ci/service.ts:373-384` |
| 7 | Eval runs live in their own tables, not in `agent_runs`; no eval code touches `agent_runs`. | F | `docs/0001-eval-runs-are-their-own-module.md` (Decision 3), `rg agentRuns` file list has no `modules/eval` |
| 8 | Precedent for "SQL returns plain rows, pure helper aggregates": `recentDoneRuns` (window query) feeds `estimateByAgent` (pure, unit-testable), served by `GET /review-estimates` from the reviews module. | F | `server/src/modules/reviews/repository/run.repo.ts:101-134`, `server/src/modules/reviews/multi-agent.ts:254-270`, `server/src/modules/reviews/multi-agent-service.ts:62-66`, `server/src/modules/reviews/routes.ts:202-209` |
| 9 | Precedent for a module that only reads tables other modules own: `smart-diff` (reads `agent_runs`, `reviews`, `findings`) and `pulls` (cost rollup over `agent_runs`). No depcruise rule forbids reading another module's tables, only another module's files. | F | `server/src/modules/smart-diff/repository.ts:11-16,42-45`, `server/src/modules/pulls/repository.ts:204-211`, `.claude/skills/onion-architecture/assets/dependency-cruiser.cjs:121-129` |
| 10 | Layering rules: services get ports via constructor (container getters, e.g. `evalDeps`, `ciDeps`); `routes.ts` may not import `db`; application code may not import `db`/adapters; modules meet only through `index.ts`/`types.ts` or container ports. A module is registered with one import + one entry. | F | `server/src/platform/container.ts:210-259`, `dependency-cruiser.cjs:64-72,96-105`, `server/AGENTS.md:35-37`, `server/src/modules/index.ts:19-41` |
| 11 | ADR 0001 rejected putting eval inside `reviews` because `reviews` is already large and the hot path. | F | `docs/0001-eval-runs-are-their-own-module.md` ("Alternatives rejected", row 2) |
| 12 | Workspace scoping idiom: `getContext(container, req)` in every handler, `workspace_id` predicate in every repository query. | F | `server/src/modules/_shared/context.ts:13-24`, `server/src/modules/eval/repository.ts:25-29` |
| 13 | Money: costs are `double precision`; drizzle `numeric` reads back as a string. Float addition is not associative, so "slices add up exactly to the total" (AC-50, AC-51) can fail by ~1e-16 if the total and the slices are summed in different orders. | F (column types, INSIGHTS) / I (consequence) | `server/src/db/schema/runs.ts:35`, `server/INSIGHTS.md:526-531` |
| 14 | Committed runner bundle `agent-runner/dist/` inlines `server/src/vendor/shared` and CI fails when the rebuilt bundle differs. Any contract edit in `vendor/shared` therefore needs `pnpm build` in `agent-runner` and a committed `dist/`. | F | `.github/workflows/agent-runner.yml:2-7,68-72`, `agent-runner/dist/index.js` (contains `dismiss_rate`) |
| 15 | Client: tab list is `TABS` in `AgentEditor/constants.ts` ("A later lesson adds Stats") plus `VALID_TABS` in the page; tab state is `?tab=` via `useSearchParamState`; multi-param changes need `useSearchParamsUpdate` (two setters in a row undo each other). | F | `client/src/app/agents/[id]/_components/AgentEditor/constants.ts:12-19`, `client/src/app/agents/[id]/page.tsx:15,30`, `client/src/lib/use-search-param-state.ts:5-62` |
| 16 | Client: hooks live in `src/lib/hooks/*`, keys in `src/lib/query-keys.ts`; `/ci-runs` is the closest precedent (period in the URL, `EmptyState`/`ErrorState`/`Skeleton` from `@devdigest/ui`, a probe query to tell "workspace empty" from "filter empty"). | F | `client/src/lib/hooks/ci.ts:1-60`, `client/src/app/ci-runs/_components/CiRunsView/CiRunsView.tsx:22-52`, `client/INSIGHTS.md:388` |
| 17 | Client scaffolding already exists: `messages/en/agentPerformance.json` (placeholder strings from the starter, not matching the spec's wording), nav label `shell.nav.agent-performance`, `Donut`/`Sparkline` chart kit, `NAV_LABEL_KEYS` for labels without a literal; the vendored `NAV` has a GLOBAL section with only `ci-runs`. No `Stats` message in `agents.json` besides `editor.tabs.stats`. | F | `client/messages/en/agentPerformance.json`, `client/messages/en/shell.json:30`, `client/src/vendor/ui/charts/Donut.tsx`, `client/src/components/app-shell/constants.ts:6-10`, `client/src/vendor/ui/nav.ts:41-44`, `client/messages/en/agents.json:55` |
| 18 | Design: `ScreenAgentPerf` has summary cards, a grid-row table with expand and a "Cost breakdown" of two donuts; deltas and sparkline are out of scope (spec non-goals). | F | `client/docs/design/src/screen_agentperf.jsx:1-64`, `specs/16-agent-performance.md:36-39` |
| 19 | While a new period loads the page must show no number (AC-57, AC-80), so a query option that keeps the previous period's data on screen (`keepPreviousData`/`placeholderData`) would break it. | I | `specs/16-agent-performance.md:178-179,206` |

## Options

Decision D1 (server). All options keep `routes.ts` thin, take `workspaceId` from `getContext`, and return the spec's wire spelling.

**Option 1. Baseline: two independent reads.** `GET /agents/:id/stats` in the `agents` module (its own SQL over `agent_runs`/`reviews`/`findings`) and a separate workspace read in another module; a DB parity test compares the two for a seeded workspace.
- Pros: smallest design step per endpoint; no new module.
- Cons: the rule (counted run, decision, priced run, partial, "Deleted agent", small sample, tie-break) exists twice; AC-83..87 hold only while a test says so; `agents` repository starts reading tables it does not own.
- Risks: silent drift on the next rule change [I]; two workspace predicates to forget (NFR-2).

**Option 2. Extend the `reviews` module, rows + pure aggregator.** Add a repository function next to `recentDoneRuns` that returns one row per counted run (agent, model, status, cost, duration, `ran_at`, accepted/dismissed/pending counts), a pure `stats.ts` beside `multi-agent.ts`, and the two routes in `reviews/routes.ts` (as `/review-estimates` is).
- Pros: reviews owns `agent_runs`, `reviews` and `findings`; `reviewDeps.agents` already gives agent names (fact 8, 10); no new module registration.
- Cons: grows the module ADR 0001 calls hot and large (fact 11); routes `/agents/:id/stats` and `/agent-performance` sit in a review routes file.
- Risks: later review-engine work and this read share a file and a test suite [I].

**Option 3. New module `agent-performance`, rows + pure aggregator.** `modules/agent-performance/` with `routes.ts` (both endpoints), `service.ts`, `ports.ts` (a `RunStatsStore` and an agent-list port), `repository.ts` (one query: counted runs of the workspace in the period, optional `agent_id`, each with its decision counts via a grouped subquery on `reviews`/`findings`), and pure helpers (`period.ts`, `aggregate.ts`). The per-agent figures and the workspace entries come from one pure function over the same rows; the per-agent route runs the query with the agent predicate and calls the same function. Registered in `modules/index.ts`; wired in `container.ts` like `evalDeps`.
- Pros: one rule in plain TypeScript, unit-tested without Docker; costs summed in one place (integer units, total derived from the same additions, fact 13); isolated vertical slice, deletable; same shape as the `estimateByAgent` precedent.
- Cons: transfers one row per counted run, so the cost grows with run count and with an uncapped custom range (spec non-goal "no cap", `specs/16-agent-performance.md:44`); a new module (about 7 files).
- Risks: unbounded range on a very large table is a memory/time risk, unmeasured [I]. `agent_runs` has no `(workspace_id, ran_at)` index (fact 3); an index would be a `pnpm db:generate` migration, only if needed.

**Option 4. New module, SQL pre-aggregation + pure merge.** Same module as Option 3, but the repository returns grouped rows: per (agent, model, status) the counts and sums, plus decision counts per agent; the pure helper merges groups into entries, totals, slices and the most-active agent.
- Pros: result size depends on agents x models, not on runs; scales with an uncapped range.
- Cons: the rule is split across SQL (what is counted, what is a decision, `max(ran_at)`, sums) and TypeScript (rates, partial flag, ranking); more types (group rows, merge); the grouped SQL needs a Docker test.
- Risks: `sum(double)` in SQL then summed again in TypeScript gives a second addition order (fact 13) [I]; "avg duration over done runs only" and "priced run" counts must be carried as separate columns.

**Option 5. New module, SQL-only aggregation.** One parameterized SQL statement (CTEs, `FILTER`, `GROUP BY`) computes entries, totals, slices; the service only shapes JSON.
- Pros: fastest at any volume; the same statement serves both reads.
- Cons: business rules (small sample, tie-break, deleted-agent grouping, partial flags) live in SQL inside the repository, against the skill's "business rule goes in a pure helper" row; only `.it.test.ts` can test them; the most complex drizzle code.
- Risks: harder to change and review; float sums inside SQL (fact 13) [I].

Decision D3 (client), after D1. Both options keep pages thin, hooks in `src/lib/hooks`, keys in `query-keys.ts`, strings in `messages/en/agentPerformance.json` (rewritten to the spec's wording), no `fetch` in components.

**K1. Shared building blocks from day one.** A pure `period` module (parse/serialize/validate `period`, `from`, `to`; fallback 30 days; the AC-8 validation) and one `PeriodControl` component (select + two date fields + validation message) in `src/components/period-control/`; shared presentational pieces (cost label "DevDigest estimate", partial mark, small-sample mark, "—" formatting) beside them. Two hooks `useAgentPerformance(period)` and `useAgentStats(agentId, period)` in `src/lib/hooks/agent-performance.ts` with keys `keys.agentPerformance.*`. The page (`app/agent-performance/`) and the Stats tab (`AgentEditor/_components/StatsTab/`) are separate consumers. The custom-range draft is local state; the URL changes only when the range is valid (AC-9), written with `useSearchParamsUpdate`. The "View" link carries `?tab=stats&period=...`. No `keepPreviousData` (fact 19). The workspace response carries "has runs outside the period", so no probe query is needed (contrast fact 16).
- Pros: AC-68 "same rules" holds by construction; a11y (NFR-3) built and tested once.
- Cons: one more shared folder to name and test.

**K2. Colocate and duplicate (wait for a third consumer).** Period logic and the control live in the page folder; the tab gets its own copy.
- Pros: nothing shared to design.
- Cons: the spec already has two consumers with identical rules (AC-68); drift in validation or fallback is likely [I].

## Rejected upfront

| Option | Rule broken | Source |
|---|---|---|
| D2: client composes the dashboard from N calls to `GET /agents/:id/stats` | AC-89 and the spec's sequence diagram require a workspace read; N calls cannot produce the "Deleted agent" row (null `agent_id`, nothing to call), the workspace-wide cost-by-model slices, nor the "has counted runs outside the period" flag; the aggregation would then also live in the client | `specs/16-agent-performance.md:61-67,98-100,219` |
| Stats tab reads the workspace endpoint and picks its row (one hook only) | Contradicts the spec's flow (Tab calls `GET /agents/:id/stats`, AC-88); would leave AC-88 as an unused endpoint and load every agent for one | `specs/16-agent-performance.md:65-66,218` |
| Period state kept in component state only | AC-10, AC-70 require the period to survive a reload (URL) | `specs/16-agent-performance.md:114,196` |
| Stats tab imports the page's route-private components (or the reverse) | Features do not import each other; shared code goes to `components/` | `frontend-architecture` skill, principle 3; `client/AGENTS.md:19-22` |
| A new table or column that stores aggregates (rollup table) | Spec non-goal: store no new data; every figure computed on read | `specs/16-agent-performance.md:40-42,260` |
| Hand-editing a migration for an index | Migrations come only from `pnpm db:generate` | `AGENTS.md:70` |
| A model call to summarize or label agents | NFR-1: zero model calls and tokens | `specs/16-agent-performance.md:246` |

## Criteria & weights

D1 (weights fixed before scoring; scores 1-5, higher is better; max 130):
- Single rule and parity of the two reads, AC-83..89 (5)
- Fit with onion layering and project conventions (5)
- Scope and effort (3)
- Testability (4)
- Scale and exact money sums, AC-50/51, uncapped range (3)
- Risk and reversibility (3)
- Security surface, workspace scoping NFR-2 (3)

D3 (max 90): Fit with the frontend rules (5) · Same period behaviour in both views, AC-68 (5) · Effort (3) · Testability (3) · Accessibility built once, NFR-3/4 (2).

## Scoring matrix

D1:

| option | Parity (5) | Fit (5) | Effort (3) | Test (4) | Scale/money (3) | Risk (3) | Sec (3) | weighted total |
|---|---|---|---|---|---|---|---|---|
| 1 two independent reads | 1 | 3 | 3 | 2 | 3 | 2 | 3 | 61 |
| 2 extend `reviews`, rows + pure | 5 | 3 | 4 | 5 | 2 | 3 | 4 | 99 |
| 3 new module, rows + pure | 5 | 5 | 3 | 5 | 2 | 4 | 4 | **109** |
| 4 new module, SQL groups + merge | 4 | 5 | 2 | 4 | 5 | 3 | 4 | 103 |
| 5 new module, SQL only | 5 | 2 | 2 | 2 | 5 | 2 | 4 | 82 |

Evidence (one line each):
- Option 1: Parity 1, the rule is written twice and AC-83..87 rest on a test [I]. Fit 3, each endpoint is layered but `agents` would read tables it does not own (fact 9). Effort 3, two simple queries. Test 2, needs a parity DB test plus two sets. Scale 3. Risk 2, drift on any rule change. Sec 3, two predicates.
- Option 2: Parity 5, one pure function over one row shape (fact 8). Fit 3, reviews grows although ADR 0001 flags it (fact 11). Effort 4, deps and context already there (facts 10, 12). Test 5, pure unit tests. Scale 2, one row per run. Risk 3, hot file. Sec 4, one repository function, existing workspace idiom.
- Option 3: Parity 5, as Option 2. Fit 5, a vertical slice with ports through the container and a read-only repository (facts 9, 10). Effort 3, about 7 new files, registration and container wiring. Test 5. Scale 2, as Option 2; money summed in one place (fact 13). Risk 4, isolated and deletable. Sec 4.
- Option 4: Parity 4, predicates in SQL and arithmetic in TypeScript, still one path for both reads. Fit 5. Effort 2, group and decision queries plus merge types. Test 4, merge is pure, grouping needs Docker. Scale 5. Risk 3, two addition orders (fact 13). Sec 4.
- Option 5: Parity 5, one statement. Fit 2, rules in the repository ring (skill table "business rule goes in a pure helper"). Effort 2. Test 2, all via `.it.test.ts`. Scale 5. Risk 2. Sec 4.

D3:

| option | Fit (5) | Same behaviour (5) | Effort (3) | Test (3) | A11y once (2) | weighted total |
|---|---|---|---|---|---|---|
| K1 shared building blocks | 5 | 5 | 3 | 4 | 5 | **81** |
| K2 colocate and duplicate | 3 | 2 | 4 | 3 | 2 | 50 |

Evidence: K1 Fit 5, `components/` for cross-cutting chrome and `lib/hooks` for queries (`AGENTS.md:41-42`, `client/AGENTS.md:20-22`). K1 Same 5, one validator and one control. K2 Fit 3, AHA allows waiting, but here the second consumer is already specified. K2 Same 2, two copies of the AC-8/AC-11 rules [I].

## Sensitivity

D1 (totals recomputed):
- Parity 5 to 4: O1 60, O2 94, O3 104, O4 99, O5 77. To 6: 62, 104, 114, 107, 87. Winner O3 both ways.
- Fit 5 to 4: O1 58, O2 96, O3 104, O4 98, O5 80. To 6: 64, 102, 114, 108, 84. Winner O3.
- Scale 3 to 4: O3 111, O4 108. To 5: O3 113, O4 113 (tie). To 6: O3 115, O4 118. **The winner flips to Option 4 only when Scale weighs 6 (more than parity), and ties at 5.**
- Test 4 to 3: O3 104, O4 99. To 5: 114, 107. Winner O3.
D3: Same-behaviour 5 to 4: K1 76, K2 48. To 6: 86, 52. Winner K1.

## Recommendation

**D1: Option 3** (new `agent-performance` module, one SQL query for per-run rows, one pure aggregator used by both reads). It is the only option that is top on parity, layering and testability together, and the run volume of a local single-workspace tool is small [I]. Flips to Option 4 if the user expects large run history and wants the uncapped custom range to stay fast (Scale weight 6), or if a first measurement shows the row query is slow on the real database. Flips to Option 2 if the user prefers no new module (cost: score 99, the reviews module grows).
**D2: one workspace endpoint** (settled by the spec). **D3: K1.**

## For the planner

**Modules and files (verify each path before planning)**
- Server, new: `server/src/modules/agent-performance/` (`routes.ts`, `service.ts`, `ports.ts`, `repository.ts`, pure `period.ts` and `aggregate.ts`, `constants.ts` for the small-sample threshold 10 and the default period); one import and entry in `server/src/modules/index.ts`; a repository/deps getter in `server/src/platform/container.ts` (pattern `evalRepo`/`evalDeps`, `container.ts:210-259`); agent names through a structural port satisfied by `AgentsRepository.list`.
- Server, edit: `server/src/vendor/shared/contracts/observability.ts` (reshape `AgentStats`, add the workspace-performance contract and the period query schema), then `./scripts/shared-contracts.sh sync` for the client copy.
- Runner bundle: the contract edit changes `agent-runner/dist/` (fact 14), so the plan needs `pnpm build` in `agent-runner` and a committed `dist/` or CI fails.
- Client, new: `client/src/app/agent-performance/` (thin `page.tsx` plus `_components/`), `AgentEditor/_components/StatsTab/`, `client/src/components/period-control/`, `client/src/lib/hooks/agent-performance.ts` (export from `hooks/index.ts`), keys in `client/src/lib/query-keys.ts`.
- Client, edit: `AgentEditor/constants.ts` (`TABS`), `AgentEditor.tsx`, `client/src/app/agents/[id]/page.tsx` (`VALID_TABS`), `client/src/vendor/ui/nav.ts` (GLOBAL item) and `client/src/components/app-shell/constants.ts` (`NAV_LABEL_KEYS`), `client/messages/en/agentPerformance.json` (replace placeholder strings with the spec's wording), `client/messages/en/agents.json`.

**Constraints**
- Contracts: edit the server copy, sync, CI runs `check` (`AGENTS.md:56-60`). No migration is needed by the spec; an index on `agent_runs (workspace_id, ran_at)` would be a `db:generate` migration, only after measuring.
- Onion (`pnpm arch`): service takes ports not the container; the repository returns plain row types; `routes.ts` has zod schemas for `params`/`query`/response; errors as `AppError` (`NotFoundError` for AC-90, validation 422 for AC-91).
- Counted-run rule in one place: `workspace_id`, `ran_at` in the window, `status in (done, failed, cancelled)`, any `source`; decisions only from reviews with a `run_id`; eval never present (fact 7).
- Money: one summing rule so slices equal the total (fact 13); null cost = no data, never 0; every cost label "DevDigest estimate" (AC-54).
- Client: no `keepPreviousData` (fact 19); `useSearchParamsUpdate` for multi-param URL changes; tests via `renderWithIntl`; Tabs render buttons, not `role="tab"` (`client/INSIGHTS.md:543`); `renderWithIntl` logs a time-zone fallback if dates are formatted (same entry).
- Agent and model names rendered as text only (spec untrusted inputs).

**INSIGHTS entries that apply**
- `server/INSIGHTS.md:526-531` (numeric vs double for cost), `server/INSIGHTS.md:65-70` (new wire fields `nullish` where older rows lack them), `client/INSIGHTS.md:388` (the empty-state probe on CI Runs), `client/INSIGHTS.md:543` (Tabs and `renderWithIntl` test notes), root `INSIGHTS.md:92-98` (contract sync). I opened only the passages cited.

**Open questions for the user**
1. Custom range and time zone: the spec fixes the bounds as the browser's start-of-day and end-of-day (`specs/16-agent-performance.md:72-74`) but lists `from` and `to` only as dates (`:91-95`); the server does not know the browser time zone. (options: 1. the client sends `from`/`to` as full ISO instants it computed itself, the server validates "start after end" / malformed / 2. the client sends dates plus an IANA `tz` parameter and the server computes the bounds, which needs a spec amendment)
2. Which finding kinds count as decisions and as pending: only `kind = 'finding'`, or also `secret_leak`, `lethal_trifecta`, `phantom`, `hook`, `out_of_scope` (fact 5)? (options: 1. all kinds, as the spec wording reads / 2. only `finding`, which needs a spec amendment)
3. The existing `AgentStats` contract has fields the spec drops (`findings_total`, `dismiss_rate`, `avg_findings_per_run`, `avg_latency_ms`, `findings_by_severity`, `trend`). (options: 1. replace the schema with the spec's field list, nothing consumes the old one / 2. keep the old fields as `nullish` for compatibility)
4. Spec OQ-1, OQ-2, OQ-3 are still open; the planner will use their stated defaults (rows by Runs most first and only Accept rate sorts; "Deleted agent" is never most active; "Unknown model" slice) unless you say otherwise. (options: 1. accept the defaults / 2. change one of them)
5. "1 day" and "30 days" are rolling windows ending when the figures are read, so a Stats tab opened a minute after the dashboard can differ by a run (AC-83..87 hold for the same read time only). (options: 1. accept, as the spec reads / 2. the server echoes the resolved window and the "View" link carries it, which needs a spec amendment)
6. Confirm the D1 choice, or choose Option 4 if a large run history is expected. (options: 1. Option 3 / 2. Option 4 / 3. Option 2)

**Project skills that apply**: `onion-architecture`, `frontend-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `react-testing-library`, `security` (text rendering of agent and model names), `engineering-insights`.

## Sources

- Spec and repo (opened): `specs/16-agent-performance.md`, `AGENTS.md`/`CLAUDE.md` (identical), `server/AGENTS.md`, `client/AGENTS.md`, `docs/plans/11-export-to-ci.brainstorm.md`, `docs/0001-eval-runs-are-their-own-module.md`, `server/INSIGHTS.md` and `client/INSIGHTS.md` (grep passages only), `server/src/db/schema/runs.ts`, `server/src/db/schema/reviews.ts`, `server/src/vendor/shared/contracts/observability.ts`, `server/src/vendor/shared/contracts/findings.ts`, `server/src/modules/{agents,reviews,ci,eval,pulls,smart-diff}/**` files cited above, `server/src/modules/index.ts`, `server/src/modules/_shared/context.ts`, `server/src/platform/container.ts`, `.claude/skills/onion-architecture/assets/dependency-cruiser.cjs`, `.github/workflows/agent-runner.yml`, `scripts/shared-contracts.sh`, client files cited above, `client/messages/en/agentPerformance.json`, `client/docs/design/src/screen_agentperf.jsx`.
- No external sources: the choice is internal and no web page was needed (Step 2: external research skipped).

## Not found

- Run volume: how many `agent_runs` a real workspace holds and how long the row query takes on it. The Option 3 versus 4 flip depends on it; not measured (read-only).
- Whether `pnpm arch` accepts the new module as designed: not run.
- Whether the `agent-runner` bundle rebuild is byte-reproducible when only `vendor/shared` changes: the workflow comment claims so (`.github/workflows/agent-runner.yml:2-7`); I did not build.
- Whether `findings.kind` signal kinds should count as decisions (question 2).
- Which tab key the "View" link should target (`stats`): inferred from `agents.json:55` ("Stats"); no existing code uses it.
