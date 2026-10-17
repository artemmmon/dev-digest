# Development Plan: Multi-Agent Review (agent-id list, parallel runs, results page with groups)
Status: implemented
Spec: specs/14-multi-agent-review.md
Brainstorm: docs/plans/10-multi-agent-review.brainstorm.md
Execution mode: multi-agent (chosen by the user)

## Goal
Implement SPEC-14 as brief option 1: a multi-agent run IS `agent_runs.batch_id` (no migration, no model call). The review request takes an agent-id list; agents run in parallel; a new page `/repos/[repoId]/multi-agent` shows every review batch of a PR. Groups, conflicts, states, totals and estimates are computed on read by pure server helpers.
In scope: server `reviews` module + shared contracts; client route, moved shared components, PR page entry points, nav, i18n, README maps.
Out of scope: `ci/`, `agent-runner/`, `mcp/` (untouched), migrations, Learn, per-column cancel/delete, new tests.

Rules for every group:
- **No new tests.** Repair only tests you break. Stub methods in hand-built fakes are allowed.
- Do not change `insertReview` fields (`agentId`, `runId`) or `agent_runs.source`. Worktree B reads that attribution (`server/src/modules/reviews/run-executor.ts:317-327`, `server/src/modules/reviews/repository/run.repo.ts:157`).
- Decisions:
  - Local null-batch runs are one-column runs, with the run id as their id (OQ-1). Only `source='ci'` is hidden; this supersedes the brief's "User decisions" Q3 line.
  - Estimate = the agent's last 5 `done` runs: duration averaged over all 5, cost only over non-null `cost_usd`.
  - `agentIds` is `min(1).max(50)` and de-duplicated (user-approved; Design notes → Spec follow-up).
  - Wall time = max `duration_ms`.
  - A deleted agent shows as "Unknown agent", from i18n (OQ-2).
- Shapes, routes and the algorithm: **Design notes** below the marker.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | 1–6 | server: contracts + sync, start path, executor, store, helpers, read routes | — | Contract names (Design notes → Contracts). `POST /pulls/:id/review` takes `agentIds` and returns `multi_agent_run_id`. `GET /pulls/:id/multi-agent-runs[/:runId]`, `GET /review-estimates` |
| G2 | 7–10 | client: moves, hooks/keys/nav/i18n, PR page checklist + link, route + Configure | G1 | Hooks in `client/src/lib/hooks/multi-agent.ts`, keys `keys.pr.multiAgentRuns/multiAgentRun`, `keys.reviewEstimates`, `@/components/{run-trace-drawer,finding-card,finding-case-editor,agent-checklist}`, `client/messages/en/multiAgent.json`, the page's results slot |
| G3 | 11–14 | client: Results view, Columns, Tabs, Disagree, README, spec Status | G2 | — |

Groups run strictly in sequence (3 implementers). After them, the fix loop is capped at **2 rounds** (see Verification).

## Skills behind the steps
| Path glob (routing.json rule id) | Skills | Why they matter here |
|---|---|---|
| `server/src/vendor/shared/**` (shared-contracts-server) | zod, onion-architecture | core-ring contracts; additive only (mcp drift check) |
| `server/src/{modules,platform,adapters}/**` (server-app) | onion-architecture, fastify-best-practices | thin routes, ports via constructor, zod route schemas |
| `server/src/modules/**/repository/**` (server-data) | drizzle-orm-patterns | one window query, `sql` template only |
| `client/src/**` (client-src) | frontend-architecture, react-best-practices | promote on 2nd consumer, hooks in `lib/hooks`, derive don't store |
| `client/src/app/**` (client-app-router) | next-best-practices | search-param state, thin pages, Suspense around `useSearchParams` |
| `client/messages/**` (client-i18n) | frontend-architecture | one file per feature |
| `{client,server}/**` (security-surface) | security | workspace scoping; model text as text or `Markdown` |
| `client/**/*.test.tsx` (client-tests) | react-testing-library | only when repairing tests |

## Steps
### Step 1 — Contracts (server)
- Files: modify `server/src/vendor/shared/contracts/platform.ts` · modify `server/src/vendor/shared/contracts/review-api.ts` · modify `server/src/vendor/shared/contracts/observability.ts`
- Change:
  - `RunRequest` gets `agentIds`.
  - `ReviewRunResponse` gets `multi_agent_run_id`.
  - In `observability.ts`, replace the unused Multi-Agent block (lines 22-86) with Design notes → Contracts. Keep `AgentStats` and `Curator*`, and update the header comment.
  - Run `./scripts/shared-contracts.sh sync`.
- Covers: AC-5, AC-12
- Rules / skills: shared-contracts-server; zod
- Practices:
  - Edit the server copy only (root `AGENTS.md` Cross-package rules).
  - Leave `RunSummary`, `ReviewRecord` and `FindingRecord` untouched: mcp type-checks them (`mcp/src/api/schemas.ts:140-146`).
  - `MultiAgentFinding` = `FindingRecord.extend` (`review-api.ts:19`). Use `z.enum` for fixed strings.
- Tests (test-writer): none
- Existing tests to update: client tests that build a `ReviewRunResponse` literal (`rg -n "skipped_agents" client/src`) need `multi_agent_run_id`
- Done when:
  - `./scripts/shared-contracts.sh check` passes.
  - `rg -n "AgentColumnFinding|ConflictTake" server/src client/src` returns nothing.
  - `pnpm typecheck` passes in `server/` and `client/`.

