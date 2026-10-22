# Development Plan: Agent Performance dashboard and agent Stats tab
Status: implemented
Spec: specs/16-agent-performance.md
Brainstorm: docs/plans/12-agent-performance.brainstorm.md
Execution mode: multi-agent (chosen by the user 2026-10-21)

## Goal
Add a read-only `agent-performance` server module (one SQL row query + one pure aggregator serving `GET /agents/:id/stats` and `GET /agent-performance`), the global Agent Performance page and the agent editor's Stats tab, sharing one period model and one period control (brief: D1 option 3, D3 K1).
In scope: shared contracts (+ client sync, + agent-runner `dist/` rebuild), server module, client page, Stats tab, sidebar item, i18n.
Out of scope: deltas, sparkline, other Stats panels, repo filter, range cap, any new table/column/migration, any model call (spec Non-goals, `specs/16-agent-performance.md:33-44`). New tests: ON (the user turned them on 2026-10-21; implementers get `tests: on` and write the `Tests (new)` lines of their steps).

Decisions fixed by the user (brief answers 1-5): client sends `from`/`to` as full ISO instants it computes from local dates; every `findings.kind` counts as a decision/pending; `AgentStats` is replaced by the spec's field list; spec OQ-1..3 defaults (rows by Runs desc, only Accept rate sorts; "Deleted agent" never most active; null model = "Unknown model" slice); rolling 1d/30d windows.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | 1-2 | shared contracts (server canonical + client copy) + agent-runner bundle | - | Exported from `@devdigest/shared`: `StatsPeriod`, `StatsPeriodQuery`, `AgentStats` (reshaped), `ModelCost`, `AgentCost`, `MostActiveAgent`, `AgentPerformance`. Baseline line filled in. |
| G2 | 3-5 | server: `modules/agent-performance` (pure → repository → service/routes/wiring) | G1; may run in parallel with G3-G5 | Routes `GET /agents/:id/stats?period=&from=&to=` → `AgentStats`, `GET /agent-performance?…` → `AgentPerformance`; `accept_rate` is a 0..1 ratio. |
| G3 | 6-8 | client: period lib, hooks/keys, shared `components/agent-stats`, sidebar item | G1 | `parseStatsPeriod`, `statsPeriodToSearch`, `statsPeriodToApiQuery`, `SMALL_SAMPLE_DECISIONS`, `isSmallSample` (`src/lib/stats-period.ts`); `useAgentPerformance(sel)`, `useAgentStats(agentId, sel)`; `PeriodControl`, `useStatsPeriod`, `EstimateLabel`, `PartialMark`, `SmallSampleMark` from `@/components/agent-stats`. |
| G4 | 9-12 | client: `/agent-performance` route | G3 | View link format `/agents/<id>?tab=stats&<period params>` (G5 must accept `tab=stats`). |
| G5 | 13 | client: agent editor Stats tab | G4 | Last group: set the spec `Status: implemented` (or leave `approved` if partial). |

## Skills behind the steps
| Path glob or area | Skills | Why they matter here |
|---|---|---|
| `server/src/vendor/shared/**` | zod, onion-architecture | Contracts are core; query schema parsed at the edge |
| `server/src/modules/agent-performance/**`, `server/src/platform/container.ts` | onion-architecture, fastify-best-practices, drizzle-orm-patterns, security | Ports via constructor, thin routes with zod schemas, `sql`-template-only SQL, workspace scoping |
| `client/src/lib/**`, `client/src/components/agent-stats/**`, `client/src/app/agent-performance/**`, `client/src/app/agents/[id]/**` | frontend-architecture, react-best-practices, next-best-practices, security | Hooks in `lib/hooks`, derive don't store, Suspense around `useSearchParams`, names rendered as text |
| `agent-runner/dist/**` | none (package AGENTS.md) | Generated bundle, rebuilt by `pnpm build` |
| tests (only if turned on) | react-testing-library | `renderWithIntl` + `userEvent` |
| `INSIGHTS.md` entries | engineering-insights | Filing "Insights to record" |
(The practices are in the steps. The implementer loads a skill only where a step says `load:`.)

