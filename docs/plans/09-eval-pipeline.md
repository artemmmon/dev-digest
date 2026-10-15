# Development Plan: Eval Pipeline (cases from findings, run-level evals, scoring by code, Evals tab, Eval Dashboard)
Status: implemented
Spec: specs/13-eval-pipeline.md
Brainstorm: docs/plans/09-eval-pipeline.brainstorm.md
Execution mode: multi-agent (chosen by the user)

## Goal
Implement SPEC-13 as brainstorm option 2: a new server `eval` module (cases, a background run per agent with a DB claim and a boot reaper, scoring by code), the Evals tab, the Eval Dashboard and Compare. Stretch (a), (b) and (c) come last as groups that can be cut.
In scope: contracts, eval tables, `reviews/index.ts`, `ResolvedSkill.version`, eval markers on findings, `pnpm verify:l06`, client screens, stretch (a)/(b)/(c).
Out of scope: CI workflow changes, declined features (spec Non-goals), docs, skill-owned cases.

Tests are ON: `test-writer` runs after the build and names each test after its id. The only test an implementer writes is the AC-51 check in step 11.
User decisions: cases run **sequentially**; **exactly one request** per case (`maxRetries: 0` + `transportRetries: 0`) under a **120 s deadline**; a seeded Save stores the **posted** diff and meta after the checks; "counted run" = AC-66. Exact shapes, tables and flows: **Design notes** below the marker. Steps point there.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | 1–4 | server contracts (+client copy), schema, agents port, reviews surface | — | Schemas of Design notes → Contracts; tables `evalCases`/`evalRuns`/`evalCaseResults`; `ResolvedSkill.version`; `reviews/index.ts` exports |
| G2 | 5–9 | server `modules/eval`, container, app | G1 | Routes of Design notes → Routes live; `container.evalRepo` has `caseIdsBySourceFinding` |
| G3 | 10–11 | server reviews read path, `verify:l06` | G2 | Findings carry eval markers; `pnpm verify:l06` |
| G4 | 12–14 | client hooks, `components/eval`, PR page | G1 (parallel with G2/G3) | `lib/hooks/eval.ts`, `keys.eval.*`, `CaseEditor`, `components/eval/helpers.ts` |
| G5 | 15–16 | client Evals tab | G4 | `MetricCards`, `RegressionAlert`, `RunsTable` |
| G6 | 17–18 | client nav, `/eval`, `/eval/[agentId]`, Compare | G5 | Core done; sets the spec `implemented` if stretch is cut |
| G7 | 19–20 | stretch (a) server + client | G3 and G6 | `PUT`/`DELETE /eval-cases/:id`, editable `CaseEditor` |
| G8 | 21–22 | stretch (b) server + client | G7 | Last code group: sets spec `Status: implemented` |
| G9 | 23 | stretch (c) `evals/` | — (parallel with any) | — |

## Skills behind the steps
| Path glob (routing.json rule id) | Skills | Why they matter here |
|---|---|---|
| `server/src/{modules,platform}/**`, `server/src/*.ts` (server-app) | onion-architecture, fastify-best-practices | module, structural ports, wiring, thin routes |
| repositories, `server/src/db/**` (server-data) | drizzle-orm-patterns | claim, cascades, distinct-on, transactions |
| `server/src/db/schema/**` (server-schema) | postgresql-table-design | FK indexes, partial unique index, `numeric` money |
| `*/src/vendor/shared/**` (shared-contracts-*) | zod, onion-architecture | schemas, nullable metrics, sync |
| `client/src/**` (client-src, client-app-router) | frontend-architecture, react-best-practices, next-best-practices | colocate vs `components/eval`, derived state, polling, modals |
| `client/messages/**` (client-i18n) | frontend-architecture | `eval.json` only (NFR-5) |
| `client/**/*.test.tsx` (client-tests) | react-testing-library | test-writer |
| all code (security-surface) | security | tenancy, rate limit, untrusted text rendered as text |
(The practices are in the steps. The implementer loads a skill only where a step says `load:`.)

## Steps

### Step 1 — Eval contracts and finding markers (contracts)
- Files: modify `server/src/vendor/shared/contracts/eval-ci.ts` · modify `server/src/vendor/shared/contracts/review-api.ts` · modify `client/src/vendor/shared/contracts/eval-ci.ts` · modify `client/src/vendor/shared/contracts/review-api.ts`
- Change: replace the unused case-level `EvalCaseInput`, `EvalRunRecord`, `EvalRunResult`, `EvalTrendPoint` and `EvalDashboard` (confirm no consumer with `rg`) with Design notes → Contracts, where metrics and cost are nullable. `knowledge.ts` stays as it is. Add `EvalUnavailableReason` and the optional (`.nullish()`) `FindingRecord.eval_case_id`/`eval_unavailable_reason`. Then run `./scripts/shared-contracts.sh sync`.
- Covers: none
- Rules / skills: zod, onion-architecture
- Practices: export schema + inferred type; put the AC-11 field rules in the schema, with the refine `path` on `end_line`, so a 422 names the field.
- Tests (test-writer): none
- Existing tests to update: none (`server/test/contracts.test.ts:159` parses the untouched `EvalRun`)
- Done when: `./scripts/shared-contracts.sh check` passes; `pnpm typecheck` passes in `server/`, `client/` and `mcp/`.

### Step 2 — Eval tables (schema)
- Files: modify `server/src/db/schema/eval.ts` · modify `server/src/db/schema.ts`
- Change: Design notes → Tables. Run `pnpm db:generate` twice: pass 1 only removes the old `eval_runs`, pass 2 adds the new columns and tables, so drizzle-kit asks no rename question. Export `evalCaseResults`.
- Covers: AC-10, AC-14, AC-23, AC-56, EC-4, EC-9
- Rules / skills: postgresql-table-design, drizzle-orm-patterns
- Practices: `cost_usd numeric(14,8)` (`server/INSIGHTS.md:491`); index FK columns; `timestamptz`. Partial index via `uniqueIndex(...).on(agentId).where(sql\`...\`)`; if the SQL has no `WHERE`, use Design notes → Claim fallback. Never hand-edit migrations.
- Tests (test-writer): in `server/test/eval.it.test.ts` (step 6)
- Existing tests to update: none
- Done when: `pnpm typecheck` passes in `server/`; the migration SQL has `ON DELETE cascade` on `eval_cases.agent_id`, `eval_runs.agent_id` and `eval_case_results.case_id`, a unique index on `source_finding_id`, and the partial index (or the fallback is noted).

### Step 3 — `ResolvedSkill.version` (agents)
- Files: modify `server/src/modules/agents/ports.ts` · modify `server/src/modules/agents/repository.ts`
- Change: add `version: number` to `ResolvedSkill`; `resolvedSkills` selects `t.skills.version` (AC-19, EC-7; answers `server/INSIGHTS.md:617`).
- Covers: AC-19, EC-7
- Rules / skills: onion-architecture
- Practices: a grown port breaks its fakes (`server/INSIGHTS.md:208`).
- Tests (test-writer): `server/test/eval.it.test.ts` — EC-7
- Existing tests to update: the `AgentStore` fake at `server/test/agents-service.test.ts:92` (read-only as built: the fake returns `[]`, so it needs no change)
- Done when: `pnpm typecheck` and `pnpm test:unit` pass in `server/`.