### Step 2 — Start path: agent-id list and parent id (server)
- Files: modify `server/src/modules/reviews/service.ts` · modify `server/src/modules/reviews/routes.ts`
- Change:
  - `resolveTargets` gets a first branch `agentIds`, with precedence `agentIds` > `agentId` > `all`:
    - De-duplicate the ids, then `Promise.all` of `this.agents.getById(workspaceId, id)`.
    - If any id is missing, throw `NotFoundError('Agent not found')` before any run row exists.
    - Otherwise return the targets in request order, `skipped: []`. `applies_to` and `enabled` are ignored.
  - `runReview` also returns `batchId`. The route passes `body.agentIds` and answers `multi_agent_run_id: batchId`.
  - Update the doc comment at `routes.ts:13`.
- Covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-11, NFR-3, NFR-4, EC-6, EC-7, EC-8, EC-16
- Rules / skills: server-app; onion-architecture; security
- Practices:
  - Thin route: schema → `getContext` → service; no `parse` in the handler (`server/AGENTS.md`).
  - Keep the 10/min `rateLimit` (`routes.ts:35`).
  - Workspace scoping comes from `getById(workspaceId, …)` (`service.ts:72`).
  - The `agentId`/`all` branches stay as they are (`service.ts:59-76`).
- Tests (test-writer): see Design notes → Test record
- Existing tests to update: none expected (fakes are cast with `as unknown as ReviewStore`, `server/test/reviews-service.test.ts:67-78`)
- Done when: `pnpm typecheck && pnpm test:unit` pass in `server/`.

### Step 3 — Parallel executor, started marker, prep-error prefix (server)
- Files: modify `server/src/modules/reviews/run-executor.ts` · modify `server/src/modules/reviews/constants.ts`
- Change:
  - Add `AGENT_STARTED_PHASE = 'agent-started'` and `PREP_ERROR_PREFIX = 'Failed to load PR diff:'`. Use the prefix at `run-executor.ts:104-105`.
  - Pass `{ phase: AGENT_STARTED_PHASE }` as data to the existing "Starting review with agent" `runLog.info` (`:206`).
  - Replace the sequential `for` (`:145-184`) with `await Promise.allSettled(jobs.map(async ({ agent, runId }) => { same body }))`. The shared prep (`:98-143`) runs once, before it.
- Covers: AC-7, AC-8, AC-9, AC-10, NFR-1, NFR-2, EC-1, EC-2, EC-4
- Rules / skills: server-app; onion-architecture
- Practices:
  - `runOneAgent` already isolates failures (`:397-421`); keep the per-job try/catch.
  - Share only read-only values (`diff`, `intentBlock`, `scopeFilter`).
  - No concurrency cap below `jobs.length`: it would break AC-7.
  - Intent stays once per batch (`server/INSIGHTS.md:593-606`).
- Tests (test-writer): see Design notes → Test record
- Existing tests to update: `server/test/reviews-service.test.ts:231-303` (executor test) must pass unchanged
- Done when: `pnpm test:unit` passes in `server/`, and the only `for (const { … } of jobs)` loop left is in `failAll`.

### Step 4 — Store reads (server)
- Files: modify `server/src/modules/reviews/ports.ts` · modify `server/src/modules/reviews/repository/run.repo.ts` · modify `server/src/modules/reviews/repository.ts`
- Change:
  - Add the types `BatchRunRow` and `DoneRunSample`, and the `ReviewStore` methods `listBatchRunsForPull` and `recentDoneRuns` (Design notes → Store).
  - Implement them in `run.repo.ts` and delegate from `ReviewRepository`.
- Covers: AC-11, AC-26, NFR-3
- Rules / skills: server-data; drizzle-orm-patterns; security
- Practices:
  - Return domain types (onion principle 1).
  - Both queries filter on `agentRuns.workspaceId`.
  - `listBatchRunsForPull` mirrors `listRunsForPull` (`run.repo.ts:40-69`, left join `agents`) and adds `batchId` and `source`.
  - `recentDoneRuns` ranks rows with ``sql`row_number() over (partition by ${t.agentRuns.agentId} order by ${t.agentRuns.ranAt} desc)` `` in a subquery, keeping `rn <= perAgent`, `status='done'` and `agent_id` not null.
  - No `sql.raw` (security rule 4).
- Tests (test-writer): see Design notes → Test record
- Existing tests to update: none
- Done when: `pnpm typecheck && pnpm arch` pass in `server/`.

### Step 5 — Pure helpers (server)
- Files: create `server/src/modules/reviews/multi-agent.ts`
- Change: pure functions from Design notes → Algorithm: `batchKey`, `listBatches`, `columnState`, `buildColumns`, `groupFindings`, `takesFor`, `conflictIds`, `totals`, `preparationError`, `estimateByAgent`.
- Covers: NFR-1, AC-26, AC-27, AC-38, AC-39, AC-40, AC-48, AC-54, AC-64, AC-65, AC-66, AC-67, AC-68, AC-69, AC-70, EC-3, EC-9, EC-10, EC-11, EC-12
- Rules / skills: server-app; onion-architecture
- Practices:
  - Application ring: import only `@devdigest/shared` types, `./ports.js` and `./constants.js`.
  - The bus buffer comes in as an argument; no DB, Fastify or bus imports.
- Tests (test-writer): see Design notes → Test record
- Existing tests to update: none
- Done when: `pnpm typecheck && pnpm lint && pnpm arch` pass in `server/`.