## Steps
### Step 1 — Reshape `AgentStats`, add the period query and workspace contracts (shared)
- Files: modify `server/src/vendor/shared/contracts/observability.ts` · modify `client/src/vendor/shared/contracts/observability.ts` (only via the sync script)
- Change: Before any edit, run the Baseline commands (Verification) and write the result into the `Baseline:` line. Replace the block at `observability.ts:116-146` (`StatPoint` is used nowhere else, delete it) with: `StatsPeriod = z.enum(['1d','30d','custom'])`; `StatsPeriodQuery = z.object({ period: StatsPeriod.default('30d'), from: z.string().datetime({ offset: true }).optional(), to: …same }).superRefine(…)` adding an issue when `period==='custom'` and `from` or `to` is missing, or `from > to` (compare `Date.parse`). No "future" check on the server: a custom `to` is the end of today, later than now. `ModelCost = { model: string|null, cost_usd: number }`; `AgentStats = { agent_id: string|null, agent_name: string|null, runs, runs_done, runs_failed, runs_cancelled, accepted, dismissed, pending (int), accept_rate: number|null (0..1), total_cost_usd: number|null, avg_cost_usd: number|null, cost_partial: boolean, avg_duration_ms: number|null, last_run_at: string|null, cost_by_model: ModelCost[] }` (null id+name only for the "Deleted agent" entry); `AgentCost = { agent_id: string|null, agent_name: string|null, cost_usd: number }`; `MostActiveAgent = { agent_id: string, agent_name: string, runs: int }`; `AgentPerformance = { totals: { runs, total_cost_usd|null, cost_partial, accepted, dismissed, accept_rate|null, most_active: MostActiveAgent|null }, agents: AgentStats[], cost_by_agent: AgentCost[], cost_by_model: ModelCost[], has_runs_outside_period: boolean }`. Export each `type X = z.infer<…>`. Then from the repo root run `./scripts/shared-contracts.sh sync`.
- Covers: AC-91
- Rules / skills: zod, onion-architecture
- Practices: wire fields stay `snake_case` (`AGENTS.md:50`); edit only the server copy, then sync (`AGENTS.md:60`, `INSIGHTS.md:94-98`); query schema lives in contracts like `CiRunsQuery` (`server/src/vendor/shared/contracts/eval-ci.ts:429`); `.refine` on a route schema has precedent (`server/src/modules/agents/routes.ts:78-86`); null means "no data", never 0 (spec `:101`).
- Tests (new): `server/test/contracts.test.ts` (extend) — AC-91 (unknown period, missing/malformed custom date, from > to rejected)
- Existing tests to update: none
- Done when: `./scripts/shared-contracts.sh check` exits 0; `cd server && pnpm typecheck` and `cd client && pnpm typecheck` and `cd mcp && pnpm typecheck` exit 0.

### Step 2 — Rebuild the committed agent-runner bundle (agent-runner)
- Files: modify `agent-runner/dist/index.js` (generated; other `dist/` files only if the build changes them)
- Change: The bundle inlines `server/src/vendor/shared`, CI fails when `dist/` drifts (`.github/workflows/agent-runner.yml:2-7,68-72`). In `agent-runner/`: `(cd ../reviewer-core && npm ci)` if `node_modules` is missing, `pnpm install --frozen-lockfile`, `pnpm build`. Never hand-edit `dist/`.
- Covers: none
- Rules / skills: none (package rules)
- Practices: rebuild after any change to `server/src/vendor/shared/` and keep the result (`agent-runner/AGENTS.md:32`); lock files untouched (`AGENTS.md:72`).
- Tests (new): none
- Existing tests to update: none
- Done when: `cd agent-runner && pnpm typecheck && pnpm test && pnpm build` exits 0, and a second `pnpm build` leaves `git status --porcelain -- dist` unchanged from after the first.

### Step 3 — Module core: ports, constants, period window, pure aggregator (server)
- Files: create `server/src/modules/agent-performance/constants.ts` · create `server/src/modules/agent-performance/ports.ts` · create `server/src/modules/agent-performance/period.ts` · create `server/src/modules/agent-performance/aggregate.ts`
- Change: `constants.ts`: `COUNTED_RUN_STATUSES = ['done','failed','cancelled'] as const`, window hours `{ '1d': 24, '30d': 720 }`, `COST_UNITS_PER_USD = 1e9`. `ports.ts`: `StatsWindow { from: Date; to: Date }`; `CountedRun { agentId: string|null; model: string|null; status: 'done'|'failed'|'cancelled'; costUsd: number|null; durationMs: number|null; ranAt: Date; accepted: number; dismissed: number; pending: number }`; `RunStatsStore { countedRuns(workspaceId, window, agentId?): Promise<CountedRun[]>; hasCountedRunsOutside(workspaceId, window): Promise<boolean> }`; `PerformanceAgentSource { list(ws): Promise<Array<{id;name}>>; getById(ws, id): Promise<{id;name}|undefined> }`; `AgentPerformanceDeps { store; agents; now: () => Date }`. `period.ts`: `resolveWindow(query: StatsPeriodQuery, now: Date): StatsWindow` (1d/30d: `[now - h, now]`; custom: `[from, to]`). `aggregate.ts`: `aggregateAgent(rows, agent: {id,name}|null): AgentStats` and `aggregateWorkspace(agents, rows, hasRunsOutside): AgentPerformance` — the single rule; see Design notes → Aggregation rule.
- Covers: AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-20, AC-21, AC-22, AC-23, AC-25, AC-26, AC-27, AC-28, AC-29, AC-31, AC-36, AC-44, AC-45, AC-46, AC-48, AC-49, AC-50, AC-51, AC-52, AC-83, AC-84, AC-85, AC-86, AC-87, EC-1, EC-2, EC-10, EC-11, EC-15
- Rules / skills: onion-architecture, security
- Practices: core files import only `@devdigest/shared` and each other — no `db`, no fastify (`.claude/skills/onion-architecture/references/devdigest.md` §4-5); "rows + pure helper" shape of `recentDoneRuns` → `estimateByAgent` (`server/src/modules/reviews/multi-agent.ts:254-270`); ports are structural so the container passes `agentsRepo` as is (`server/src/modules/eval/ports.ts:15-19,153-161`); sum money once in integer units so slices equal the total (`server/INSIGHTS.md:527-531`: costs are `double precision`).
- Tests (new): `server/test/agent-performance-aggregate.test.ts` — AC-13..AC-31, AC-36, AC-44..AC-52, AC-83..AC-87, EC-1, EC-2, EC-10, EC-11, EC-15; `server/test/agent-performance-period.test.ts` — AC-6 windows
- Existing tests to update: none
- Done when: `cd server && pnpm typecheck && pnpm arch` exit 0.