### Step 4 — `reviews/index.ts` and the shared rules text (reviews)
- Files: create `server/src/modules/reviews/index.ts` · modify `server/src/modules/reviews/helpers.ts`
- Change: split the PR-independent rules sentence out of `taskLine` (`helpers.ts:78`) into `reviewRulesText()`. `taskLine` output stays byte-identical. `index.ts` re-exports only `excludeFromReview`, `partitionSkills`, `skillBlockText`, `reviewRulesText`, `REVIEW_STRATEGY` and `REVIEW_EXCLUDED_PATHS`, as `smart-diff/index.ts` does.
- Covers: AC-21
- Rules / skills: onion-architecture
- Practices: other modules import only `index.ts` (depcruise `no-cross-module-internals`); no file moves.
- Tests (test-writer): `server/test/reviews-helpers.test.ts` (extend) — AC-21
- Existing tests to update: none
- Done when: `pnpm typecheck`, `pnpm test:unit` and `pnpm arch` pass in `server/`.

### Step 5 — Constants, case rules, scoring (eval, pure)
- Files: create `server/src/modules/eval/constants.ts` · create `server/src/modules/eval/case-rules.ts` · create `server/src/modules/eval/scoring.ts`
- Change: constants (limits, `EVAL_CASE_TIMEOUT_MS = 120_000`, `COUNTED_STATUSES`, error codes, fixed texts incl. the AC-63 message). `case-rules.ts`: `normalizeCaseDiff`, `fileRanges`, `isExcludedFile`, `checkCaseSave`, `appliedSkills` (Design notes → Case rules). `scoring.ts`: `matches`, `scoreCase`, `aggregate`, `runStatus` (Design notes → Scoring).
- Covers: AC-11, AC-27, AC-29, AC-30, AC-31, AC-32, AC-33, AC-34, AC-35, AC-36, AC-63, AC-64, AC-66, EC-12, EC-13, EC-14, EC-15, EC-16, NFR-1
- Rules / skills: onion-architecture, security
- Practices: `scoring.ts` imports contracts only. Range checks compare bounds and never loop over a model-supplied range. Ranges come from `newSideRanges` (`server/src/modules/_shared/hunks.ts:35`). `case-rules.ts` may import `../reviews/index.js`, `../_shared/*` and `@devdigest/reviewer-core`. Regexes are anchored.
- Tests (test-writer): `server/test/eval-scoring.test.ts` — AC-27, AC-29, AC-30, AC-31, AC-32, AC-33, AC-34, AC-35, AC-36, EC-12, EC-13, EC-14, EC-15, EC-16, NFR-1 · `server/test/eval-case-rules.test.ts` — AC-11, AC-63, AC-64, AC-66
- Existing tests to update: none
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm arch` pass in `server/`.

### Step 6 — Ports, repository, container (eval)
- Files: create `server/src/modules/eval/ports.ts` · create `server/src/modules/eval/repository.ts` · modify `server/src/platform/container.ts`
- Change: Design notes → Ports. Add a lazy `evalRepo` getter and an `evalDeps` getter (store, `agentsRepo`, `reviewRepo`, `llm`), in the pattern of `onboardingDeps` (`container.ts:188`).
- Covers: AC-10, AC-12, AC-16, AC-23, AC-28, AC-56, EC-4, EC-19, NFR-4
- Rules / skills: onion-architecture, drizzle-orm-patterns, security
- Practices: `ports.ts` declares narrow structural types and imports no module (`server/INSIGHTS.md:208`). Every query is filtered by `workspace_id`. The claim is one insert, and a `23505` error returns `null` (`server/INSIGHTS.md:411`). The case-result write and the counters update in one transaction guarded by `status='running'`. Return domain records; use only the `sql` template.
- Tests (test-writer): `server/test/eval.it.test.ts` — AC-10, AC-12, AC-16, AC-23, AC-28, AC-56, EC-4, EC-9 (10 concurrent claims, as `server/test/onboarding.it.test.ts:107`), EC-19, NFR-4
- Existing tests to update: none
- Done when: `pnpm typecheck` and `pnpm arch` pass in `server/`.

### Step 7 — Eval service (eval)
- Files: create `server/src/modules/eval/service.ts`
- Change: `listCases`, `createCase`, `startRun`, `listRuns`, `compare`, `dashboard`, `reapInterrupted` (Design notes → Service). `startRun` runs in this order: agent in workspace (404) → at least one case (422) → `deps.llm(provider)` with `ConfigError` mapped to 422 `provider_not_configured` naming the provider, before any insert → capture → claim (409) → `void executor.run(...)` → `{ run_id, status: 'running' }`.
- Covers: AC-7, AC-10, AC-11, AC-12, AC-16, AC-18, AC-19, AC-23, AC-24, AC-25, AC-42, AC-43, AC-48, AC-49, AC-50, AC-63, AC-64, AC-66, EC-6, EC-8, EC-17, EC-19, EC-20, NFR-4
- Rules / skills: onion-architecture, security
- Practices: the constructor takes ports, not the `Container`. Fixed `AppError` messages; never store or return a provider `err.message`. A seeded save checks that the finding is in the workspace and that its review agent is the route agent, then stores the POSTED values. A disabled agent can still run (EC-17).
- Tests (test-writer): `server/test/eval-service.test.ts` — AC-7, AC-10, AC-12, AC-18, AC-19, AC-23, AC-24, AC-25, AC-49, AC-50, EC-6, EC-8, EC-17
- Existing tests to update: none
- Done when: `pnpm typecheck` and `pnpm arch` pass in `server/`.

### Step 8 — Run executor (eval)
- Files: create `server/src/modules/eval/run-executor.ts`
- Change: `EvalRunExecutor.run(capture)` processes the captured cases sequentially per Design notes → Run flow. A throw, an invalid output or a timeout records the case as `error` and the run continues; at the end it aggregates and finishes with `runStatus`.
- Covers: AC-20, AC-21, AC-26, AC-27, EC-10, EC-11, NFR-2
- Rules / skills: onion-architecture, security
- Practices: the engine gets only the diff, `prDescription` (case body), `task` (`Review pull request "<title>". ` + `reviewRulesText()`), the captured `systemPrompt`/`model`/`strategy ?? REVIEW_STRATEGY`, skill blocks, `maxRetries: 0` and `sessionId`. No intent, scope, callers, repo map, context or memory. Wrap the `LLMProvider` to force `transportRetries: 0` and `timeoutMs` (`server/INSIGHTS.md:497`). Add a local `withDeadline` (`server/src/modules/onboarding/service.ts:50`). Never re-read the agent (EC-6).
- Tests (test-writer): `server/test/eval-service.test.ts` — AC-20, AC-21, AC-26, AC-27, EC-10, EC-11, NFR-2 (await through the store fake, `server/INSIGHTS.md:415`)
- Existing tests to update: none
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm arch` pass in `server/`.

### Step 9 — Routes, registry, reaper (eval)
- Files: create `server/src/modules/eval/routes.ts` · modify `server/src/modules/index.ts` · modify `server/src/app.ts`
- Change: the core routes of Design notes → Routes with one `EvalService` per plugin; register `eval`. `app.ts` awaits `new EvalService(container.evalDeps).reapInterrupted()` next to the onboarding reaper (`app.ts:91`); a failure there is not fatal.
- Covers: AC-14, AC-18, AC-23, AC-28, EC-18, NFR-3, NFR-4
- Rules / skills: fastify-best-practices, onion-architecture, security
- Practices: each handler is `getContext` → one service call → status. Zod params/querystring/body/response. Run start returns 202 with `rateLimit { max: 10, timeWindow: '1 minute' }` (`server/src/modules/reviews/routes.ts:35`); create returns 201.
- Tests (test-writer): `server/test/eval.it.test.ts` — AC-14, AC-18, AC-28, EC-18, NFR-3 (with the overrides of `server/INSIGHTS.md:569`)
- Existing tests to update: none
- Done when: `./scripts/check-changed.sh --quick` passes.