### Step 6 — MultiAgentService, three GET routes, server README (server)
- Files: create `server/src/modules/reviews/multi-agent-service.ts` · modify `server/src/modules/reviews/routes.ts` · modify `server/README.md`
- Change:
  - `new MultiAgentService(deps: ReviewDeps, reviews: Pick<ReviewService,'reviewsForPull'>)` with `listRuns`, `getRun` and `estimates`. They compose the store reads, `reviewsForPull` (eval markers + names) and the Step 5 helpers, with `deps.bus.buffer(runId)` for the state.
  - Add the routes from Design notes → Routes.
  - Add them, and the `agentIds` body, to the `server/README.md` API map (line 77).
- Covers: AC-12, AC-26, AC-36, AC-41, AC-58, NFR-3, EC-5, EC-9, EC-13
- Rules / skills: server-app; onion-architecture; fastify-best-practices; security
- Practices:
  - Check `getPull(workspaceId, prId)` first, else `NotFoundError` (`service.ts:198-199`). An unknown `runId` throws `NotFoundError`.
  - Zod `params` (`id` and `runId` as uuid) and `response` on each route (`routes.ts:117-123`).
  - No `Container` in the service; `platform/container.ts` is unchanged.
- Tests (test-writer): see Design notes → Test record
- Existing tests to update: none
- Done when: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm arch` pass in `server/`.

### Step 7 — Move shared components to src/components; Escape on Drawer (client)
- Files: create `client/src/components/run-trace-drawer/RunTraceDrawer.tsx`, `client/src/components/run-trace-drawer/constants.ts`, `client/src/components/run-trace-drawer/helpers.ts`, `client/src/components/run-trace-drawer/index.ts`, `client/src/components/run-trace-drawer/styles.ts`, `client/src/components/run-trace-drawer/_components/atoms.tsx`, `client/src/components/run-trace-drawer/_components/FindingsSection/FindingsSection.tsx`, `client/src/components/run-trace-drawer/_components/FindingsSection/index.ts`, `client/src/components/run-trace-drawer/_components/PromptBlock/PromptBlock.tsx`, `client/src/components/run-trace-drawer/_components/PromptBlock/index.ts`, `client/src/components/run-trace-drawer/_components/PromptModalBody/PromptModalBody.tsx`, `client/src/components/run-trace-drawer/_components/PromptModalBody/index.ts`, `client/src/components/run-trace-drawer/_components/SkillBlockRows/SkillBlockRows.tsx`, `client/src/components/run-trace-drawer/_components/SkillBlockRows/index.ts`, `client/src/components/run-trace-drawer/_components/ToolCallRow/ToolCallRow.tsx`, `client/src/components/run-trace-drawer/_components/ToolCallRow/index.ts`, `client/src/components/run-trace-drawer/_components/TraceBody/TraceBody.tsx`, `client/src/components/run-trace-drawer/_components/TraceBody/index.ts`, `client/src/components/run-trace-drawer/_components/TraceSection/TraceSection.tsx`, `client/src/components/run-trace-drawer/_components/TraceSection/index.ts`, `client/src/components/finding-card/FindingCard.tsx`, `client/src/components/finding-card/constants.ts`, `client/src/components/finding-card/helpers.ts`, `client/src/components/finding-card/index.ts`, `client/src/components/finding-card/styles.ts`, `client/src/components/finding-case-editor/FindingCaseEditor.tsx`, `client/src/components/finding-case-editor/index.ts`
  (all made by `git mv` of the folders `RunTraceDrawer/`, `FindingCard/`, `FindingCaseEditor/` from `client/src/app/repos/[repoId]/pulls/[number]/_components/`; use `git mv`, not copy + delete, so the plan check sees renames)
  · modify `client/src/vendor/ui/kit/Drawer.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx`
- Change:
  - Move the three folders unchanged (their imports are folder-relative or `@/`).
  - Point the 4 import sites at `@/components/run-trace-drawer`, `@/components/finding-card` and `@/components/finding-case-editor`.
  - `Drawer` gets a keydown effect: Escape calls `onClose`, with cleanup.
- Covers: NFR-5, AC-73
- Rules / skills: client-src; frontend-architecture
- Practices:
  - Promote on the 2nd consumer to `src/components/<kebab-name>/` (root `AGENTS.md` Naming).
  - Nested `_components/<PascalName>/` keep their names.
  - Keep `FindingsPanel`'s `[role="dialog"]` guard (`client/INSIGHTS.md:358-363`).
- Tests (test-writer): none
- Existing tests to update: `git mv` moves `RunTraceDrawer.test.tsx`, `FindingCard.test.tsx` and `FindingCaseEditor.test.tsx` with their folders
- Done when:
  - `pnpm typecheck && pnpm lint && pnpm test` pass in `client/`.
  - `rg -n "_components/(RunTraceDrawer|FindingCard|FindingCaseEditor)" client/src` returns nothing.

### Step 8 — Hooks, keys, sidebar item, messages (client)
- Files: create `client/src/lib/hooks/multi-agent.ts` · create `client/messages/en/multiAgent.json` · modify `client/src/lib/hooks/reviews.ts`, `client/src/lib/hooks/index.ts`, `client/src/lib/query-keys.ts`, `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/hooks/useNavLabel.ts`, `client/src/components/app-shell/constants.ts`
- Change:
  - Keys:
    - `keys.pr.multiAgentRuns(prId)` = `["pr", prId, "multi-agent-runs"]`
    - `keys.pr.multiAgentRun(prId, runId)` = that key + `runId`
    - `keys.reviewEstimates()`
  - Hooks:
    - `useMultiAgentRuns(prId)`.
    - `useMultiAgentRun(prId, runId)`: `refetchInterval` 4000 ms while any column is `queued`/`running`, else `false`.
    - `useReviewEstimates()`.
  - `RunReviewInput.agentIds?: string[]`.
  - `useRunReview` and `useFindingAction` also invalidate `keys.pr.multiAgentRuns(prId)`. `useRunReview` returns the invalidate promise.
  - NAV: a `multi-agent` item in WORKSPACE, `href: "/repos/:repoId/multi-agent"`, no literal label. `useNavLabel` resolves it from `shell.nav.multi-agent` (that text exists at `shell.json:29`).
  - New strings go in `multiAgent.json` (Design notes → i18n).
- Covers: AC-35, AC-50, AC-58, AC-63, EC-14, NFR-6
- Rules / skills: client-src; client-i18n; frontend-architecture
- Practices:
  - Keys only from the factory (`client/INSIGHTS.md:135-139`).
  - Poll like `usePrRuns` (`client/src/lib/hooks/reviews.ts:41-48`).
  - A mutation that navigates resolves after the refetch (`client/INSIGHTS.md:156-160`).
  - Nav label from a namespace (`client/INSIGHTS.md:382-385`). `useNavLabel` today reads only `eval`: switch it to root `useTranslations()` with full paths (`eval: "eval.nav.label"`).
  - Leave the stale `runs.json` `page` block (`client/AGENTS.md` Gotchas).
- Tests (test-writer): see Design notes → Test record
- Existing tests to update: `client/src/lib/hooks/reviews.test.tsx` if it asserts invalidations; any Sidebar/nav label test
- Done when: `pnpm typecheck && pnpm lint && pnpm test` pass in `client/`.

### Step 9 — Agent checklist, PR page Run Review, header link (client)
- Files: create `client/src/components/agent-checklist/AgentChecklist.tsx`, `client/src/components/agent-checklist/index.ts`, `client/src/components/agent-checklist/styles.ts` · modify `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/RunReviewDropdown.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx`, `client/messages/en/prReview.json`
- Change:
  - `AgentChecklist({ agents, checked, onToggle, onSelectAll?, onClearAll?, estimates? })` renders the kit `Checkbox` per agent, with an estimate or "no estimate".
  - `RunReviewDropdown` becomes a popover: the checklist of enabled agents, all checked on open, plus a Run button.
    - 1 checked: `agentIds: [id]`, then today's `onRunsStarted` flow.
    - ≥2 checked: after the mutation resolves, `router.push('/repos/<repoId>/multi-agent?pr=<number>&run=<multi_agent_run_id>')`. `repoId` comes from `useParams`; the new `prNumber` prop comes from `PrDetailHeader` (`pr.number`).
    - Keep the merged warning and "Configure agents…".
  - `PrDetailHeader` gets a ghost "Multi-Agent Review" `Link` to `?pr=<number>`.
- Covers: AC-31, AC-32, AC-33, AC-34, NFR-5
- Rules / skills: client-src; frontend-architecture; react-best-practices
- Practices:
  - Checked state is local, reset on open.
  - Never mutate from an effect (`client/INSIGHTS.md:558-565`).
  - The popover closes on outside click and on Escape.
  - Real `<button>`/`<Link>` elements (`client/AGENTS.md`).
- Tests (test-writer): see Design notes → Test record
- Existing tests to update: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/RunReviewDropdown.test.tsx` (expects the old items)
- Done when: `pnpm typecheck && pnpm lint && pnpm test` pass in `client/`.