### Step 4 — Read-only repository (server)
- Files: create `server/src/modules/agent-performance/repository.ts`
- Change: `AgentPerformanceRepository` (constructor `db: DbOrTx`) implements `RunStatsStore`. `countedRuns`: select from `t.agentRuns` where `workspaceId = ws`, `ranAt >= from and ranAt <= to`, `status in COUNTED_RUN_STATUSES`, optional `agentId = …`; left join a subquery over `t.findings` inner join `t.reviews` (`reviews.workspaceId = ws`, `reviews.runId is not null`), grouped by `reviews.runId`, with `count(*) filter (where accepted_at is not null)::int` as accepted, `… dismissed_at is not null and accepted_at is null` as dismissed, `… both null` as pending; `coalesce(…, 0)`. Every `kind` counts. Map rows to `CountedRun`. `hasCountedRunsOutside`: one `exists`-style select, same workspace and status, `ranAt < from or ranAt > to`. No `source` filter (local and CI both count); eval runs are not in `agent_runs`.
- Covers: AC-92, AC-93, AC-94, AC-95, EC-3, EC-4, EC-9, EC-12, EC-13, NFR-2
- Rules / skills: drizzle-orm-patterns, onion-architecture, security
- Practices: imports `import * as t from '../../db/schema.js'` and `DbOrTx` like `server/src/modules/eval/repository.ts:1-13`; window/rank query style of `server/src/modules/reviews/repository/run.repo.ts:101-134`; SQL only through the builder or the `sql` template, never `sql.raw` (`.claude/skills/security/SKILL.md:46-48`); a `workspace_id` predicate in every query (same file `:49-50`); the row type stays in this file, the port type is returned (onion principle 1).
- Tests (new): `server/test/agent-performance.it.test.ts` — AC-92, AC-93, AC-94, AC-95, EC-3, EC-4, EC-9, EC-12, EC-13, NFR-2
- Existing tests to update: none
- Done when: `cd server && pnpm typecheck && pnpm arch` exit 0.

### Step 5 — Service, routes, container wiring, module registration (server)
- Files: create `server/src/modules/agent-performance/service.ts` · create `server/src/modules/agent-performance/routes.ts` · modify `server/src/platform/container.ts` · modify `server/src/modules/index.ts`
- Change: `AgentPerformanceService(deps: AgentPerformanceDeps)`: `agentStats(ws, agentId, query)` → `agents.getById` else `throw new NotFoundError('Agent not found')`, `resolveWindow(query, now())`, `store.countedRuns(ws, window, agentId)`, `aggregateAgent`. `workspace(ws, query)` → `Promise.all([agents.list, store.countedRuns, store.hasCountedRunsOutside])` → `aggregateWorkspace`. `routes.ts` default plugin: `GET /agents/:id/stats` (`params: IdParams`, `querystring: StatsPeriodQuery`, `response: {200: AgentStats}`) and `GET /agent-performance` (`querystring`, `200: AgentPerformance`); each handler: `getContext` → one service call. Container: `private _agentPerformanceRepo?`, getter `agentPerformanceRepo`, getter `agentPerformanceDeps` returning `{ store: this.agentPerformanceRepo, agents: this.agentsRepo, now: () => new Date() }`. Registry: one import + one entry `agentPerformance`.
- Covers: AC-88, AC-89, AC-90, AC-91, AC-63, AC-64, AC-65, AC-66, NFR-1, NFR-2
- Rules / skills: onion-architecture, fastify-best-practices, security
- Practices: route plugin shape of `server/src/modules/eval/routes.ts:35-46` (`withTypeProvider<ZodTypeProvider>()`, service built from `app.container.<x>Deps`); no `Schema.parse` in handlers, validation → 422 (`server/AGENTS.md:38-41`); errors as `AppError` subclasses (`server/src/platform/errors.ts:19-29`); getters like `evalRepo`/`evalDeps`, `ciDeps.now` (`server/src/platform/container.ts:218-246`); registration per `server/AGENTS.md:35-36` and `server/src/modules/index.ts:34-53`; the service never sees `Container` (onion principle 3); GET-only, no job enqueued, no LLM port (NFR-1).
- Tests (new): `server/test/agent-performance-service.test.ts` — AC-88, AC-89, AC-90 (fakes); route cases in `server/test/agent-performance.it.test.ts` — AC-91, NFR-2
- Existing tests to update: none
- Done when: `cd server && pnpm typecheck && pnpm lint && pnpm test:unit && pnpm arch` exit 0; (manual) with `./scripts/dev.sh` running, `curl -s 'localhost:3001/agent-performance?period=30d'` returns the `AgentPerformance` shape and `curl -s -o /dev/null -w '%{http_code}' 'localhost:3001/agent-performance?period=custom'` prints `422`.