### Step 10 — Eval markers on findings (reviews)
- Files: modify `server/src/modules/reviews/deps.ts` · modify `server/src/modules/reviews/service.ts` · modify `server/src/modules/reviews/helpers.ts` · modify `server/src/platform/container.ts` · modify `server/test/reviews-service.test.ts`
- Change: `ReviewDeps.evalCases: { caseIdsBySourceFinding(ws, ids) }`, and the container passes `evalRepo`. `reviewsForPull` reads `getPrFiles` once and the case ids once. A pure `withEvalMarkers` in `helpers.ts` sets the markers in the order `no_agent` → `file_excluded` → `diff_unavailable`; the last means no patch, or no `newSideRanges` range intersects the finding. `actOnFinding` stays as it is: the client refetches after an action (`client/src/lib/hooks/reviews.ts:221`).
- Covers: AC-1, AC-8, AC-9, AC-65, EC-1, EC-2, EC-3, EC-20
- Rules / skills: onion-architecture
- Practices: reviews never imports `modules/eval`; two batched queries, none per finding.
- Tests (test-writer): `server/test/reviews-eval-markers.test.ts` — AC-1, AC-8, AC-9, AC-65, EC-1, EC-2, EC-3, EC-20
- Existing tests to update: the `ReviewDeps` literals in `server/test/reviews-service.test.ts`
- Done when: `pnpm typecheck`, `pnpm test:unit` and `pnpm arch` pass in `server/`.

### Step 11 — `pnpm verify:l06` and the scoring check (server)
- Files: modify `server/package.json` · create `server/test/eval-verify-l06.test.ts`
- As built (also changed, not in the Files line): `hw/L06/hw6-task.md` (the L06 homework brief, the source of the task, untracked and added in this change set).
- Change: add the script `"verify:l06": "pnpm typecheck && pnpm lint && vitest run --exclude '**/*.it.test.ts' test/eval-"`: unit lane only, no Docker, not in CI. The check runs `scoring.ts` and `EvalRunExecutor` (with an `EvalStore` fake and a canned `LLMProvider` fake) over a set that yields every metric. `deps.llm` throws for any other provider, and an empty `MockSecretsProvider` is used (`server/src/adapters/mocks.ts:347`).
- Covers: AC-51, NFR-1
- Rules / skills: onion-architecture
- Practices: no DB or network, so no `.it.` suffix. Test-writer's eval unit files are named `test/eval-*.test.ts` so the script picks them up.
- Tests (test-writer): none (this step writes the check)
- Existing tests to update: none
- Done when: `pnpm verify:l06` exits 0 in `server/` and runs the check; `./scripts/check-changed.sh --quick` passes.

### Step 12 — Client data layer and the eval namespace (client)
- Files: create `client/src/lib/hooks/eval.ts` · modify `client/src/lib/hooks/index.ts` · modify `client/src/lib/query-keys.ts` · modify `client/messages/en/eval.json`
- As built (deviation): `useEvalRuns` in `client/src/lib/hooks/eval.ts` invalidates `keys.eval.cases`, `keys.eval.trend` and `keys.eval.dashboard` when a polled run stops running, so the case outcomes, trend and dashboard show it.
- Change: hooks `useEvalCases`, `useCreateEvalCase`, `useEvalRuns(agentId, limit)`, `useStartEvalRun`, `useEvalCompare`, `useEvalDashboard`. `keys.eval`: `scope()`, then `agent(id)` as prefix of `cases`/`runs`, then `compare(a,b)` and `dashboard()`. `useEvalRuns` uses `refetchInterval: 2000` while a run is `running` (AC-22, OQ-1). Mutations invalidate `keys.eval.agent(id)` and `dashboard()`; a create from a finding also invalidates `keys.pr.reviews(prId)`. In `eval.json` drop the declined keys `caseEditor.{runCase,running,expectedOutput,validJson,invalidJson,lastRunPassed,lastRunFailed,resultSummary}` and keep the file (`client/INSIGHTS.md:78`).
- Covers: AC-22, NFR-5
- Rules / skills: frontend-architecture, react-best-practices
- Practices: keys only from the factory (`client/INSIGHTS.md:135`); server state stays in the query cache.
- Tests (test-writer): none
- Existing tests to update: none
- Done when: `pnpm typecheck` and `pnpm lint` pass in `client/`.

### Step 13 — Eval helpers and the Case Editor (client components)
- Files: create `client/src/components/eval/index.ts` · create `client/src/components/eval/helpers.ts` · create `client/src/components/eval/CaseEditor/CaseEditor.tsx` · create `client/src/components/eval/CaseEditor/helpers.ts` · create `client/src/components/eval/CaseEditor/index.ts` · modify `client/messages/en/eval.json`
- As built (also created, per the component convention): `client/src/components/eval/CaseEditor/constants.ts` · `client/src/components/eval/CaseEditor/styles.ts`.
- Change: `helpers.ts` holds `isCounted`, `latestTwoCounted`, `pct`, `deltaPoints`, `regressions` (≥ 1 point) and `formatMetric` (`—` for null). `CaseEditor` is a modal in `seeded` mode: name, expectation (type, file, lines), Diff and PR meta tabs read-only, a non-blocking overlap warning, server errors inline. `CaseEditor/helpers.ts` holds `buildCaseSeed` (AC-3/4/5 rules) and `overlappingCase`. Design notes → Client screens.
- Covers: AC-2, AC-3, AC-4, AC-5, AC-6, AC-13, EC-5, NFR-6
- Rules / skills: frontend-architecture, react-best-practices, security
- Practices: lives in `components/eval` (two routes use it) and never imports `src/app` (`client/INSIGHTS.md:267`). Diff and texts render as text. Freeze the seed with `useState(initial)` (`client/INSIGHTS.md:513`). Escape closes and focus returns. Use the kit `Modal`/`Button`; strings come from `eval.json`.
- Tests (test-writer): `client/src/components/eval/helpers.test.ts` — AC-34, AC-37, AC-40, AC-66 · `client/src/components/eval/CaseEditor/CaseEditor.test.tsx` — AC-3, AC-4, AC-5, AC-6, AC-13, EC-5, NFR-6
- Existing tests to update: none
- Done when: `pnpm typecheck` and `pnpm lint` pass in `client/`.

### Step 14 — "Turn into eval case" (client PR page)
- Files: modify `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx` · modify `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx` · modify `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx` · create `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCaseEditor/FindingCaseEditor.tsx` · create `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCaseEditor/index.ts` · modify `client/messages/en/eval.json`
- As built (also changed): `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts` (styles of the "in eval set" marker and the disabled-reason text). Deviation: `FindingsPanel.tsx` ignores its `j`/`k`/`a`/`d` keys while a `[role=dialog]`/`aria-modal` element is open, so the case editor does not trigger finding shortcuts (the `editorOpen` flag in the latest-ref plus the dialog guards).
- Change: `FindingCard` gets an `onTurnIntoEvalCase` prop and renders "In eval set" (`eval_case_id`), a disabled button with its reason (`eval_unavailable_reason`), or an enabled button. Both parents hold `seedFor` state and render `FindingCaseEditor`. That component reads `usePullDetail` and the PR reviews, finds the finding's `agent_id`, builds the seed and saves.
- Covers: AC-1, AC-2, AC-7, AC-8, AC-9, AC-65, EC-1, EC-2, EC-3, EC-20, NFR-6
- Rules / skills: frontend-architecture, react-best-practices
- Practices: the card derives everything from the server markers. Strings come from `useTranslations("eval")`. The reason is linked via `aria-describedby`, and the action is a real `<button>`.
- Tests (test-writer): `FindingCard.test.tsx` (extend) — AC-1, AC-2, AC-8, AC-9, AC-65, EC-1, EC-2, EC-20 (`importOriginal` mocks, `client/INSIGHTS.md:199`)
- Existing tests to update: `FindingCard.test.tsx` fixtures if they build a full `FindingRecord`
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `client/`.