### Step 10 — Route page and Configure run screen (client)
- Files: create `client/src/app/repos/[repoId]/multi-agent/page.tsx`, `client/src/app/repos/[repoId]/multi-agent/layout.tsx`, `client/src/app/repos/[repoId]/multi-agent/_components/ConfigureRun/ConfigureRun.tsx`, `client/src/app/repos/[repoId]/multi-agent/_components/ConfigureRun/helpers.ts`, `client/src/app/repos/[repoId]/multi-agent/_components/ConfigureRun/index.ts`, `client/src/app/repos/[repoId]/multi-agent/_components/ConfigureRun/styles.ts`
- Change:
  - The page reads `pr`, `run`, `new`, `view` and `trace` with `useSearchParamState`, maps `pr` to the PR id via `usePulls(repoId)` and picks the screen (Design notes → Page states). It leaves a results slot for G3.
  - `ConfigureRun`:
    - PR picker (kit `SearchableSelect`, `#<number> · <title>`); "Pick a pull request first" until one is picked.
    - `AgentChecklist` of enabled agents, all checked, with Select all / Clear all and estimates from `useReviewEstimates`.
    - Totals in `helpers.ts`: time = max average, cost = sum, partial if any checked agent has no estimate.
    - Button "Run multi-agent review (N)" / "Run 1 agent", disabled when nothing is checked or no PR is picked.
    - Empty / `Skeleton` / `ErrorState` + retry.
    - Run: `agentIds`, then set `run` and drop `new`.
  - `layout.tsx` follows `client/src/app/repos/[repoId]/onboarding/layout.tsx`.
- Covers: AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30, AC-36, AC-37, AC-43, EC-15, NFR-5, NFR-6
- Rules / skills: client-src; client-app-router; next-best-practices; react-best-practices
- Practices:
  - Read `client/docs/design/src/screen_multiagent.jsx` and `components2.jsx` first.
  - Thin page with `usePageCrumb`.
  - Derive the totals during render.
  - Wrap the `useSearchParams` user in `<Suspense>`.
  - The PR title is rendered as text.