### Step 6 — Period lib, query keys and hooks (client)
- Files: create `client/src/lib/stats-period.ts` · create `client/src/lib/hooks/agent-performance.ts` · modify `client/src/lib/hooks/index.ts` · modify `client/src/lib/query-keys.ts`
- Change: `stats-period.ts` (pure): `StatsPeriodSelection = { period: '1d'|'30d' } | { period: 'custom'; from: string; to: string }` (dates `YYYY-MM-DD`, local); `DEFAULT_STATS_PERIOD`; `todayLocal(now?)`; `validateCustomRange(from, to, today)` → `'startAfterEnd' | 'endAfterToday' | 'missing' | null`; `parseStatsPeriod({period, from, to}, today)` → selection, falling back to 30d on an unknown period or invalid range; `statsPeriodToSearch(sel)` → `{ period, from, to }` (null for non-custom; for `useSearchParamsUpdate`); `statsPeriodToApiQuery(sel)` → query string, custom bounds as `new Date(y, m-1, d, 0,0,0,0).toISOString()` and `new Date(y, m-1, d, 23,59,59,999).toISOString()`; `SMALL_SAMPLE_DECISIONS = 10`; `decisionsOf(s)`, `isSmallSample(s)`. Keys: `agentPerformance: { scope, workspace(sel), agent(agentId, sel) }`. Hooks: `useAgentPerformance(sel)` → `api.get<AgentPerformance>(\`/agent-performance?${…}\`)`; `useAgentStats(agentId, sel)` (`enabled: !!agentId`). No `placeholderData`/`keepPreviousData`.
- Covers: AC-5, AC-6, AC-10, AC-11, AC-69, AC-70, EC-8
- Rules / skills: frontend-architecture, react-best-practices
- Practices: hooks only in `src/lib/hooks/<domain>.ts`, keys only from `query-keys.ts` (`client/AGENTS.md:20-21`); hook file header and style of `client/src/lib/hooks/ci.ts:1-50`; shared pure helpers flat in `src/lib/` (`.claude/skills/frontend-architecture/references/devdigest.md:32`); a new period must show no old figure (brief fact 19).
- Tests (new): `client/src/lib/stats-period.test.ts` — AC-5, AC-8, AC-11, EC-7, EC-8
- Existing tests to update: none
- Done when: `cd client && pnpm typecheck && pnpm lint` exit 0.

### Step 7 — Shared period control, URL hook and marks (client)
- Files: create `client/src/components/agent-stats/PeriodControl.tsx` · create `client/src/components/agent-stats/StatMarks.tsx` · create `client/src/components/agent-stats/use-stats-period.ts` · create `client/src/components/agent-stats/styles.ts` · create `client/src/components/agent-stats/index.ts` · modify `client/messages/en/agentPerformance.json`
- Change: `useStatsPeriod()` reads `period`/`from`/`to` from `useSearchParams`, returns `[selection, setSelection]` via `parseStatsPeriod` and `useSearchParamsUpdate` (one navigation for all three params). `PeriodControl({ value, onChange })`: a `SelectInput` with "1 day", "30 days", "Custom range"; choosing custom shows two `TextInput type="date"` fields (`max` = today) holding a LOCAL draft; `onChange` fires only for 1d/30d or a valid range; an invalid range shows the validation message next to the fields (`role="alert"` or text near the inputs) and leaves the URL unchanged. `StatMarks.tsx`: `EstimateLabel` ("DevDigest estimate"), `PartialMark` ("partial"), `SmallSampleMark` ("small sample") — text, not colour. Rewrite `agentPerformance.json` to the spec wording (replace the starter keys; nothing reads them): add `period.*`, `marks.*`, and leave page keys to Step 9.
- Covers: AC-4, AC-7, AC-8, AC-9, AC-68, EC-7, NFR-3, NFR-4, NFR-5
- Rules / skills: frontend-architecture, react-best-practices
- Practices: cross-route component in `src/components/<kebab-name>/` (`AGENTS.md:40-41`); kit primitives first (`client/AGENTS.md:37`; `TextInput` accepts `type`, `client/src/vendor/ui/kit/TextInput.tsx:9-17`); multi-param change through `useSearchParamsUpdate` (`client/INSIGHTS.md:169-172`, `client/src/lib/use-search-param-state.ts:45-61`); derive the selection from the URL, keep only the draft in state (frontend principle 6); every label from messages (`client/AGENTS.md:33`); inputs have labels for keyboard/screen reader use.
- Tests (new): `client/src/components/agent-stats/PeriodControl.test.tsx` — AC-4, AC-7, AC-8, AC-9, NFR-3
- Existing tests to update: none
- Done when: `cd client && pnpm typecheck && pnpm lint` exit 0.

### Step 8 — Sidebar item (client)
- Files: modify `client/src/vendor/ui/nav.ts` · modify `client/src/components/app-shell/constants.ts` · modify `client/messages/en/agentPerformance.json`
- Change: GLOBAL items become `[{ key: "agent-performance", icon: "Activity", href: "/agent-performance" }, ci-runs]` (design order, `client/docs/design/src/chrome.jsx:15-19`), no literal `label`; `NAV_LABEL_KEYS["agent-performance"] = "agentPerformance.nav.label"`; add `nav.label: "Agent Performance"`. `activeKeyFor` already maps `/agent-performance` (`client/src/components/app-shell/helpers.ts:39`).
- Covers: AC-1, AC-2, AC-3
- Rules / skills: frontend-architecture
- Practices: a nav item without a literal needs a `NAV_LABEL_KEYS` full message path (`client/INSIGHTS.md:382-386,412-414`).
- Tests (new): `client/src/components/app-shell/nav.test.ts` (extend) — AC-1, AC-3
- Existing tests to update: none (`nav.test.ts:50-60` still holds)
- Done when: `cd client && pnpm typecheck && pnpm test -- src/components/app-shell` exit 0.