### Step 15 — Metric cards, alert, runs table (client components)
- Files: create `client/src/components/eval/MetricCards/` (`MetricCards.tsx`, `index.ts`) · create `client/src/components/eval/RegressionAlert/` (`RegressionAlert.tsx`, `index.ts`) · create `client/src/components/eval/RunsTable/` (`RunsTable.tsx`, `index.ts`) · modify `client/src/components/eval/index.ts` · modify `client/messages/en/eval.json`
- As built (also created, full paths): `client/src/components/eval/MetricCards/MetricCards.tsx` · `client/src/components/eval/MetricCards/index.ts` · `client/src/components/eval/MetricCards/constants.ts` · `client/src/components/eval/MetricCards/styles.ts` · `client/src/components/eval/RegressionAlert/RegressionAlert.tsx` · `client/src/components/eval/RegressionAlert/index.ts` · `client/src/components/eval/RegressionAlert/styles.ts` · `client/src/components/eval/RunsTable/RunsTable.tsx` · `client/src/components/eval/RunsTable/index.ts` · `client/src/components/eval/RunsTable/constants.ts` · `client/src/components/eval/RunsTable/styles.ts`.
- Change: `MetricCards` shows 3 whole-% metrics with ▲/▼ points plus "Traces passed". `RegressionAlert` names each dropped metric. `RunsTable` shows the AC-38 columns and badges, with optional selection limited to `done`/`partial` rows and at most 2. Build on the kit `MetricCard` where it fits.
- Covers: AC-34, AC-36, AC-37, AC-38, AC-40, AC-66
- Rules / skills: frontend-architecture, react-best-practices
- Practices: values come from `components/eval/helpers.ts`; checkboxes are labelled.
- Tests (test-writer): `client/src/components/eval/RunsTable/RunsTable.test.tsx` — AC-38, AC-45, EC-11
- Existing tests to update: none
- Done when: `pnpm typecheck` and `pnpm lint` pass in `client/`.

### Step 16 — Evals tab (client agents route)
- Files: create `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.tsx` · create `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/index.ts` · modify `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` · modify `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` · modify `client/messages/en/eval.json`
- As built (also changed or created): `client/src/app/agents/[id]/page.tsx` (deviation: `evals` added to `VALID_TABS`, so `?tab=evals` opens the tab) · `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/constants.ts` · `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/styles.ts`.
- Change: the tab shows the alert, metric cards, cases (name, type badge, count badge, outcome "expected N, got M"), "Run all evals" (disabled with "Add a case first"; `k / n cases` while running), the last 10 runs, and "View full dashboard →" to `/eval/<agentId>`. The `TABS` entry `evals` uses a new optional `EditorTab.ns: 'eval'`, which `AgentEditor` translates with, so the label lives in `eval.json`.
- Covers: AC-15, AC-16, AC-17, AC-18, AC-22, AC-37, AC-38, AC-39, AC-40, EC-8, EC-11, NFR-6
- Rules / skills: frontend-architecture, react-best-practices, next-best-practices
- Practices: design `client/docs/design/src/screen_agents.jsx:180`; early returns for loading/empty/error; `next/link`.
- Tests (test-writer): `EvalsTab.test.tsx` — AC-15, AC-16, AC-17, AC-22, AC-37, AC-38, AC-39, AC-40, EC-8
- Existing tests to update: `AgentEditor.test.tsx` if it asserts the tab list
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `client/`.

### Step 17 — Sidebar item and `/eval` (client)
- Files: modify `client/src/vendor/ui/nav.ts` · create `client/src/app/eval/page.tsx` · create `client/src/app/eval/_components/EvalDashboardView/` (`EvalDashboardView.tsx`, `index.ts`) · modify `client/messages/en/eval.json`
- As built (also changed or created): `client/src/app/eval/_components/EvalDashboardView/EvalDashboardView.tsx` · `client/src/app/eval/_components/EvalDashboardView/index.ts` · `client/src/app/eval/_components/EvalDashboardView/constants.ts` · `client/src/app/eval/_components/EvalDashboardView/styles.ts` · `client/src/app/eval/layout.tsx` (tab title, text in the `eval` namespace as `meta.title`). Deviation, NFR-5 (strict reading, user decision 2026-10-15): the sidebar label is not a literal in `nav.ts`; the item has no `label`, and `useNavLabel` (`client/src/components/app-shell/hooks/useNavLabel.ts`, key map in `client/src/components/app-shell/constants.ts`) resolves it from `eval.nav.label`, passed as `ShellContext.navLabel` (`client/src/vendor/ui/shell/types.ts`, read in `client/src/vendor/ui/shell/Sidebar.tsx`) and used by the command palette (`client/src/components/app-shell/hooks/useShellCommands.ts`, `client/src/components/app-shell/hooks/useShellContext.ts`, `client/src/components/app-shell/hooks/index.ts`). The old `nav.eval` key left `client/messages/en/shell.json`.
- Change: add the `NAV` item `{ key: "eval", label: "Eval Dashboard", icon: "FlaskConical", href: "/eval" }` after Conventions (`activeKeyFor` already maps `/eval`). The page sets its crumb, lists every agent with its latest counted run or "No eval runs yet" (rows link to `/eval/<agentId>`), and shows the 6 newest counted runs.
- Covers: AC-41, AC-42, AC-43
- Rules / skills: frontend-architecture, next-best-practices
- Practices: thin client page; design `client/docs/design/src/screen_skills.jsx:350`.
- Tests (test-writer): `EvalDashboardView.test.tsx` — AC-42, AC-43
- Existing tests to update: any app-shell test listing the SKILLS LAB items
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `client/`.

### Step 18 — Agent page and Compare (client)
- Files: create `client/src/app/eval/[agentId]/page.tsx` · create `client/src/app/eval/[agentId]/_components/EvalAgentView/EvalAgentView.tsx` · create `client/src/app/eval/[agentId]/_components/EvalAgentView/index.ts` · create `client/src/app/eval/[agentId]/_components/CompareView/` (`CompareView.tsx`, `helpers.ts`, `index.ts`) · modify `client/messages/en/eval.json`
- As built (also created): `client/src/app/eval/[agentId]/_components/CompareView/CompareView.tsx` · `client/src/app/eval/[agentId]/_components/CompareView/helpers.ts` · `client/src/app/eval/[agentId]/_components/CompareView/index.ts` · `client/src/app/eval/[agentId]/_components/CompareView/constants.ts` · `client/src/app/eval/[agentId]/_components/CompareView/styles.ts` · `client/src/app/eval/[agentId]/_components/EvalAgentView/constants.ts` · `client/src/app/eval/[agentId]/_components/EvalAgentView/styles.ts`. Deviation: the `GitBranch` icon is used instead of `GitCompare` (not in `@devdigest/ui` icons).
- Change: `EvalAgentView` has the alert, metric cards, "Run eval", and a `RunsTable` of ≤ 50 runs with selection; "Compare" is enabled at exactly 2 selected. `CompareView` is a modal with older/newer/change for 3 metrics + cost, a word diff of the prompts, the version summary, flipped cases and the "Case sets differ" banner. `CompareView/helpers.ts` holds `wordDiff` (LCS over words, capped) and `skillChanges`.
- Covers: AC-18, AC-40, AC-44, AC-45, AC-46, AC-47, AC-48, AC-49, AC-50, EC-11, EC-19, NFR-6
- Rules / skills: frontend-architecture, react-best-practices, next-best-practices, security
- Practices: `useParams` in the client page. Prompts render as text with `<del>`/`<ins>`, never HTML or markdown. Escape closes and focus returns. Design `client/docs/design/src/screen_skills.jsx:316` and `:414-460`.
- Tests (test-writer): `CompareView/helpers.test.ts` — AC-47, AC-48 · `CompareView.test.tsx` — AC-46, AC-49, AC-50, NFR-6 · `EvalAgentView.test.tsx` — AC-44, AC-45, EC-11
- Existing tests to update: none
- Done when: `./scripts/check-changed.sh` passes (`--quick` unless the stretch groups are cut).