- Tests (test-writer): see Design notes → Test record
- Existing tests to update: none
- Done when: `pnpm typecheck && pnpm lint && pnpm test` pass in `client/`, and `pnpm build` succeeds (stop `pnpm dev` first).

### Step 11 — Results shell: meta, selector, banner, switch, drawer (client)
- Files: create `client/src/app/repos/[repoId]/multi-agent/_components/MultiAgentResults/MultiAgentResults.tsx`, `client/src/app/repos/[repoId]/multi-agent/_components/MultiAgentResults/helpers.ts`, `client/src/app/repos/[repoId]/multi-agent/_components/MultiAgentResults/index.ts`, `client/src/app/repos/[repoId]/multi-agent/_components/MultiAgentResults/styles.ts` · modify `client/src/app/repos/[repoId]/multi-agent/page.tsx`
- Change:
  - `useMultiAgentRun`, with `Skeleton` while loading and `ErrorState` + retry on error.
  - Meta row: agent count, wall time, cost (marked "partial" when `cost_partial`), tokens.
  - Run selector (`useMultiAgentRuns`) and "Start new review".
  - Banner when `preparation_error` is set.
  - Columns/Tabs switch (kit `Tabs`, Columns by default, kept in `?view=`).
  - `RunTraceDrawer` from `?trace=` (`running` = queued/running, plus the column's findings and agent name).
- Covers: AC-38, AC-39, AC-40, AC-41, AC-42, AC-43, AC-44, AC-45, AC-46, AC-54, AC-73, AC-74, AC-75, EC-2, EC-5, EC-12, NFR-5, NFR-6
- Rules / skills: client-src; client-app-router; react-best-practices; security
- Practices:
  - Error and banner text render as plain text (security rule 7).
  - Cost via `client/src/lib/format-cost.ts`.
  - Components stay ≤200 lines; split into nested `_components/`.
- Tests (test-writer): see Design notes → Test record
- Existing tests to update: none
- Done when: `pnpm typecheck && pnpm lint && pnpm test` pass in `client/`.

### Step 12 — Columns mode (client)
- Files: create `client/src/app/repos/[repoId]/multi-agent/_components/MultiAgentResults/_components/AgentColumns/AgentColumns.tsx`, `client/src/app/repos/[repoId]/multi-agent/_components/MultiAgentResults/_components/AgentColumns/index.ts`, `client/src/app/repos/[repoId]/multi-agent/_components/MultiAgentResults/_components/AgentColumns/styles.ts` · modify `client/src/app/repos/[repoId]/multi-agent/_components/MultiAgentResults/MultiAgentResults.tsx`
- Change: one column per run.
  - Header: name ("Unknown agent" when null), a state label (running shows elapsed), and duration/cost/score when done.
  - Failed column: the error text.
  - Done column: severity, title, `file:line` per finding.
  - Footer: "View trace (N)", which sets `?trace=`.
  - More than 5 columns scroll sideways.
  - A 1 s tick runs only while some column is running.
- Covers: AC-47, AC-48, AC-49, AC-50, AC-51, AC-52, AC-53, AC-55, AC-56, AC-57, AC-58, EC-1, EC-4, EC-10, EC-13, NFR-5, NFR-7
- Rules / skills: client-src; react-best-practices
- Practices:
  - Each state gets a distinct `var(--…)` colour plus a text label in both themes (NFR-7).
  - Key columns by `run_id`.
  - Clean up the interval.
- Tests (test-writer): see Design notes → Test record
- Existing tests to update: none
- Done when: `pnpm typecheck && pnpm lint && pnpm test` pass in `client/`.

### Step 13 — Tabs mode (client)
- Files: create `client/src/app/repos/[repoId]/multi-agent/_components/MultiAgentResults/_components/AgentTabs/AgentTabs.tsx`, `client/src/app/repos/[repoId]/multi-agent/_components/MultiAgentResults/_components/AgentTabs/index.ts` · modify `client/src/app/repos/[repoId]/multi-agent/_components/MultiAgentResults/MultiAgentResults.tsx`
- Change:
  - One tab per run (name + score).
  - The selected tab shows summary, score, duration, cost and "View trace".
  - Each finding is a `FindingCard`, with `onAction` → `useFindingAction` and `onTurnIntoEvalCase` → `FindingCaseEditor`.
- Covers: AC-59, AC-60, AC-61, AC-62, AC-63, EC-14, NFR-5
- Rules / skills: client-src; react-best-practices; security
- Practices:
  - Reuse `FindingCard` as-is: it already renders rationale and suggestion through `Markdown` (`FindingCard.tsx:98-104`).
  - Pass `repoFullName`/`headSha` as the PR page does.
  - The summary is plain text.
- Tests (test-writer): see Design notes → Test record
- Existing tests to update: none
- Done when: `pnpm typecheck && pnpm lint && pnpm test` pass in `client/`.

### Step 14 — "Where agents disagree", client README, spec Status (client)
- Files: create `client/src/app/repos/[repoId]/multi-agent/_components/MultiAgentResults/_components/DisagreeBlock/DisagreeBlock.tsx`, `client/src/app/repos/[repoId]/multi-agent/_components/MultiAgentResults/_components/DisagreeBlock/index.ts` · modify `client/src/app/repos/[repoId]/multi-agent/_components/MultiAgentResults/MultiAgentResults.tsx`, `client/README.md`, `specs/14-multi-agent-review.md`
- Change:
  - Groups show file, `start–end` and title.
  - One take per column: severity + title, "did not flag", "failed" or "running".
  - "Show only conflicts" (kit `Toggle`) filters by `conflicts`. With no conflict it shows "No conflicts — the agents agree on every flagged location."
  - Opening a take (a button) expands the original finding (agent, rationale, suggestion via `Markdown`), looked up by `finding_id`.
  - Add the route to the `client/README.md` route map (line 36).
  - Set the spec `Status:` per `specs/README.md`.
- Covers: AC-64, AC-65, AC-66, AC-67, AC-68, AC-69, AC-70, AC-71, AC-72, EC-3, EC-10, EC-11, NFR-5, NFR-6
- Rules / skills: client-src; react-best-practices; security
- Practices: derive the filtered list during render; no raw HTML from model text.
- Tests (test-writer): see Design notes → Test record
- Existing tests to update: none
- Done when: `pnpm typecheck && pnpm lint && pnpm test` pass in `client/`, and `./scripts/check-changed.sh` passes.

## Contracts & migrations
- Shared contracts sync: yes — `platform.ts`, `review-api.ts`, `observability.ts` (Step 1)
- Schema change + `pnpm db:generate`: no
- Spec `Status` update: yes — Step 14

## Verification
| Package | Checks (from routing.json) |
|---|---|
| server | `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm arch` |
| client | `pnpm typecheck` · `pnpm lint` · `pnpm test` |
Plus extra checks: `./scripts/shared-contracts.sh check`. Needs Postgres: no.
All of the above in one command: `./scripts/check-changed.sh` (G1, G2 `--quick`; G3 full).

Post-build sequence (user-approved):
1. `architecture-reviewer` and the correctness reviewer (`pr-skill-reviewer` `correctness`) in one message.
2. Review loop, **max 2 rounds**: one fix-mode `implementer`, then an `architecture-reviewer` `recheck:`. Still open after round 2 → stop and ask the user.
3. `implementation-verifier` (`tests: off`).
4. `security-reviewer` (`mode: diff`).

No `test-writer` and no `doc-writer`: the READMEs are Steps 6 and 14. `/pr-self-review` is the user's gate. The final report states that there are no new tests.

## Insights to record
- `server/INSIGHTS.md` · Codebase Patterns — `queued` is derived: a `running` row whose bus buffer has no `agent-started` event. It works on a single instance only and is lost on restart. A stored `queued` would break mcp (`mcp/src/wait.ts:14-21`). (Where: `server/src/modules/reviews/run-executor.ts:206`)
- `server/INSIGHTS.md` · Codebase Patterns — multi-agent run id = `batch_id`, or the run id for a local null-batch run; `source='ci'` is hidden. (Where: `server/src/modules/reviews/multi-agent.ts`, line of `batchKey`)
- `client/INSIGHTS.md` · Codebase Patterns — the Multi-Agent page polls instead of one SSE stream per column (6 connections per origin over HTTP/1.1); only the drawer streams. (Where: `client/src/lib/hooks/multi-agent.ts`, line of `useMultiAgentRun`)

<!-- implementer-brief:end -->

## Context read
- `specs/14-multi-agent-review.md:104-223` ids; `:85-93` wire; `:241-247` untrusted inputs; `:250-251` OQ defaults.
- `docs/plans/10-multi-agent-review.brainstorm.md:57-76` D1–D5 and option 1; `:148-185` For the planner; `:201-207` User decisions.
- `server/src/modules/reviews/service.ts:54-77` resolveTargets; `:137-175` runReview (one `batchId`); `:197-216` reviewsForPull.
- `server/src/modules/reviews/run-executor.ts:77-96` failAll; `:98-143` prep; `:145-184` loop; `:206` start event.
- `server/src/platform/sse.ts:54-75` — `publish(…, data)`, `buffer(runId)`; `server/src/modules/reviews/deps.ts:55-75` ReviewDeps with `bus`.
- `server/src/modules/reviews/ports.ts:118-164` ReviewStore; `repository/run.repo.ts:40-69`.
- `server/src/db/schema/runs.ts:26-55` — `agent_id` FK set null, nullable `batch_id`, `source` enum, status CHECK.
- `server/src/vendor/shared/contracts/observability.ts:22-86` unused stubs (no consumer outside vendored copies); `review-api.ts:19-75`; `platform.ts:302-306`.
- `server/test/reviews-service.test.ts:67-78,231-303` — fakes cast `as unknown as ReviewStore`; the executor fake has only the methods it uses.
- `server/INSIGHTS.md:58-63, 81-92, 320-331, 369-378, 431-434, 593-606`; `client/INSIGHTS.md:127-139, 156-160, 358-363, 382-385, 497-500, 558-565`.
- `client/src/lib/hooks/reviews.ts:41-48,184-222`; `client/src/lib/query-keys.ts:22-35,77`; `client/src/vendor/ui/nav.ts:23-41`; `client/src/components/app-shell/hooks/useNavLabel.ts:12-18`; `constants.ts:7`; `helpers.ts:30`; `client/messages/en/shell.json:29`.
- `RunReviewDropdown.tsx:15-111`, `PrDetailHeader.tsx:11-28,104-110`, PR `page.tsx:50,201-208`; `client/src/vendor/ui/kit/Drawer.tsx:4-40` (no Escape).
- `.claude/skills/pr-self-review/assets/routing.json`; `docs/agent-workflow-cost.md:96-106`.

## Requirements trace
| R | Requirement (source `path:line` or "request") | Steps |
|---|---|---|
| AC-1..AC-12 | `specs/14-multi-agent-review.md:106-117` | 1–6 |
| AC-13..AC-30 | `:120-138` | 4, 5, 6, 10 |
| AC-31..AC-35 | `:141-146` | 8, 9 |
| AC-36..AC-46 | `:149-159` | 5, 6, 10, 11 |
| AC-47..AC-58 | `:162-173` | 5, 8, 12 |
| AC-59..AC-63 | `:176-180` | 8, 13 |
| AC-64..AC-72 | `:183-191` | 5, 14 |
| AC-73..AC-75 | `:194-196` | 7, 11 |
| EC-1..EC-16, NFR-1..NFR-7 | `:199-223` | per step Covers |
| No new tests, 3 implementers, ≤2 fix rounds, `ci/` `agent-runner/` untouched | request | Step groups, Verification |
Recommendations: 3 sequential groups — accepted · post-build sequence with correctness + security — accepted · `agentIds.max(50)` — accepted (Step 1).

## Affected modules
| Package | Path | Ring / layer | Change |
|---|---|---|---|
| server | `server/src/vendor/shared/contracts/*` | core — domain | new/replaced contracts |
| server | `reviews/{service,multi-agent,multi-agent-service,run-executor,constants}.ts` | application | list targets, parallel loop, read model |
| server | `reviews/ports.ts` | core — ports | 2 methods, 2 types |
| server | `reviews/{routes,repository}.ts`, `repository/run.repo.ts` | outer ring | 3 GET routes, 2 queries |
| client | `src/components/{run-trace-drawer,finding-card,finding-case-editor,agent-checklist}` | shared | moved / new |
| client | `src/app/repos/[repoId]/multi-agent/**` | route | new |
| client | `src/lib/hooks/*`, `src/lib/query-keys.ts` | data | hooks, keys |
| client | `src/vendor/ui/{nav.ts,kit/Drawer.tsx}`, `src/components/app-shell/*` | shell | nav item, Escape |

## Constraints honored
| Rule | Source (`path:line`) | How the plan respects it |
|---|---|---|
| Onion, imports inward | `.claude/skills/onion-architecture/SKILL.md` | helpers + service on ports; SQL in `run.repo.ts`; `pnpm arch` |
| Contracts edited server-side, synced | root `AGENTS.md` Cross-package rules | Step 1 |
| No hand-written migration | root `AGENTS.md` Do not touch | no schema change |
| DB tests `.it.test.ts` | root `AGENTS.md` Naming | Test record names |
| i18n per feature file | root `AGENTS.md` Naming | `multiAgent.json`, `prReview.json` |
| Shared components in `src/components/<kebab>/` | root `AGENTS.md` Naming; brief D3 | Steps 7, 9 |
| mcp keeps working | spec `:43-44`; `mcp/src/api/schemas.ts:140-146` | `RunSummary`/`ReviewRecord` unchanged; old body valid; no new status |
| Rate limit 10/min | `routes.ts:35` | unchanged |
| Worktree B attribution | brief `:53,:159` | `insertReview`, `source` untouched |

## Design notes

### Contracts (observability.ts unless noted)
- `platform.ts` `RunRequest`: add `agentIds: z.array(z.string().uuid()).min(1).max(50).optional()`.
- `review-api.ts` `ReviewRunResponse`: add `multi_agent_run_id: z.string()`.
- `ColumnState = z.enum(['queued','running','done','failed','cancelled'])`.
- `MultiAgentFinding = FindingRecord.extend({ agent_id: nullable, agent_name: nullable, run_id: z.string() })` (import from `./review-api.js`).
- `AgentColumn = { run_id, agent_id?, agent_name?, state, error?, duration_ms?, cost_usd?, tokens_in?, tokens_out?, score?, verdict?, summary?, findings: MultiAgentFinding[] }` (`?` = nullable).
- `GroupTake = { run_id, agent_id?, agent_name?, take: enum['flagged','did_not_flag','failed','running'], finding_id?, severity: Severity nullable, title? }`.
- `FindingGroup = { id, file, start_line, end_line, title, finding_ids: string[], takes: GroupTake[] }`.
- `MultiAgentRun = { id, pr_id, ran_at, agent_count, total_duration_ms?, total_cost_usd?, cost_partial: boolean, tokens_in, tokens_out, preparation_error?, columns, groups, conflicts: string[] (group ids) }`.
- `MultiAgentRunListItem = { id, ran_at, agent_count }`; `AgentRunEstimate = { agent_id, avg_duration_ms?, avg_cost_usd?, runs }`.

### Store (ports.ts)
- `BatchRunRow { id; batchId|null; source: 'local'|'ci'; agentId|null; agentName|null; status|null; error|null; durationMs, tokensIn, tokensOut, costUsd, score: number|null; ranAt: Date }`.
- `DoneRunSample { agentId; durationMs|null; costUsd|null }`.
- `listBatchRunsForPull(workspaceId, prId)`; `recentDoneRuns(workspaceId, perAgent)` (called with 5).

### Routes (reviews/routes.ts)
- `GET /pulls/:id/multi-agent-runs` → `MultiAgentRunListItem[]` (≤10, newest first).
- `GET /pulls/:id/multi-agent-runs/:runId` → `MultiAgentRun`, or 404.
- `GET /review-estimates` → `AgentRunEstimate[]` for the workspace.

### Algorithm (multi-agent.ts)
- `batchKey = batchId ?? id`. Drop `source='ci'`. `ran_at` = the batch's min `ranAt`. The list is sorted desc, top 10.
- `columnState`:
  - `running` with no buffer event where `data.phase === AGENT_STARTED_PHASE` → `queued`.
  - `running` → `running`.
  - `done`/`failed`/`cancelled` → the same value.
  - null → `failed`.
- Columns are ordered by `ranAt`, then id. Findings come from the `ReviewDto` with a matching `run_id`, each tagged with `agent_id`, `agent_name` and `run_id`.
- Groups: per file, sort findings by `start_line` and sweep, extending `end = max(end, end_line)` while `start_line <= end` (transitive, EC-11). `title` = the first finding by (`start_line`, severity rank, id). `id` = `${file}:${start}-${end}`.
- Takes:
  - failed/cancelled → `failed`
  - queued/running → `running`
  - done with a finding → `flagged`, using the representative finding (highest severity, earliest line, lowest id)
  - done without a finding → `did_not_flag`
- A group is a conflict when some take is `did_not_flag` or the `flagged` severities differ. One column can never be a conflict (EC-10).
- Totals:
  - `total_duration_ms` = max over finished columns, or null.
  - Cost = sum of non-null costs, or null.
  - `cost_partial` = some done column has a null cost.
  - Tokens = sums, with null counted as 0.
- `preparation_error` = the shared error when every column failed with an error starting with `PREP_ERROR_PREFIX`, else null.
- `estimateByAgent`: per agent, average duration over non-null values and cost over non-null values. Agents with no sample are absent.

### Page states (`/repos/[repoId]/multi-agent`)
- No `pr` → Configure, nothing selected (AC-13).
- `pr` + `new=1` → Configure with the PR (AC-43).
- `pr` with no runs → Configure with the PR (AC-37).
- Otherwise → Results for `run ?? list[0].id` (AC-36, AC-42).
- Unknown number → Configure, nothing selected.

### i18n (`client/messages/en/multiAgent.json`)
`title`, `crumb`, `configure.*`, `empty.*`, `results.*`, `view.*`, `state.*` (5 states + elapsed), `column.*` (View trace, Unknown agent), `disagree.*`. Texts as quoted in the spec ACs.

### Test record (when tests are turned on; nobody writes these now)
- `server/test/reviews-service.test.ts`: AC-1, AC-2, AC-3, AC-4, AC-5, AC-7, AC-9, AC-10.
- `server/test/reviews-multi-agent.test.ts`: AC-26, AC-27, AC-40, AC-48, AC-66, AC-67, AC-68, AC-69, EC-3, EC-10, EC-11, EC-12.
- `server/test/reviews-multi-agent.it.test.ts`: AC-6, AC-11, AC-12, AC-36, AC-41, NFR-3, EC-9.
- client:
  - `multi-agent.test.tsx` (hooks): AC-50, AC-63.
  - `AgentChecklist.test.tsx`: AC-31.
  - `RunReviewDropdown.test.tsx`: AC-32, AC-33.
  - `ConfigureRun.test.tsx`: AC-14, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-27, AC-28, AC-29, AC-30.
  - `MultiAgentResults.test.tsx`: AC-38, AC-39, AC-40, AC-41, AC-42, AC-46, AC-54.
  - `AgentColumns.test.tsx`: AC-48, AC-49, AC-51, AC-52, AC-53, AC-56, AC-57.
  - `AgentTabs.test.tsx`: AC-59, AC-60, AC-61, AC-62.
  - `DisagreeBlock.test.tsx`: AC-66, AC-67, AC-68, AC-69, AC-70, AC-71, AC-72.

### Behaviour notes
- The PR page now always sends the checked `agentIds`, so the `applies_to` skip and its toast no longer happen there (AC-31/AC-32). `all: true` keeps working for mcp (AC-3).
- After "Turn into eval case" on this page, the marker refreshes on the next multi-agent refetch: the eval hooks invalidate `isPrReviewsKey` (`client/src/lib/query-keys.ts:77`), not the multi-agent key.

### Spec follow-up
- `agentIds.max(50)` is a user-approved addition under AC-1, AC-5 and NFR-4. No spec criterion states this rejection, so an amendment (new id via `spec-creator`) is optional and left to the user.
- OQ-1 and OQ-2 use their defaults (OQ-1 refined to hide `source='ci'`).

## Risks & open questions
- Derived `queued` is lost on an API restart. The boot reaper fails those rows anyway (`server/INSIGHTS.md:58-63`).
- Wall time of pre-feature (sequential) batches is underestimated (accepted).
- Cancel: `RunBus.complete` clears the cancel flag (`server/src/platform/sse.ts:91-97`). The row shows `cancelled` (EC-4) while the model call may keep running. This is pre-existing; the page makes it visible.
- Parallel provider calls raise the 429 risk. EC-1 isolation covers it; the batch size is capped at 50 and by the workspace's agents.
- Step 7 moves 26 files plus 3 tests. Expect a sidebar merge conflict with worktree B (spec `:101-102`).
- The `useNavLabel` change touches shell code: check that the Eval label still renders.
- G1 has 6 steps (above the usual 3–5) because of the 3-implementer cap. All of them stay in one module.
- The brief is still above 20 000 characters, mostly the file lists of the moves and the client steps.

## Handed off
- Architecture reviewer:
  - `MultiAgentService` taking `Pick<ReviewService,'reviewsForPull'>`.
  - `multi-agent.ts` must stay free of bus, DB and Fastify imports.
  - No route-to-route imports may remain after the moves.
  - The `useNavLabel` namespace change.
- Security reviewer:
  - `agentIds`: cap, workspace resolution before any row (NFR-3, NFR-4).
  - New GET routes: scoped by `getPull(workspaceId, …)` and `workspace_id`.
  - Window query: `sql` template only.
  - Model text in columns, takes, tabs and banner: rendered as text or `Markdown`.