### Step 9 — Route, view and page states (client)
- Files: create `client/src/app/agent-performance/page.tsx` · create `client/src/app/agent-performance/_components/AgentPerformanceView/AgentPerformanceView.tsx` · create `client/src/app/agent-performance/_components/AgentPerformanceView/index.ts` · create `client/src/app/agent-performance/_components/AgentPerformanceView/styles.ts` · modify `client/messages/en/agentPerformance.json`
- Change: thin `page.tsx` wraps the view in `<Suspense fallback={null}>`. The view: `usePageCrumb`, title, `PeriodControl` bound to `useStatsPeriod`, the "not reconciled with provider billing" note, then by state: loading → `Skeleton`s for tiles, table and breakdown (`aria-busy`), no figure; error with no data → `ErrorState` with `onRetry={() => refetch()}`; `totals.runs === 0` → `has_runs_outside_period` ? "No runs in this period" : `EmptyState` "No agent runs yet"; the period control stays rendered in every state. Data → Steps 10-12 components.
- Covers: AC-2, AC-56, AC-57, AC-58, AC-59, AC-60, AC-61, AC-62, AC-55, AC-63, EC-6, EC-16, NFR-5
- Rules / skills: frontend-architecture, next-best-practices
- Practices: route template of `client/src/app/ci-runs/page.tsx` (Suspense for search params); state ladder of `client/src/app/ci-runs/_components/CiRunsView/CiRunsView.tsx:37-60`, but no probe query — the response carries `has_runs_outside_period` (contrast `client/INSIGHTS.md:386-389`); no `fetch` in components (`client/AGENTS.md:32`).
- Tests (new): `client/src/app/agent-performance/_components/AgentPerformanceView/AgentPerformanceView.test.tsx` — AC-56..AC-62, EC-6
- Existing tests to update: none
- Done when: `cd client && pnpm typecheck && pnpm lint` exit 0.

### Step 10 — Summary tiles (client)
- Files: create `client/src/app/agent-performance/_components/AgentPerformanceView/_components/SummaryTiles/SummaryTiles.tsx` · create `client/src/app/agent-performance/_components/AgentPerformanceView/_components/SummaryTiles/index.ts` · create `client/src/app/agent-performance/_components/AgentPerformanceView/_components/SummaryTiles/styles.ts` · create `client/src/lib/format-percent.ts` (shared by tiles, table and Stats tab) · modify `client/messages/en/agentPerformance.json`
- Change: four tiles from `totals`: Total runs; Total cost (`formatCost`, `EstimateLabel`, `PartialMark` when `cost_partial`); Avg accept rate (percent or "—", decisions `accepted+dismissed`, run count); Most-active agent (name + runs, "—" when null). Each label names the period (ICU param: "1 day", "30 days", or the custom dates).
- Covers: AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-54
- Rules / skills: frontend-architecture, security
- Practices: `formatCost(null)` → "—" (`client/src/lib/format-cost.ts:5`); agent names as React text, never HTML (spec Untrusted inputs, `.claude/skills/security/SKILL.md:54-57`).
- Tests (new): `SummaryTiles.test.tsx` beside it — AC-12..AC-22
- Existing tests to update: none
- Done when: `cd client && pnpm typecheck && pnpm lint` exit 0.

### Step 11 — Agents table with sort, expand and View (client)
- Files: create `client/src/app/agent-performance/_components/AgentPerformanceView/_components/AgentsTable/AgentsTable.tsx` · create `client/src/app/agent-performance/_components/AgentPerformanceView/_components/AgentsTable/helpers.ts` · create `client/src/app/agent-performance/_components/AgentPerformanceView/_components/AgentsTable/index.ts` · create `client/src/app/agent-performance/_components/AgentPerformanceView/_components/AgentsTable/styles.ts` · modify `client/messages/en/agentPerformance.json`
- Change: `helpers.ts`: `sortRows(rows, sort: null|'desc'|'asc')` — null: runs desc (OQ-1); by accept rate: rows with `decisions >= 10` first, then small-sample rows, each group by `accept_rate` in the chosen direction, null rates last. Columns Agent, Runs, Avg cost (+`EstimateLabel`, `PartialMark`), Avg duration (`formatDurationMs`), Accept rate (percent or "—", decisions count, `SmallSampleMark`), Last run, View. Only the Accept rate header is a `<button>` (toggles desc → asc), header cell has `aria-sort`. `runs === 0` row → "No runs in this period" instead of figures; `agent_id === null` row → "Deleted agent", no View. Expand: a `<button aria-expanded aria-controls>`; details show runs done/failed/cancelled, accepted/dismissed/pending, `cost_by_model` (null model → "Unknown model"). View: `<Link>` to `/agents/<id>?tab=stats&` + the non-null `statsPeriodToSearch(sel)` params.
- Covers: AC-23, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30, AC-31, AC-32, AC-33, AC-34, AC-35, AC-36, AC-37, AC-38, AC-39, AC-40, AC-41, AC-42, AC-43, AC-44, AC-45, AC-46, AC-47, AC-64, AC-65, EC-5, EC-14, EC-15, NFR-3, NFR-4
- Rules / skills: frontend-architecture, react-best-practices, security
- Practices: clickable headers/rows use a real `<button>`/`<Link>`; `rowClickProps` only widens the target (`client/AGENTS.md:34-35`); sorting is a pure helper, sorted rows derived during render (frontend principle 6); expanded ids are local UI state; names and models as text.
- Tests (new): `AgentsTable/helpers.test.ts` — AC-39, AC-40, AC-41, EC-14; `AgentsTable/AgentsTable.test.tsx` — AC-35..AC-37, AC-42..AC-47
- Existing tests to update: none
- Done when: `cd client && pnpm typecheck && pnpm lint` exit 0.