### Step 19 — Stretch (a): edit and delete (server)
- Files: modify `server/src/modules/eval/service.ts` · modify `server/src/modules/eval/repository.ts` · modify `server/src/modules/eval/ports.ts` · modify `server/src/modules/eval/routes.ts`
- Change: `PUT /eval-cases/:id` reruns `checkCaseSave` and keeps the id and `source_finding_id` (AC-54). `DELETE /eval-cases/:id` → 409 while a run of the agent is `running`, else 204; results cascade and runs keep their metrics.
- Covers: AC-11, AC-54, AC-56, AC-57, AC-64
- Rules / skills: onion-architecture, fastify-best-practices, drizzle-orm-patterns, security
- Practices: workspace-scoped lookup first; the delete is a single `DELETE … WHERE NOT EXISTS (running run)`, with no check-then-act.
- Tests (test-writer): `server/test/eval.it.test.ts` — AC-54, AC-56, AC-57, AC-64
- Existing tests to update: none
- Done when: `./scripts/check-changed.sh --quick` passes.

### Step 20 — Stretch (a): New / Edit / Delete (client)
- Files: modify `client/src/components/eval/CaseEditor/CaseEditor.tsx` · modify `client/src/lib/hooks/eval.ts` · modify `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.tsx` · modify `client/messages/en/eval.json`
- Change: modes `new` and `edit` make the diff, title and body editable, and show a +/- marked preview. Add `useUpdateEvalCase` and `useDeleteEvalCase`. The tab gets "New eval case", Edit, and Delete via `ConfirmDialog` naming the case.
- Covers: AC-13, AC-52, AC-53, AC-55, NFR-6
- Rules / skills: frontend-architecture, react-best-practices, security
- Practices: the preview colours by first character and renders text only. `ConfirmDialog` is controlled by mounting (`client/src/components/confirm-dialog/ConfirmDialog.tsx:1`).
- Tests (test-writer): `CaseEditor.test.tsx` — AC-52, AC-53 · `EvalsTab.test.tsx` — AC-55
- Existing tests to update: none
- Done when: `./scripts/check-changed.sh --quick` passes.

### Step 21 — Stretch (b): trend endpoint (server)
- Files: modify `server/src/vendor/shared/contracts/eval-ci.ts` · modify `client/src/vendor/shared/contracts/eval-ci.ts` · modify `server/src/modules/eval/service.ts` · modify `server/src/modules/eval/repository.ts` · modify `server/src/modules/eval/ports.ts` · modify `server/src/modules/eval/routes.ts`
- Change: add `EvalTrend` (`points[]`: `run_id`, `started_at`, `agent_version`, 3 metrics, `cost_usd`) and sync. `GET /agents/:id/eval-trend` returns every counted run, oldest first.
- Covers: AC-58, AC-59, AC-66
- Rules / skills: zod, onion-architecture, drizzle-orm-patterns
- Practices: select only these columns; workspace-scoped.
- Tests (test-writer): `server/test/eval.it.test.ts` — AC-58
- Existing tests to update: none
- Done when: `./scripts/shared-contracts.sh check` and `./scripts/check-changed.sh --quick` pass.

### Step 22 — Stretch (b): trend chart (client)
- Files: create `client/src/components/eval/TrendChart/` (`TrendChart.tsx`, `index.ts`) · modify `client/src/components/eval/index.ts` · modify `client/src/lib/hooks/eval.ts` · modify `client/src/lib/query-keys.ts` · modify `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.tsx` · modify `client/src/app/eval/[agentId]/_components/EvalAgentView/EvalAgentView.tsx` · modify `client/messages/en/eval.json`
- As built (also created): `client/src/components/eval/TrendChart/TrendChart.tsx` · `client/src/components/eval/TrendChart/index.ts` · `client/src/components/eval/TrendChart/constants.ts` · `client/src/components/eval/TrendChart/helpers.ts` · `client/src/components/eval/TrendChart/styles.ts`.
- Change: `useEvalTrend` drives a `recharts` line chart: 3 lines, gaps for null, and a tooltip with agent version + cost on hover and on keyboard focus. Mount it on the tab and the agent page.
- Covers: AC-58, AC-59
- Rules / skills: frontend-architecture, react-best-practices, next-best-practices
- Practices: `recharts` is already a dependency, so add no new package. Do not extend the vendored `LineChart` (it has no tooltip and no gaps).
- Tests (test-writer): `TrendChart.test.tsx` — AC-58, AC-59
- Existing tests to update: none
- Done when: `./scripts/check-changed.sh` passes (full run), then set `specs/13-eval-pipeline.md` to `Status: implemented` and update its line in `specs/README.md`.

### Step 23 — Stretch (c): `spec-authoring` skill eval (evals)
- Files: create `evals/skills/spec-authoring/spec-authoring.cases.ts` · create `evals/skills/spec-authoring/spec-authoring.eval.ts`
- Change: 3–4 `SkillCase`s, as in `evals/skills/dependency-checker/`. `grounding` substrings check concrete facts first (EARS `WHEN … shall`, `AC-`/`EC-`/`NFR-`/`OQ-` ids, `Status: draft`, provenance tags), then judged `practices`. The eval file calls `describeSkill` + `runSkillCases("spec-authoring", cases)`.
- Covers: AC-60, AC-61, AC-62
- Rules / skills: none (`evals/README.md`)
- Practices: pick grounding strings that come from rules in `.claude/skills/spec-authoring/SKILL.md`, so removing a rule fails a case. Do not edit the skill; prove AC-62 on a scratch copy.
- Tests (test-writer): none (the cases are the tests)
- Existing tests to update: none
- Done when: `pnpm typecheck` and `pnpm eval:static` pass in `evals/`, and `pnpm eval:repeat skills/spec-authoring -n 2` passes every case.

## Contracts & migrations
- Shared contracts sync: yes — `eval-ci.ts`, `review-api.ts` (step 1); `eval-ci.ts` (step 21).
- Schema change + `pnpm db:generate`: yes — `eval_cases` (+3 columns), `eval_runs` rewritten, new `eval_case_results`; two passes.
- Spec `Status` update: yes — the last code group that runs (G8, or G6 if stretch is cut) sets `implemented`.

## Verification
| Package | Checks (from routing.json) |
|---|---|
| server | `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm arch` · `pnpm verify:l06` |
| client | `pnpm typecheck` · `pnpm lint` · `pnpm test` |
| mcp | `pnpm typecheck` · `pnpm lint` · `pnpm test` (contracts changed) |
| evals (G9) | `pnpm typecheck` · `pnpm eval:static` · `pnpm eval:repeat skills/spec-authoring -n 2` |
Plus extra checks: `./scripts/shared-contracts.sh check`. Needs Postgres: yes, for `server/test/eval.it.test.ts`.
All of the above in one command: `./scripts/check-changed.sh` (a group that is not the last runs `--quick`).