### Step 12 — Cost breakdown (client)
- Files: create `client/src/app/agent-performance/_components/AgentPerformanceView/_components/CostBreakdown/CostBreakdown.tsx` · create `client/src/app/agent-performance/_components/AgentPerformanceView/_components/CostBreakdown/index.ts` · create `client/src/app/agent-performance/_components/AgentPerformanceView/_components/CostBreakdown/styles.ts` · modify `client/src/vendor/ui/charts/Donut.tsx` (optional `formatValue` so the legend uses `formatCost`, AC-50/51) · modify `client/src/app/agent-performance/_components/AgentPerformanceView/AgentPerformanceView.tsx` · modify `client/messages/en/agentPerformance.json`
- Change: two `Donut`s (`@devdigest/ui`) from `cost_by_agent` (null → "Deleted agent") and `cost_by_model` (null → "Unknown model"), header with `EstimateLabel`, `PartialMark` when `totals.cost_partial`; `totals.total_cost_usd === null` → "No cost recorded yet." instead of the donuts. Mount tiles, table and breakdown in the view.
- Covers: AC-48, AC-49, AC-50, AC-51, AC-52, AC-53, AC-54
- Rules / skills: frontend-architecture
- Practices: reuse `Donut` (`client/src/vendor/ui/charts/Donut.tsx:11-20`); legend text from data, not HTML.
- Tests (new): `CostBreakdown/CostBreakdown.test.tsx` — AC-48, AC-49, AC-52, AC-53
- Existing tests to update: none
- Done when: `cd client && pnpm typecheck && pnpm lint && pnpm test` exit 0; (manual) `/agent-performance` renders all states on seeded data.

### Step 13 — Agent editor Stats tab (client)
- Files: create `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/StatsTab.tsx` · create `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/index.ts` · create `client/src/app/agents/[id]/_components/AgentEditor/_components/StatsTab/styles.ts` · modify `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` · modify `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` · modify `client/src/app/agents/[id]/page.tsx` · modify `client/messages/en/agents.json` · modify `specs/README.md` (index line of the spec)
- Change: `TABS` gains `{ key: "stats", labelKey: "editor.tabs.stats", icon: "Activity" }` (label exists, `client/messages/en/agents.json:55`); `VALID_TABS` gains `"stats"` (`page.tsx:17`); `AgentEditor` renders `<StatsTab key={agent.id} agent={agent} />` for `tab === "stats"`. `StatsTab`: `useStatsPeriod` + `PeriodControl`, `useAgentStats(agent.id, sel)`; loading → `Skeleton`s, no figure; error → `ErrorState` with retry; `runs === 0` → "No runs in this period"; else runs, avg cost (`EstimateLabel`, `PartialMark`), avg duration, accept rate + decisions + `SmallSampleMark`, "—" for null figures. Strings under `statsTab.*` in `agents.json`. Same formatters as the table so AC-83..87 hold for one read.
- Covers: AC-66, AC-67, AC-68, AC-69, AC-70, AC-71, AC-72, AC-73, AC-74, AC-75, AC-76, AC-77, AC-78, AC-79, AC-80, AC-81, AC-82, AC-83, AC-84, AC-85, AC-86, AC-87, NFR-4, NFR-5
- Rules / skills: frontend-architecture, react-best-practices
- Practices: tab component colocated under `AgentEditor/_components/` like `CiTab`; uses only `@/components/agent-stats` and `@/lib`, never the page's `_components` (`client/AGENTS.md:19-22`); kit `Tabs` are buttons (`client/INSIGHTS.md:542-544`).
- Tests (new): `StatsTab/StatsTab.test.tsx` — AC-67..AC-82
- Existing tests to update: none (`AgentEditor.test.tsx` does not count tabs)
- Done when: `cd client && pnpm typecheck && pnpm lint && pnpm test` exit 0 and `./scripts/check-changed.sh --base main` exits 0.

## Contracts & migrations
- Generated or copied artefacts: yes — `client/src/vendor/shared/contracts/observability.ts` via `./scripts/shared-contracts.sh sync`; `agent-runner/dist/` via `pnpm build` in `agent-runner/`. No migration, no schema change, no lock-file change.
- Spec `Status` update: yes — the implementer of G5 sets `specs/16-agent-performance.md` to `implemented` (stays `approved` if the plan ends `partial`).

## Verification
| Package | Checks |
|---|---|
| server | `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm arch` · (`pnpm test:integration`, Docker, only if `.it.test.ts` files are added) |
| client | `pnpm typecheck` · `pnpm lint` · `pnpm test` |
| agent-runner | `pnpm typecheck` · `pnpm test` · `pnpm build` (+ reproducibility, Step 2) |
| mcp | `pnpm typecheck` (vendor/shared change triggers its CI, `AGENTS.md:65`) |
| repo root | `./scripts/shared-contracts.sh check` · `./scripts/check-changed.sh` (`--quick` for G1-G4, full in G5) |
Source of the commands: project docs (inferred from `AGENTS.md:31`, `server/AGENTS.md:10-15`, `client/AGENTS.md:10-13`, `agent-runner/AGENTS.md`, `.claude/skills/pr-self-review/assets/routing.json`). Extra checks: contracts check. Needs external services: no for the listed checks; Docker only for optional integration tests and the manual curl.
Baseline (recorded by G1 before any edit, 2026-10-21, branch hw8/agent-performance-dashboard): server `pnpm typecheck` exit 0 · `pnpm lint` exit 0 · `pnpm test:unit` exit 0 (70 files, 823 tests passed) · `pnpm arch` exit 0 (no violations, 276 modules); client `pnpm typecheck` exit 0 · `pnpm lint` exit 0 · `pnpm test` exit 0 (76 files, 540 tests passed). No failing items.

## Insights to record
- `server/INSIGHTS.md` · Decisions — dashboard money is summed in integer nano-USD in `aggregate.ts` so cost-by-agent and cost-by-model slices equal the total exactly; `agent_runs.cost_usd` stays `double precision` (Where: `server/src/modules/agent-performance/aggregate.ts`)
- `client/INSIGHTS.md` · Decisions — the stats period lives in the URL as local dates, the API gets ISO instants computed in the browser (start/end of day), so the server never needs a time zone (Where: `client/src/lib/stats-period.ts`)

<!-- implementer-brief:end -->

## Context read
- `specs/16-agent-performance.md:3,71-101,103-250,271-274` — approved SPEC-16, terms, wire fields, criteria, OQ defaults
- `docs/plans/12-agent-performance.brainstorm.md:2,57,74,149-177` — chosen D1 option 3 + K1, planner hints
- `AGENTS.md:36-50,60,65,70,72,99` — naming, contract sync, mcp trigger, do-not-touch, spec status
- `server/AGENTS.md:33-46` — module layering, zod route schemas, 422, `.it.test.ts`
- `client/AGENTS.md:17-37` — hooks/keys location, no fetch, i18n, buttons/links, kit first
- `agent-runner/AGENTS.md:32` and `.github/workflows/agent-runner.yml:2-7,68-72` — `dist/` rebuild and drift check
- `server/INSIGHTS.md:65-70` (nullish fields on stored jsonb; not applicable: these contracts are computed, not stored), `:527-531` (cost columns are doubles)
- `client/INSIGHTS.md:169-172,382-389,412-414,542-544`; `INSIGHTS.md:94-98`
- `server/src/vendor/shared/contracts/observability.ts:116-146` — current unused `AgentStats`
- `server/src/db/schema/runs.ts:19-52`, `server/src/db/schema/reviews.ts:23-77` — columns and links
- `server/src/modules/eval/{ports,routes,repository}.ts`, `server/src/platform/container.ts:210-246`, `server/src/modules/index.ts`, `server/src/modules/_shared/{context,schemas}.ts`, `server/src/platform/errors.ts`
- `client/src/vendor/ui/nav.ts:42-45`, `client/src/components/app-shell/{constants,helpers}.ts`, `client/src/app/agents/[id]/page.tsx`, `AgentEditor/{constants,AgentEditor}.tsx`, `client/src/lib/{use-search-param-state,query-keys,format-cost,format-duration}.ts`, `client/src/lib/hooks/{ci,index}.ts`, `client/src/app/ci-runs/**`, `client/messages/en/{agentPerformance,agents,shell}.json`
- `.claude/skills/{onion-architecture/references/devdigest.md,frontend-architecture/references/devdigest.md,security/SKILL.md,README.md}`

## Requirements trace
| R | Requirement (source `path:line` or "request") | Steps |
|---|---|---|
| AC-1..AC-3 | Sidebar item, navigation, active (`specs/16-agent-performance.md:105-107`) | 8, 9 |
| AC-4..AC-12 | Period control and URL (`:110-118`) | 6, 7, 9, 10 |
| AC-13..AC-22 | Summary tiles (`:121-130`) | 3, 10 |
| AC-23..AC-47 | Agents table, sort, expand, View (`:133-163`) | 3, 11 |
| AC-48..AC-55 | Cost breakdown and provenance (`:166-175`) | 3, 9, 10, 12 |
| AC-56..AC-62 | Page states (`:178-184`) | 9 |
| AC-63..AC-66 | No model calls (`:187-190`) | 5, 9, 11, 13 |
| AC-67..AC-82 | Stats tab (`:193-208`) | 6, 7, 13 |
| AC-83..AC-87 | Dashboard equals Stats tab (`:211-215`) | 3, 13 |
| AC-88..AC-95 | Server rules (`:218-225`) | 1, 4, 5 |
| EC-1..EC-16 | Edge cases (`:228-243`) | 3, 4, 6, 7, 9, 11 |
| NFR-1..NFR-5 | Cost, security, a11y, i18n (`:246-250`) | 4, 5, 7, 9, 11, 13 |
Recommendations: none raised in this plan; brief questions 1-5 answered by the user as recommended.