## Insights to record
- `server/INSIGHTS.md` · Recurring Errors & Fixes — drizzle-kit asks a rename question when one generate removes and adds columns or tables; split it into remove-only and add-only passes (unverified until step 2). Where: `server/src/db/schema/eval.ts:22`
- `server/INSIGHTS.md` · Codebase Patterns — one request per eval case: wrap the `LLMProvider` (`transportRetries: 0`, `timeoutMs`), because `ReviewInput` has no transport slot. Where: `reviewer-core/src/review/run.ts:186`
- `server/INSIGHTS.md` · Open Questions follow-up — `ResolvedSkill.version` now records applied skill versions for eval runs. Where: `server/src/modules/agents/ports.ts:81`
- `server/INSIGHTS.md` · Codebase Patterns — a case diff headed only by `---`/`+++` survives `excludeFromReview`'s raw filter; `normalizeCaseDiff` adds `diff --git` first. Where: `server/src/modules/reviews/diff-filter.ts:70`

<!-- implementer-brief:end -->

## Context read
- `specs/13-eval-pipeline.md:1-234` — SPEC-13, approved, amended with AC-63–66 and EC-20; every AC/EC/NFR is cited in the steps.
- `docs/plans/09-eval-pipeline.brainstorm.md:59-82,90-97,173-201` — option 2, S1–S12, C1–C6 and the planner list.
- `AGENTS.md` (root) — naming, `.it.test.ts`, contract sync, never hand-edit migrations.
- `server/AGENTS.md` — module registration, zod route schemas, `AppError` envelope, mocks.
- `client/AGENTS.md` — hooks in `src/lib/hooks`, keys factory, i18n per feature, `renderWithIntl`.
- `server/INSIGHTS.md:58` — reviews run fire-and-forget; reap on boot.
- `server/INSIGHTS.md:161`, `:617` — snapshots hold skill ids, not bodies; the skill-version open question.
- `server/INSIGHTS.md:208` — `ports.ts` declares structural types; fakes break when a port grows.
- `server/INSIGHTS.md:411`, `:415` — claim by insert, guarded completion, boot reaper; testing a fire-and-forget run; claim exclusivity needs Postgres.
- `server/INSIGHTS.md:491`, `:497`, `:501` — `numeric` reads back as a string; `maxRetries` vs `transportRetries`; bare patch → `newSideRanges`.
- `server/INSIGHTS.md:569` — un-mocked providers in `.it.test.ts` apps.
- `client/INSIGHTS.md:78`, `:135`, `:199`, `:267`, `:513` — keep namespaces; key factory; `importOriginal` mocks; `components/` cannot import `app`; Strict Mode with a mutation in an effect.
- `server/src/db/schema/eval.ts:7-35` — current `eval_cases`/`eval_runs`; no code consumer (rg).
- `server/src/vendor/shared/contracts/eval-ci.ts:20-89` — case-level records, non-nullable `EvalDashboard` metrics.
- `server/src/modules/reviews/helpers.ts:78-92` — `taskLine` mixes the PR header and rules.
- `server/src/modules/reviews/diff-filter.ts:34-83` — `excludeFromReview` and the preamble branch.
- `server/src/modules/reviews/applicability.ts:29-41` — `partitionSkills`.
- `server/src/modules/reviews/run-executor.ts:111,240-291,472-493` — the review pre-processing order and `buildSkillBlocks`.
- `server/src/modules/reviews/service.ts:185-205`, `findings.ts:11-32` — `actOnFinding`, `reviewsForPull`.
- `server/src/modules/reviews/deps.ts:46-66` — `ReviewDeps`.
- `server/src/modules/agents/ports.ts:81-118`, `repository.ts:187-262,387-404` — `ResolvedSkill`, version snapshots (`system_prompt`, `model` in `config_json`).
- `server/src/modules/onboarding/service.ts:50-160`, `repository.ts:34-46` — `withDeadline`, the claim, the reaper.
- `server/src/app.ts:75-96` — reapers awaited before listen.
- `server/src/platform/container.ts:156-302`, `errors.ts:7-41` — getters, deps, error classes.
- `server/src/vendor/shared/adapters.ts:52-75` — `StructuredRequest.transportRetries`/`timeoutMs`.
- `reviewer-core/src/review/run.ts:33,60-140,186-193` — `ReviewInput` slots, default retries, request without a transport slot.
- `client/src/lib/hooks/reviews.ts:204-222` — the finding action invalidates `keys.pr.reviews`.
- `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx:28-45`, `FindingsPanel.tsx:20-90`, `DiffTab.tsx:60-106` — where cards render.
- `client/src/app/agents/[id]/_components/AgentEditor/constants.ts:10-15`, `AgentEditor.tsx:16-27` — tabs, labels translated under `agents`.
- `client/src/vendor/ui/nav.ts:30-36`, `client/src/components/app-shell/helpers.ts:37` — the SKILLS LAB list, `/eval` key.
- `client/messages/en/eval.json` — existing keys, the declined ones listed in step 12.
- `evals/skills/dependency-checker/*`, `evals/src/dsl/case.ts:27-40` — `SkillCase` shape.
- `specs/README.md:25-29` — SPEC-10+ status vocabulary (`implemented` by the implementer).

## Requirements trace
| R | Requirement (source `path:line` or "request") | Steps |
|---|---|---|
| AC-1–AC-14, AC-63, AC-65 | create a case from a finding (`specs/13-eval-pipeline.md:94-109`) | 2, 5, 6, 7, 10, 13, 14 |
| AC-15–AC-17 | case set (`:112-114`) | 6, 7, 16 |
| AC-18–AC-28, AC-66 | running the set, counted run (`:117-128`) | 2, 3, 4, 5, 6, 7, 8, 9, 16 |
| AC-29–AC-36 | scoring (`:130-137`) | 5, 8, 11 |
| AC-37–AC-40 | metrics, history, alert (`:141-144`) | 13, 15, 16, 18 |
| AC-41–AC-50 | dashboard, compare (`:147-156`) | 7, 17, 18 |
| AC-51 | `verify:l06` | 11 |
| AC-52–AC-57, AC-64 | stretch (a) | 5, 7, 19, 20 |
| AC-58–AC-59 | stretch (b) | 21, 22 |
| AC-60–AC-62 | stretch (c) | 23 |
| EC-1–EC-20, NFR-1–NFR-6 | spec `:179-206` | see each step's Covers |
| R1 sequential cases | request (Q2) | 8 |
| R2 store the posted diff/meta | request (Q4) | 7 |
| R3 `verify:l06` unit lane, not in CI | request (Q4, Q6) | 11 |
| R4 brief findings: taskLine split, excludeFromReview raw, ResolvedSkill version + fake, finding markers incl. `actOnFinding`, nullable dashboard metrics | request | 4, 5 (`normalizeCaseDiff`), 3, 10, 1 |
| One request per case, 120 s deadline | request (review Q2, Q3) | 8 |
Recommendations: 1 (prune declined `eval.json` keys) — accepted (step 12).

## Affected modules
| Package | Path | Ring / layer | Change |
|---|---|---|---|
| server | `src/vendor/shared/contracts/` | core | eval schemas, finding markers |
| server | `src/db/schema/eval.ts`, `schema.ts` | outer (db) | tables |
| server | `src/modules/agents/` | core port + repository | `ResolvedSkill.version` |
| server | `src/modules/reviews/` | application + public index | `index.ts`, rules text, markers |
| server | `src/modules/eval/` (new) | core (`ports.ts`), application (`constants`, `case-rules`, `scoring`, `service`, `run-executor`), outer (`repository`, `routes`) | the feature |
| server | `src/platform/container.ts`, `src/app.ts`, `src/modules/index.ts` | composition root | wiring, reaper, registry |
| client | `src/lib/hooks/eval.ts`, `query-keys.ts` | data | hooks, keys |
| client | `src/components/eval/` (new) | cross-route components | Case Editor, metrics, runs table, chart |
| client | `src/app/repos/[repoId]/pulls/[number]/_components/` | route | finding card action |
| client | `src/app/agents/[id]/_components/AgentEditor/` | route | Evals tab |
| client | `src/app/eval/` (new), `src/vendor/ui/nav.ts` | route, chrome | dashboard, compare, nav item |
| evals | `skills/spec-authoring/` (new) | harness | skill eval |