## Affected modules
| Package | Path | Ring / layer | Change |
|---|---|---|---|
| server | `src/vendor/shared/contracts/observability.ts` | core (contracts) | reshape + add |
| server | `src/modules/agent-performance/{constants,ports,period,aggregate}.ts` | core / application | new |
| server | `src/modules/agent-performance/service.ts` | application | new |
| server | `src/modules/agent-performance/{repository,routes}.ts` | outer | new |
| server | `src/platform/container.ts`, `src/modules/index.ts` | composition root | wire |
| client | `src/vendor/shared` | contracts copy | sync |
| client | `src/lib/stats-period.ts`, `src/lib/hooks/agent-performance.ts`, `src/lib/query-keys.ts` | lib | new/edit |
| client | `src/components/agent-stats/` | shared chrome | new |
| client | `src/app/agent-performance/` | route | new |
| client | `src/app/agents/[id]/…` | route | Stats tab |
| client | `src/vendor/ui/nav.ts`, `src/components/app-shell/constants.ts` | shell | nav item |
| agent-runner | `dist/` | generated | rebuild |

## Constraints honored
| Rule | Source (`path:line`) | How the plan respects it |
|---|---|---|
| Edit server contracts, sync client | `AGENTS.md:60` | Step 1 runs the sync script |
| Runner `dist/` rebuilt after vendor/shared change | `agent-runner/AGENTS.md:32` | Step 2 |
| Migrations generated only | `AGENTS.md:70` | No schema change at all |
| Route schemas zod, 422, no parse in handler | `server/AGENTS.md:38-41` | Step 5 |
| Module registration one import + one entry | `server/AGENTS.md:35-36` | Step 5 |
| Inward-only imports, ports via constructor | onion-architecture skill; `pnpm arch` | Steps 3-5, `pnpm arch` in Done when |
| Workspace scoping | `.claude/skills/security/SKILL.md:49-50` | `getContext` + `workspace_id` predicate, agent by `getById(ws, id)` |
| Hooks/keys central, no fetch | `client/AGENTS.md:20-21,32` | Step 6 |
| No hardcoded UI text | `client/AGENTS.md:33` | Steps 7-13 |
| Real buttons/links | `client/AGENTS.md:34-35` | Steps 7, 11 |
| Features do not import each other | `client/AGENTS.md:19-22`, frontend principle 3 | shared pieces in `components/agent-stats` |

## Design notes
### Aggregation rule (`aggregate.ts`)
Per group of `CountedRun`s: `runs` = count; `runs_done/failed/cancelled` by status; `accepted/dismissed/pending` = sums; `accept_rate` = accepted/(accepted+dismissed) or null; priced = rows with `costUsd !== null`; cost units `u = Math.round(costUsd * 1e9)`; `total_cost_usd` = Σu/1e9 or null when no priced run; `avg_cost_usd` = total/priced count or null; `cost_partial` = some row has null cost; `avg_duration_ms` = mean of `durationMs` over `status==='done'` with non-null duration, or null; `last_run_at` = max `ranAt` ISO or null; `cost_by_model` = per `model` Σu/1e9, priced rows only. Workspace: one entry per listed agent (zero-run entries have all nulls/zeros, `cost_partial: false`), plus one `agent_id: null` entry when rows with null `agentId` exist; default order runs desc. Totals sum the same integer units so `Σ cost_by_agent == Σ cost_by_model == total` before the single division. `most_active` = among existing agents with runs > 0, max runs, tie → later `last_run_at`; null otherwise (OQ-2).
### Period
URL holds `period` + local `from`/`to` dates (survives reload, shared by the View link). The API gets instants; the server never interprets a time zone. `period` defaults to `30d` server-side as well (a missing param is not listed in AC-91).
### Rejected
Option 4/5 (SQL aggregation) and K2 per the brief; reading the workspace endpoint from the Stats tab (contradicts AC-88).

## Risks & open questions
- Execution mode not chosen yet: recommended `multi-agent` (13 steps, ~35 files over server, client, agent-runner; G2 can run beside G3-G5). `single-agent` would exceed the ~8 step / 25 file guideline.
- Display rounding: slices are exact in integer units, but `formatCost`/`Donut` round each slice, so shown slices may differ from the shown total by a rounding unit. The verifier may read AC-50/51 at display level; if so, a spec clarification is needed.
- Row query transfers one row per counted run; an uncapped custom range on a large `agent_runs` (no `(workspace_id, ran_at)` index, `server/src/db/schema/runs.ts:48`) is unmeasured. An index would be a `pnpm db:generate` migration, only after measuring.
- `agent-runner/dist/` may or may not change (ncc may drop the unused schema); keep whatever the build produces. Not verified (read-only).
- `fastify-type-provider-zod` with a `superRefine`d querystring: precedent exists only for a body (`server/src/modules/agents/routes.ts:78-86`); if the querystring path misbehaves, move the cross-field check into `resolveWindow` and throw `ValidationError` (422).
- Rolling 1d/30d windows: dashboard and Stats tab read at different instants may differ by a run (accepted by the user).

## Handed off
- Architecture reviewer: new module ports/structural `agents` port and container getters; `aggregate.ts` staying pure; client `components/agent-stats` boundary (no import of route `_components`).
- Security: `StatsPeriodQuery` validation at the edge; `workspace_id` predicate in both repository queries and in the decisions subquery; agent id resolved in the caller's workspace (404 otherwise); agent and model names rendered as text only.