## Constraints honored
| Rule | Source (`path:line`) | How the plan respects it |
|---|---|---|
| Imports point inward; modules meet via `index.ts`/ports | `.claude/skills/onion-architecture/SKILL.md`; depcruise `no-cross-module-internals` | eval imports `reviews/index.ts` only; reviews reaches eval through a structural port; `pnpm arch` in every server Done-when |
| Contracts edited server-side, then synced | root `AGENTS.md` Cross-package rules | steps 1, 21 |
| Migrations only via `pnpm db:generate` | root `AGENTS.md` Do not touch | step 2 (two passes) |
| DB tests end in `.it.test.ts` | root `AGENTS.md` Naming | `server/test/eval.it.test.ts` |
| i18n in `messages/en/<camelCase>.json` | root `AGENTS.md` Naming; NFR-5 | all strings in `eval.json`; the tab label through `ns: 'eval'` |
| Routes: zod schemas, no `.parse` in handler, `AppError` | `server/AGENTS.md` Conventions | step 9 |
| Rate limit on spend routes | `.claude/skills/security/SKILL.md` rule 11; NFR-3 | step 9 |
| Workspace scoping | security rule 5; NFR-4 | steps 6, 7, 19, 21 |
| LLM output is data | security rule 7 | findings validated by the engine schema; rendered as text |
| Components never fetch; keys from the factory | `client/AGENTS.md` Conventions | step 12 |
| `components/` never imports `src/app` | `client/INSIGHTS.md:267` | Case Editor in `components/eval`; seeding glue in the route |
| Money `numeric(14,8)` | `server/INSIGHTS.md:491` | step 2 |

## Design notes

### Contracts
In `eval-ci.ts` (snake_case, all exported with types):
- `EvalExpectationType` = `must_find` | `must_not_flag`. `EvalExpectation` = `{ type, file: string.min(1), start_line: int ≥ 1, end_line: int ≥ 1 }`, refined `start_line ≤ end_line`.
- `EvalCaseMeta` = `{ pr_title: string, pr_body: string }` (body may be `''`).
- `EvalCaseSave` = `{ name: string.trim().min(1).max(120), input_diff: string.min(1).max(100_000), input_meta: EvalCaseMeta, expected_output: EvalExpectation, source_finding_id: string.uuid().nullish() }`.
- `EvalCaseOutcome` = `pass` | `fail` | `error` | `never_run`. `EvalCaseRecord` = `{ id, owner_kind, owner_id, name, input_diff, input_meta, expected_output, source_finding_id: nullable, notes: nullable, created_at, latest: { status: EvalCaseOutcome, expected_count: int, matched_count: int.nullable() } }`.
- `EvalRunStatus` = `running` | `done` | `partial` | `failed`. `EvalSkillVersion` = `{ skill_id, name, version }`.
- `EvalRunSummary` = `{ id, agent_id, agent_version, skill_versions: EvalSkillVersion[], status, started_at, finished_at: nullable, cases_total, cases_completed, cases_errored, cases_passed, recall, precision, citation_accuracy (all number.nullable()), unlabelled_findings, cost_usd: nullable }`. Progress `k` = `cases_completed + cases_errored`.
- `EvalRunStarted` = `{ run_id, status: z.literal('running') }`. `EvalRunsOverview` = `{ runs: EvalRunSummary[], latest_counted: nullable, previous_counted: nullable }`.
- `EvalCaseResult` = `{ case_id, status: pass|fail|error, expected_count, matched_count, kept, dropped, findings: {file,start_line,end_line,title}[], duration_ms, cost_usd: nullable }` (stored; the API exposes it only inside compare).
- `EvalCompare` = `{ older: { run: EvalRunSummary, system_prompt: nullable, model: nullable }, newer: same, flipped: { case_id, name, from: 'pass'|'fail', to }[], case_sets_differ: boolean, only_in_older: int, only_in_newer: int }`.
- `EvalDashboardOverview` = `{ agents: { agent_id, name, latest: EvalRunSummary.nullable() }[], recent_runs: (EvalRunSummary + agent_name)[] }`.
In `review-api.ts`: `EvalUnavailableReason` = `no_agent` | `file_excluded` | `diff_unavailable`. `FindingRecord` gets `eval_case_id: string.nullish()` and `eval_unavailable_reason: EvalUnavailableReason.nullish()`.

### Tables
- `eval_cases` adds `agent_id uuid null → agents.id ON DELETE CASCADE` (index; set = `owner_id` for agent cases; AC-14), `source_finding_id uuid null → findings.id ON DELETE SET NULL` with a unique index (NULLs are distinct, so many hand-written cases are fine; AC-10/EC-4), and `created_at timestamptz not null default now()`. `input_files` and `notes` stay.
- `eval_runs` (rewritten): `id`, `workspace_id → workspaces cascade`, `agent_id → agents cascade`, `agent_version int not null`, `skill_versions jsonb not null default []`, `case_ids jsonb not null` (ids captured at start, AC-19), `status text` enum, `started_at timestamptz default now()`, `finished_at`, counters `cases_total/completed/errored/passed int default 0`, `recall/precision/citation_accuracy double precision null`, `unlabelled_findings int default 0`, `cost_usd numeric(14,8) null`. Indexes: `(agent_id, started_at)`, `(workspace_id, started_at)`, partial unique `(agent_id) WHERE status='running'`.
- `eval_case_results`: `id`, `run_id → eval_runs cascade`, `case_id → eval_cases cascade` (so a deleted case leaves past run metrics intact, AC-56/EC-19), `status text`, `expected_count`, `matched_count`, `kept`, `dropped int`, `findings jsonb`, `duration_ms int`, `cost_usd numeric(14,8) null`, `created_at`. Unique `(run_id, case_id)`, index `case_id`.

### Claim
Primary: insert `eval_runs` with `status='running'`, where a unique violation means a run is active → 409 `eval_run_in_progress`. Fallback if drizzle 0.38 does not emit the partial index: one transaction that locks the agent row (`.for('update')`, precedent `server/src/modules/agents/repository.ts:196-215`), checks for no `running` run of the agent, and inserts. Reaper: `UPDATE eval_runs SET status='failed', finished_at=now() WHERE status='running'`.

### Case rules
- `normalizeCaseDiff(raw)`: before every `--- a/<p>` line that has no `diff --git` header and is followed by `+++ b/<p>`, insert `diff --git a/<p> b/<p>`. `excludeFromReview` then filters `raw` as well (`diff-filter.ts:70`), and `parseUnifiedDiff` sees one file per section.
- `fileRanges(raw)`: map path → `newSideRanges(section)`. No hunk at all → 422 on `input_diff`. Expectation range intersects no range of its file → 422 on `expected_output`.
- `isExcludedFile(path)` = `matchesAny(path, REVIEW_EXCLUDED_PATHS)`. On every save, the expectation file → 422 with the AC-63 message (AC-63 seeded, AC-64 hand-written).
- `appliedSkills(skills, paths)` = `partitionSkills(skills, effective paths).applicable`. The run's `skill_versions` = the union over all captured cases, in binding order.

### Scoring
- Finding range = `[min(s,e), max(s,e)]`. `matches(f, x)` = `f.file === x.file && lo ≤ x.end_line && x.start_line ≤ hi` (no slack, no loop).
- `scoreCase(x, kept, droppedCount)`: `matched` = count of matches. `must_find`: pass iff matched ≥ 1, tp = matched. `must_not_flag`: pass iff matched = 0, fp = matched. `unlabelled` = kept − matched. `expected_count` = 1 or 0.
- `aggregate(completedResults)`: recall = passed `must_find` / completed `must_find`; precision = Σtp / (Σtp + Σfp); citation = Σkept / (Σkept + Σdropped); a zero denominator → null; `unlabelled_findings` = Σ; cost = Σ when every completed case has a cost and there is at least one completed case, else null.
- `runStatus(completed, errored)`: `errored = 0` → `done`; both > 0 → `partial`; `completed = 0` → `failed`.

### Ports
`EvalStore`: `listCases(ws, agentId)` (with latest counted outcome via `selectDistinctOn([case_id])` over results joined to runs with `status IN ('done','partial')` ordered by `started_at desc`), `countCases`, `insertCase` (returns `'duplicate'` on a unique violation of `source_finding_id`), `getCase`, `updateCase`, `deleteCaseIfIdle`, `claimRun`, `recordCaseResult(runId, result)` (insert + counter increment, guarded `status='running'`), `finishRun(runId, status, metrics)` (guarded), `listRuns(ws, agentId, limit)`, `latestCounted(ws, agentId, 2)`, `getRuns(ws, ids)`, `caseResults(runIds)`, `caseNames(ids)`, `dashboard(ws)`, `trend(ws, agentId)`, `reapRunning()`, `caseIdsBySourceFinding(ws, findingIds)`.
`EvalAgentSource` (satisfied by `agentsRepo`): `getById`, `list`, `getVersion`, `resolvedSkills`. `EvalFindingSource` (satisfied by `reviewRepo`): `findingContext(findingId)` narrowed to `{ finding: { id, file, startLine, endLine }, review: { agentId }, pull: { workspaceId } }`. `EvalDeps` = `{ store, agents, findings, llm, logger?, now? }`.

### Service
- `createCase(ws, agentId, body)`: agent in ws or 404 → seeded path checks (finding in ws or 404, review agent = agentId or 422 `finding_agent_mismatch`) → `checkCaseSave` → count < 50 or 422 `eval_case_limit` ("An agent can hold at most 50 eval cases.") → insert, where a duplicate → 409 `eval_case_exists`. Count and insert run in one transaction under the agent row lock so that two saves cannot pass 50.
- `listRuns(ws, agentId, limit 1–50, default 10)` → `EvalRunsOverview` (the counted pair is read separately so a list full of failed runs still finds them).
- `compare(ws, a, b)`: both runs in ws, same agent, counted status, else 422. Order by `started_at`. Prompts and models come from `agents.getVersion(agentId, version).config_json` (`system_prompt`, `model`; null if missing). `flipped` = cases with results in both runs whose status went pass↔fail (a deleted case has no results → absent, EC-19). Set counts come from `case_ids`.
- `dashboard(ws)`: every agent of the ws with its latest counted run; the 6 newest counted runs of the ws with the agent name.

### Run flow
Capture at start (one read each): agent record, `resolvedSkills` with versions, cases (ids, diffs, meta, expectations). For each case, in order: `t0`; `normalizeCaseDiff` → `parseUnifiedDiff` → `excludeFromReview` → `appliedSkills` → `skillBlockText` blocks → `withDeadline(reviewPullRequest(...), EVAL_CASE_TIMEOUT_MS)` → `scoreCase(expectation, outcome.review.findings, outcome.dropped.length)` → `recordCaseResult` (findings stored as `{file,start_line,end_line,title}` only). On a throw → `recordCaseResult` with `status: 'error'` and zero counts. A store failure ends the loop and the run is left to `finishRun('failed')`. After the loop: read the run's results → `aggregate` → `finishRun(runStatus(...))`. Log outcome counts only, never prompt or finding text.

### Routes
`GET /agents/:id/eval-cases` → `{ cases: EvalCaseRecord[] }` · `POST /agents/:id/eval-cases` body `EvalCaseSave` → 201 `EvalCaseRecord` · `POST /agents/:id/eval-runs` → 202 `EvalRunStarted` (10/min) · `GET /agents/:id/eval-runs?limit=` → `EvalRunsOverview` · `GET /eval-runs/compare?a=&b=` → `EvalCompare` · `GET /eval/dashboard` → `EvalDashboardOverview` · stretch: `PUT /eval-cases/:id` → `EvalCaseRecord`, `DELETE /eval-cases/:id` → 204, `GET /agents/:id/eval-trend` → `EvalTrend`.

### Client screens
- Case Editor (design `client/docs/design/src/screen_cizruns.jsx:106`, artboard `evalcase`): name; expectation type select, file, start/end line; tabs Diff (read-only preview in seeded mode) and PR meta (title/body read-only); a non-blocking overlap warning naming the other case; Save/Cancel. The posted diff is the seed's `--- a/` + `+++ b/` + patch.
- The finding-card reasons map `no_agent` / `diff_unavailable` / `file_excluded` to the spec texts of AC-8/AC-65.
- Evals tab (artboard `agent-evals`), Dashboard and Compare (`screen_skills.jsx:303-460`).
- Counted logic exists on both sides (`COUNTED_STATUSES` server-side, `isCounted` client-side), and both follow AC-66.

### Decisions and alternatives
- `withDeadline` is copied into eval rather than promoted to `_shared`, so onboarding stays untouched. Promote it if a third user appears.
- The AC-43 "6 newest runs" shows counted runs only, because AC-66 excludes running and failed runs from dashboard rows. The Evals tab history (AC-38) shows every status with badges, as the spec asks.
- Prompts for Compare are read from `agent_versions` (brief S8), not copied onto the run.

## Risks & open questions
- drizzle 0.38 `uniqueIndex().where()` is unverified (`server/node_modules` is absent in this worktree). The fallback is in Design notes → Claim.
- The two-pass `pnpm db:generate` produces two migrations. That is acceptable, but if drizzle-kit still prompts, the implementer must stop and report rather than hand-edit.
- The sidebar label "Eval Dashboard" first sat in `client/src/vendor/ui/nav.ts` (precedent: "Onboarding Tour"). After the verifier flagged NFR-5, it moved to `eval.nav.label` (see the Step 17 as-built line); no string is left outside `eval.json` for this feature.
- AC-24 does not fix the exact 4xx code. The plan uses 422 `provider_not_configured`.
- AC-12 does not fix a status. The plan uses 422 `eval_case_limit`.
- Stretch (c) needs a real model (`pnpm eval:repeat`, about 2 runs). AC-62 is proven by hand on a scratch copy of the skill, not by a committed test.
- Plan size: 23 steps across 3 packages. Multi-agent mode fits, as the user chose.

## Handed off
- Architecture reviewer: `modules/reviews/index.ts` surface (no widening), the `reviews` → eval structural port in `deps.ts`, `case-rules.ts` importing `reviews/index.ts`, `EvalService` constructor (ports only), `components/eval` vs route colocation, `EditorTab.ns`.
- Security reviewer: run start rate limit and workspace scoping of every eval route (NFR-3, NFR-4); case diff/meta fenced in the prompt (engine `wrapUntrusted`) and rendered as text in Case Editor and Compare; stored model findings limited to file/lines/title; no provider `err.message` in responses or rows; `23505` mapping; `DELETE` race (step 19).
