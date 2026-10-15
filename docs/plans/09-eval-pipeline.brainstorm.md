# Brainstorm: Eval Pipeline (cases from findings, run-level evals, scoring by code, Evals tab, Eval Dashboard)
Status: chosen: option 2
Spec: specs/13-eval-pipeline.md (SPEC-13, `Status: approved`)

## Problem

SPEC-13 fixes the behaviour and the wire: a finding becomes an eval case, one action runs an agent over its whole case set in the background, code alone scores recall / precision / citation_accuracy, and the Evals tab, an Eval Dashboard page and a compare view show the result. `pnpm verify:l06` must be green. Tests are ON for this feature.

This brief compares ways to **build** it. The behaviour is not in question. The real choices are on the server: where the module lives and how it reuses the review pre-processing (AC-21), where the run is orchestrated (AC-18, AC-23, AC-28), and how the run-level record is shaped (AC-19, AC-56). The client slicing and the smaller server shapes have one sensible form under every option, so they are listed as **common decisions** and are not scored.

Tags: **fact** = seen in a file in this run; **inference** = my conclusion from facts.

## Context found

Existing eval scaffolding
- **fact** `eval_cases` is polymorphic: `owner_kind` (`skill` | `agent`), `owner_id` with **no FK**, `input_diff`, `input_files`, `input_meta`, `expected_output` jsonb, `notes` (`server/src/db/schema/eval.ts:7-20`).
- **fact** `eval_runs` is **case-keyed**: `case_id` FK with cascade, `ran_at`, `actual_output`, `pass`, `recall`, `precision`, `citation_accuracy`, `cost_usd` as `double precision` (`server/src/db/schema/eval.ts:22-34`). rg over `server/src` finds no code that reads or writes either table (only schema, contracts and a comment in `db/rows.ts:7`). **inference** both tables are empty and a rework of `eval_runs` has no code consumer to migrate.
- **fact** `EvalRunRecord` is case-level (`case_id`, `pass`) (`server/src/vendor/shared/contracts/eval-ci.ts:33`); `EvalDashboard.current` has non-nullable `recall` / `precision` / `citation_accuracy` (`eval-ci.ts:68-90`); `EvalRun` has `per_trace` and is parsed in a contract test (`server/src/vendor/shared/contracts/knowledge.ts:37-47`, `server/test/contracts.test.ts:159`). rg finds no use of these names in `client/src` or `mcp/src` outside the vendored copies. **inference** the spec's "metric is null → `—`" (AC-34) cannot be expressed by `EvalDashboard` as it stands, so it is edited or replaced; `EvalRun` should stay untouched (new schemas get new names) so the contract test keeps passing.
- **fact** `client/messages/en/eval.json` already holds `dashboard`, `caseEditor` and `evalsTab` keys, including declined features ("Run case", "Expected output" JSON validity) (`client/messages/en/eval.json`). **fact** client AGENTS says unused namespaces must not be deleted (`client/AGENTS.md`, Gotchas) but their content is lesson-specific, so pruning declined keys is a planner call.

How a review run is built today (what a case run must reuse)
- **fact** `ReviewRunExecutor.runOneAgent` does, in order: `excludeFromReview(diff)` (`server/src/modules/reviews/run-executor.ts:111`), optional intent (`:127`), `taskLine(pull)` (`:240`), skill blocks via the private `buildSkillBlocks` → `agents.resolvedSkills` → `partitionSkills` → `skillBlockText` (`:472`, `applicability.ts:29-36`, `helpers.ts:68`), `projectContext.resolveForRun` (`:255`), then `reviewPullRequest({...})` with `strategy: agent.strategy ?? REVIEW_STRATEGY` (`:284-291`).
- **fact** `reviewPullRequest` takes optional slots and "omitted slots must leave no section in the prompt" (`reviewer-core/AGENTS.md`, Rules; `reviewer-core/src/review/run.ts` `ReviewInput`). It returns `review.findings` (kept, after grounding) and `dropped` with reasons, plus `costUsd` (nullable) (`reviewer-core/src/review/run.ts`, `ReviewOutcome`). With `scopeFilter` undefined the scope policy is the identity (`reviewer-core/src/scope.ts:76-78`). **inference** with no intent, `dropped` is exactly the grounding drops, which is what AC-33 needs.
- **fact** grounding rewrites a kept finding's `file` to the diff's real path (suffix match) (`reviewer-core/src/grounding.ts:41-52, 95-100`) and compares a range by walking the diff's lines, not the finding's range (`grounding.ts:74-77`). **inference** AC-29 / EC-14 need no second path resolution: score on `outcome.review.findings` as returned; scoring must compare bounds only (arithmetic), never iterate a model-supplied range (spec "Untrusted inputs").
- **fact** `taskLine(pull)` takes `number`, `title`, `author` and embeds the non-negotiable review rules in one string (`reviews/helpers.ts:78-92`). An eval case stores only the PR title and body (AC-20). **inference** to give the agent the same instruction text, the rules part must be split from the per-PR header (small edit in `reviews/helpers.ts`); otherwise eval either invents a number and author or sends different text, and the runs would not mirror production behaviour.
- **fact** `excludeFromReview` filters `files` and rebuilds `raw`, but `stripSections` copies every line before the first `diff --git` line verbatim (`reviews/diff-filter.ts:52-83`, branch at `:70`); the engine prompt is built from `diff.raw` (`reviewer-core/src/review/run.ts`). **inference** a stored case diff headed only by `--- a/` / `+++ b/` (AC-5 wording) passes the filter's `files` step but its `raw` is never stripped. The stored or assembled diff needs a `diff --git a/<f> b/<f>` line, or the case must be refused when its file matches `REVIEW_EXCLUDED_PATHS` (open question 5).
- **fact** `parseUnifiedDiff` opens a file on a `+++ ` line even without `diff --git` (`reviewer-core/src/diff.ts:39-42`), and `_shared/hunks.ts` has `newSideRanges(patch)` for a bare `@@` patch (`server/src/modules/_shared/hunks.ts:35`, `server/INSIGHTS.md:502`). **inference** AC-1 / AC-8 / AC-11 range checks can reuse `newSideRanges`.

Orchestration precedents
- **fact** Reviews run fire-and-forget in-process: the HTTP call returns run ids, `void executor.executeRuns(...)` runs on (`reviews/service.ts:170`); a boot reaper marks orphans (`app.ts:82`, `reviews/service.ts` `reapStaleRuns`, `server/INSIGHTS.md:58-63`).
- **fact** Onboarding is the closest precedent for AC-23/28: an atomic `INSERT … ON CONFLICT … setWhere status <> 'running'` claim returns nothing when a run is active (→ 409), results are written only while `status='running'`, and a boot reaper is awaited before listening (`onboarding/repository.ts:34-46`, `onboarding/service.ts` `start`/`reapInterrupted`, `app.ts:91`, `server/INSIGHTS.md:411-414`).
- **fact** `JobRunner` is a p-queue with global `timeoutMs` 120 000 and `retries` 2, concurrency 3 (`platform/jobs.ts:69-71`); `register` only accepts `serializeBy` (`modules/_shared/ports.ts:20-24`); a timed-out attempt is aborted and retried (`jobs.ts:139-153`); jobs left queued are not re-enqueued on boot (`jobs.ts:171-174` docstring). Clone, index and resync already share its 3 slots (`repos/service.ts:40`, `repo-intel/service.ts:180-194`).
- **inference** an eval run of up to 50 cases is longer than 120 s, so as a plain `JobRunner` job it would be aborted and re-run (paid model calls twice) unless `platform/jobs.ts` gains per-registration timeout/retries; and a long run holds one of 3 slots that clone/index jobs also need.
- **fact** `container.llm(provider)` throws `ConfigError('<KEY> is not configured')` (`platform/container.ts` `buildLlm`) and `ConfigError` has status 500 (`platform/errors.ts:37-41`). AC-24 requires a 4xx naming the provider. Onboarding maps this itself with a message template (`onboarding/service.ts`, `failureMessage`).
- **fact** Route rate limit precedent: `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }` (`reviews/routes.ts:35`).

Reuse across modules
- **fact** Rule `no-cross-module-internals`: a module may import another only via its `index.ts` / `types.ts` or a container-wired port, and `_shared/` is exempt (`.claude/skills/onion-architecture/assets/dependency-cruiser.cjs:121`). `reviews/` has no `index.ts` today (ls). Precedents: `smart-diff/index.ts` re-exports only the pure classifier (`smart-diff/index.ts:1-8`); the glob matcher moved to `_shared/glob.ts` with re-exports (`server/INSIGHTS.md:357`); a module's `ports.ts` declares narrow structural types instead of importing another module (`server/INSIGHTS.md:208`).
- **fact** `ReviewStore` already exposes `findingContext` (finding + review + pull) and `getPrFiles` (`reviews/ports.ts:124`, `reviews/repository/review.repo.ts:115-129`). **inference** the eval module can read the seed data through a structural port that the container satisfies with `reviewRepo`.
- **fact** `AgentStore` has `getVersion(agentId, version)` and `resolvedSkills(agentId)` (`agents/ports.ts:109,118`); `ResolvedSkill` carries `id`, `name`, `body`, `appliesTo` but **no version** (`agents/ports.ts:81`); the snapshot holds skill ids, not bodies (`server/INSIGHTS.md:161-166`); a skill's `version` bumps only on a body change (`skills/repository.ts:96-107`); the open question "decide before L06 needs reproducible runs" is recorded (`server/INSIGHTS.md:618`). **inference** `skill_versions[]` (AC-19, EC-7) needs `version` added to `ResolvedSkill`, which touches the in-memory `AgentStore` fake (`server/test/agents-service.test.ts:17`).
- **fact** Agent deletion only removes the agent row today (`agents/service.ts` `delete` → `deleteById`, `agents/repository.ts:148`); `eval_cases.owner_id` has no FK, `agent_versions`/`agent_skills` cascade from `agents` (`db/schema/agents.ts:52,65,90`). **inference** AC-14 is not satisfied by existing cascades and needs either a new FK column or an explicit delete.
- **fact** `reviewsForPull` builds the finding payload (`reviews/service.ts` `reviewsForPull`, `reviews/helpers.ts:22-62`), and `actOnFinding` returns `findingRowToDto(row)` without any extra markers (`reviews/findings.ts:26-32`). **inference** if the finding payload gains `eval_case_id`, the accept/dismiss response would not carry it, so a client that merges that response into its cache could drop the "In eval set" label.

Money columns
- **fact** drizzle 0.38 reads `numeric` as a string; "other `cost_usd` columns (runs, eval, ci) are still `double precision` — migrate them the same way if touched" (`server/INSIGHTS.md:491-495`). **inference** `eval_runs` is rewritten anyway, so `numeric(14,8)` with `Number()` / `String()` mapping at the repository is the convention.

Client
- **fact** AgentEditor tabs are the `TABS` array (config, skills, context) with a comment "Later lessons add Evals" (`client/src/app/agents/[id]/_components/AgentEditor/constants.ts:10-15`). The sidebar `NAV` has `SKILLS LAB` with skills, agents, conventions (`client/src/vendor/ui/nav.ts:30-36`); `activeKeyFor` already maps `/eval` to key `eval` (`client/src/components/app-shell/helpers.ts:37`).
- **fact** `FindingCard` takes `f`, `onAction`, `pending`, `repoFullName`, `headSha` and renders accept/dismiss in its expanded body (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx:28-120`).
- **fact** Cross-route feature components live in `src/components/<kebab>/` (`context-docs`, `diff-viewer`, `confirm-dialog`) (ls `client/src/components`). **fact** hooks live in `src/lib/hooks/*` and keys in `src/lib/query-keys.ts`, with a polling precedent `refetchInterval` while `running` (`client/src/lib/hooks/onboarding-tour.ts:11-24`).
- **fact** The vendored `LineChart` takes `series: {name,color,data:number[]}`, hides the x axis, defaults the y range to 0.6–1.0 and has no tooltip (`client/src/vendor/ui/charts/LineChart.tsx:1-60`). `recharts ^2.15.0` is already a client dependency (`client/package.json`).
- **fact** The design shows the dashboard's runs table with a Compare button enabled for exactly two selected rows and "View full dashboard →" on the Evals tab (`client/docs/design/src/screen_skills.jsx:316-330, 460`, `screen_agents.jsx:188`).

Prior plans
- **fact** No earlier plan in `docs/plans/` covers eval. `07-onboarding-tour.*` and `08-pr-brief.brainstorm.md` chose a new vertical-slice module wired through the container and reused small pure helpers via `_shared`. `server/src/modules/index.ts:29` already names "eval/ci/hooks" as future modules.

## Options

### Common decisions (apply to options 2–5; each has one sensible shape, the alternative is named so the user can object)

Server
- **S1 Module and routes.** New `server/src/modules/eval/` (`routes.ts`, `service.ts`, `run-executor.ts`, `repository.ts`, `ports.ts`, `domain.ts`, `scoring.ts`, `constants.ts`), one import + one entry in `modules/index.ts`, one `container.evalDeps` getter (same pattern as `reviewDeps`, `container.ts:281`). Option 4 is the exception (below).
- **S2 Case storage and agent delete.** Add `source_finding_id uuid` nullable (FK → `findings` `ON DELETE SET NULL`, unique where not null) to `eval_cases`; the unique index makes a double Save one case and a 409 (AC-10, EC-4) with no check-then-insert race. For AC-14 add a nullable `agent_id` FK (`ON DELETE CASCADE`) on `eval_cases` and on the run table so the database deletes cases and runs with the agent atomically. Alternative: an explicit delete of cases inside the agents repository's delete (no new column, but the agents module then knows an eval table). Migrations only via `pnpm db:generate`.
- **S3 Run-level table.** Rewrite `eval_runs` to the spec's run-level record (id, workspace, agent, `agent_version`, `skill_versions` jsonb, status, started/finished, case counters, three nullable metrics, `unlabelled_findings`, `cost_usd numeric`, `case_ids` jsonb captured at start for AC-19) and add a child `eval_case_results` (run FK cascade, case FK, status, expected/matched, kept/dropped counts, findings jsonb, duration, cost). A deleted case then drops only its own result rows, the run keeps its metrics (AC-56) and is excluded from `flipped` (EC-19). Option 3 uses a different shape (below).
- **S4 One running run per agent.** A partial unique index on the run table `(agent_id) WHERE status = 'running'` makes the start insert the claim: a conflict is a 409 (AC-23, EC-9). **Not confirmed**: drizzle 0.38's `uniqueIndex().where()` (docs page shows `where` only on a plain index; `node_modules` is not installed in this worktree). Fallback with a precedent: lock the agent row (`.for('update')`, `agents/repository.ts:210`) in a short transaction, check, insert. A boot reaper sets `running` → `failed` (AC-28), awaited in `app.ts` next to the other two.
- **S5 Scoring is one pure file.** `modules/eval/scoring.ts` holds `matches` (same file, inclusive range intersection by bounds, no slack), `scoreCase`, and `aggregate` (recall, precision, citation_accuracy, `unlabelled_findings`, cost sum, null on a zero denominator). It imports contracts only, so `verify:l06` can run it with no provider. Alternative: put it in reviewer-core so the CI runner can reuse it; not chosen because reviewer-core is "prompt → LLM → grounding" and changes there also trigger the server lane (`reviewer-core/AGENTS.md`, `AGENTS.md` cross-package rules).
- **S6 Inputs to the engine (AC-20).** Only the parsed, filtered case diff, `prDescription` = case body, a task line built from the case title, the agent's captured `systemPrompt` / `model` / `strategy` and the applied skill blocks. No callers, repo map, project context, intent, scope filter, memory. `sessionId` groups the run's calls. A per-case deadline turns a hang into `error` (AC-26), like onboarding's `withDeadline`.
- **S7 Provider key.** Resolve `container.llm(agent.provider)` **before** inserting the run and map the `ConfigError` to a 4xx `AppError` that names the provider (AC-24). Reuse the resolved client for the run.
- **S8 Run uses the captured agent.** Capture the `AgentRecord` and the resolved skills (with versions) in memory at start and store `agent_version` + `skill_versions`; do not re-read the agent per case (EC-6). Compare reads the system prompt and model from `agent_versions` through `AgentStore.getVersion` (the table exists "for eval", `agents/repository.ts:188`). Alternative: copy prompt and model onto the run row (self-contained, a few KB per run).
- **S9 Finding payload extension.** `FindingRecord` gains nullable `eval_case_id` and `eval_unavailable_reason`; the reviews read path fills them through one narrow port (`caseIdsBySourceFinding`) that the container satisfies with the eval repository, and computes availability from `pr_files` + `newSideRanges` (reviews already reads `pr_files`). Alternative: a separate eval endpoint that the client joins; rejected upfront (contradicts the wire in the spec).
- **S10 Sequential cases.** The loop runs cases one after another (the spec's sequence diagram). Bounded concurrency is an open question (2) because a 50-case run is minutes long.
- **S11 Rate limit and scope.** `POST /agents/:id/eval-runs` carries `rateLimit { max: 10, timeWindow: '1 minute' }` (NFR-3); every route resolves `getContext` and every repository query is workspace-scoped, another workspace's id answers 404 (NFR-4).
- **S12 `verify:l06`.** A `package.json` script in `server/` that chains `pnpm typecheck && pnpm lint && vitest run <eval tests>` and one scoring check that runs `scoring.ts` and the service's scoring path with an `LLMProvider` fake that throws if called and an empty `MockSecretsProvider` (`server/src/adapters/mocks.ts:347`). Precedent for a script under the package: `experiment:api-contract` runs a `tsx` file (`server/package.json`). Whether it includes `.it.test.ts` is open question 6.

Client
- **C1 Slicing.** Route-only pieces stay colocated: `agents/[id]/_components/AgentEditor/_components/EvalsTab/` (one entry in `TABS`) and `app/eval/` (`page.tsx` agent list + 6 newest runs; the agent page under it with metric cards, runs table, Compare). Pieces used by two routes are promoted on first reuse to `src/components/eval/`: `CaseEditor` (opened from `FindingCard` on the PR route and from the Evals tab), `MetricCards`, `RunsTable`, `RegressionAlert`, `CompareView`. The route composes; features do not import each other (frontend-architecture principle 3).
- **C2 Data.** `src/lib/hooks/eval.ts` + `keys.eval.*` in `query-keys.ts`; the run query uses `refetchInterval: 2000` while `status === 'running'` (OQ-1 default, same as `useOnboardingTour`). Case Editor is a modal component seeded by props (not a route); delete uses the existing `ConfirmDialog`.
- **C3 Seed.** The client builds the seed from data it already holds (finding, the file's patch, PR title and body) with a pure `buildCaseSeed` (type from decision, `must-find-<slug>` / `no-<slug>`, headers). The server re-reads the finding on save (spec sequence diagram) and validates (AC-11). Alternative: a `GET` seed endpoint (one place for the slug rule, but a new wire shape the spec does not list).
- **C4 Word diff.** A small pure word-level LCS helper with a size cap, no new dependency. Alternative: the `diff` package (a new dependency and a pnpm lockfile regeneration).
- **C5 Trend chart (stretch b).** A `TrendChart` in its own folder built on `recharts` directly, because the vendored `LineChart` has no tooltip or null gaps (AC-59). Deleting the folder cuts stretch (b). Alternative: extend the vendored `LineChart`.
- **C6 Strings.** All new text in `messages/en/eval.json` (NFR-5), including the finding-card action and label.
- **Stretch (c)** is independent of A/B/C: `evals/skills/spec-authoring/spec-authoring.eval.ts` in the existing `evals/` pattern (`evals/skills/dependency-checker` is the only precedent present).

### Option 1 — Baseline: do nothing extra
- How: no code. Findings stay accept/dismiss only; prompt changes are checked by re-running reviews by eye.
- Pros: no effort, no risk, no model spend.
- Cons: fails every goal and `verify:l06` does not exist (spec "Problem and user", AC-51).
- Risks: reference point only; it cannot meet the done condition.

### Option 2 — Own `eval` module; reuse via a public `reviews/index.ts`; fire-and-forget run with a DB claim; run-level + child results tables
- How:
  - **Reuse (AC-21).** Add `modules/reviews/index.ts` exporting only the pure pieces: `excludeFromReview`, `partitionSkills`, `skillBlockText`, `REVIEW_STRATEGY`, and the extracted review-rules text of `taskLine`. No file moves. Eval assembles skill blocks in ~10 lines from `agents.resolvedSkills` (+ version) the same way `buildSkillBlocks` does, minus logging and tokens.
  - **Orchestration.** `service.start` validates (agent, key, ≥1 case), claims the run (S4), answers `202 {run_id, status:'running'}`, and `void runExecutor.run(...)`; per-case results and counters are written as each case ends; the final status follows AC-27. Boot reaper per AC-28.
  - **Tables.** S3.
- Pros: smallest change to existing code (one new index file, one helper split, one port field); same shape as onboarding and reviews; no change to shared platform code; the module is deletable as a unit.
- Cons: the skill-block assembly exists in two places (executor and eval), so the "same pre-processing" guarantee rests on the shared helpers and a test, not on one code path.
- Risks: the duplicated ~10 lines can drift; `reviews/index.ts` becomes a public surface that someone may widen.

### Option 3 — Own `eval` module; reuse via promotion to `_shared/`; run as a `JobRunner` job; one run table with results in jsonb
- How:
  - **Reuse.** Move `diff-filter.ts`, `applicability.ts`, `REVIEW_EXCLUDED_PATHS` and `skillBlockText` to `modules/_shared/` and leave re-exports in `reviews/` (the glob precedent, `server/INSIGHTS.md:357`).
  - **Orchestration.** Register an `eval-run` job (`serializeBy` agent id) in the route plugin and `enqueue` it; extend `JobRunner.register` with per-job `timeoutMs` and `retries: 0`; a second start still needs its own 409 check because `serializeBy` queues instead of rejecting; boot reaper still needed (queued jobs are not re-enqueued).
  - **Tables.** One run-level table with `results jsonb` (per-case results inside the row), no child table. Case latest outcome (AC-16) and `flipped` are computed in code over the jsonb of recent runs.
- Pros: one fewer table; the `jobs` table mirrors status; shutdown aborts the in-flight attempt through `ctx.signal`; the queue caps total background work.
- Cons: edits `platform/jobs.ts`, shared by clone/index; a long eval holds one of 3 queue slots; a jsonb rewrite per case; "latest outcome per case" and the case list become scans over jsonb.
- Risks: a missed per-job override re-runs the whole eval after 120 s (double cost); a deleted case leaves its results in old jsonb (filtered at read time).

### Option 4 — Put eval inside the `reviews` module
- How: `reviews/eval-service.ts` + `reviews/eval-run-executor.ts` beside `service.ts` and `run-executor.ts`, routes added to `reviews/routes.ts` (or a sibling plugin), direct imports of `diff-filter`, `applicability`, `helpers`, and the executor's private `buildSkillBlocks` made reusable. Tables as S3, orchestration as option 2.
- Pros: no cross-module question at all; `ReviewDeps` already has `llm`, `agents`, `tokenizer`, `git`; the least wiring.
- Cons: `reviews` already holds a 571-line executor and a 211-line service; eval has its own aggregate (cases, runs, scoring, compare) that is not a review; the spec and `modules/index.ts:29` expect a separate "eval" module; `ReviewDeps` fakes in tests grow.
- Risks: every later eval change touches the hot review module; harder to delete.

### Option 5 — Own `eval` module; extract one shared "prepare agent run" function used by both the executor and eval
- How: pull the middle of `runOneAgent` (exclude → task line → skill blocks → engine call) into one pure-ish function in `reviews/` (exposed through `reviews/index.ts`) that both `ReviewRunExecutor` and the eval executor call, with the PR-only slots (intent, callers, repo map, project context) as optional inputs that eval leaves empty. Orchestration and tables as option 2.
- Pros: "same deterministic pre-processing" holds by construction (AC-21); one place to change when the review prompt changes.
- Cons: refactors the hot path (`run-executor.ts` interleaves logging, trace and cancellation through the same steps); a regression there breaks production reviews.
- Risks: needs the full existing reviews test lane to stay green and extra tests for the extracted function; effort is the highest of the real options.

## Rejected upfront
| Option | Rule broken or reason | Source |
|---|---|---|
| Run the whole set inside the request and answer when it ends | The server must answer with the run id and `running` before any case completes | specs/13-eval-pipeline.md:112 (AC-18) |
| Store eval runs as `agent_runs` / `reviews` rows | The user chose to keep production statistics clean; eval cost shows on the eval run only | specs/13-eval-pipeline.md:36 |
| Put intent, repo map, callers, memory or project context in the eval prompt | Fixed inputs are the case snapshot and the agent version | specs/13-eval-pipeline.md:38 |
| Model judge or line slack in scoring | Scoring by code only, strict range intersection | specs/13-eval-pipeline.md:39, NFR-1 |
| Import `reviews/diff-filter.ts`, `applicability.ts` or `helpers.ts` from the eval module | Cross-module internals | `.claude/skills/onion-architecture/assets/dependency-cruiser.cjs:121` |
| Hand-write the migration | Only `pnpm db:generate` | root `CLAUDE.md`, "Do not touch" |
| Edit `client/src/vendor/shared` by hand | Edit the server copy, then `./scripts/shared-contracts.sh sync` | root `CLAUDE.md`, "Cross-package rules" |
| Separate eval endpoint instead of extending the finding payload | Contradicts the wire the approved spec lists (not a hard rule; recorded so the user can object) | specs/13-eval-pipeline.md:88 |
| Scoring inside reviewer-core | Not a hard rule; reviewer-core is the prompt → LLM → grounding engine and changes there trigger the server lane | `reviewer-core/AGENTS.md`, root `CLAUDE.md` |

## Criteria & weights
Fixed before scoring (1–5). UX/product fit is left out: the client contract and screens are the same under every option.
- c1 Spec coverage and "same pre-processing" guarantee (AC-21, 23, 26–28, 56) · weight 5
- c2 Fit with architecture and conventions (onion rings, vertical slice, existing precedents) · weight 4
- c3 Scope and effort · weight 3
- c4 Risk and reversibility (regression risk to the review path and shared platform code, migration) · weight 4
- c5 Testability (tests are ON) · weight 3
- c6 Security surface (workspace scoping, untrusted diff and findings, run-start abuse, double-billing) · weight 3

Maximum total 110.

## Scoring matrix
| option | c1 (5) | c2 (4) | c3 (3) | c4 (4) | c5 (3) | c6 (3) | weighted total |
|---|---|---|---|---|---|---|---|
| 1 Baseline | 1 | 5 | 5 | 5 | 3 | 5 | 84 |
| 2 Eval module, `reviews/index.ts`, fire-and-forget, run + child tables | 4 | 5 | 3 | 4 | 4 | 4 | 89 |
| 3 Eval module, `_shared` move, JobRunner job, jsonb results | 4 | 4 | 2 | 2 | 3 | 4 | 71 |
| 4 Eval inside `reviews` | 4 | 2 | 4 | 3 | 3 | 4 | 73 |
| 5 Eval module + extracted shared pipeline | 5 | 4 | 2 | 2 | 4 | 4 | 79 |

Evidence per cell:
- Option 1: c1 delivers nothing; c2–c4, c6 are 5 only because nothing changes; c5 3 = nothing to test. High total only because "do nothing" is free: it is a reference and is excluded from the recommendation because c1 = 1.
- Option 2: c1 4 — every AC reachable (claim as `onboarding/repository.ts:34`, reaper as `app.ts:91`), AC-21 rests on shared helpers + a test, not one code path; c2 5 — vertical slice, `index.ts` as in `smart-diff/index.ts`, ports structural (`server/INSIGHTS.md:208`); c3 3 — new module, migration, port edits, split of `taskLine`; c4 4 — reviews gets only an index file and a helper split, `eval_runs` has no consumer; c5 4 — pure `scoring.ts`, in-memory store fakes, claim exclusivity needs `.it.test.ts` (`server/INSIGHTS.md:419`); c6 4 — partial unique index closes double-start, workspace-scoped queries, key check before insert.
- Option 3: c1 4 — reachable but only after a `jobs.ts` change (`jobs.ts:69-71`), plus a separate 409 check; c2 4 — a job handler is the documented place for background work (onion skill "Where does X go") but shared-platform edits and `_shared` churn; c3 2 — `jobs.ts`, `_shared` moves, jsonb read paths; c4 2 — changes code that clone/index rely on, queue-slot starvation, double-billing if timeouts are missed; c5 3 — jsonb scans are testable but more cases to cover; c6 4 — same checks, `signal` abort on shutdown is a plus.
- Option 4: c1 4 — direct use of internals, strongest reuse but still two code paths for skills; c2 2 — grows `reviews`, contradicts the module list (`modules/index.ts:29`); c3 4 — least wiring; c4 3 — additive but in the hot module; c5 3 — `ReviewDeps` fakes grow; c6 4 — same.
- Option 5: c1 5 — one code path by construction; c2 4 — good ring placement but a refactor of the executor; c3 2 — extraction plus regression tests; c4 2 — a bug here breaks production reviews; c5 4 — the extracted function is easy to test, and existing review tests double as a guard; c6 4 — same.

## Sensitivity
- c1 (top weight 5) at 4: option 1 = 83, 2 = 85, 3 = 67, 4 = 69, 5 = 74. At 6: 85 / 93 / 75 / 77 / 84. Option 2 stays first among the viable options.
- c2 weight 4 → 1: option 2 = 74, 4 = 67, 5 = 67, 3 = 59. No change.
- c4 weight 4 → 5 (risk matters more): option 2 = 93, 5 = 81, 4 = 76, 3 = 73. No change.
- Stress: c1 weight 8, c3 and c4 weight 1: option 5 = 84, option 2 = 83. This is the only tested setting that flips the winner: it needs the single code path to be worth more than all effort and regression risk together.

## Recommendation
**Option 2**, with common decisions S1–S12 and C1–C6 as written. It is the only option that adds the module with no edit to shared platform code and the smallest touch on the review path, and it follows the two precedents that already exist for this exact shape (onboarding's claim + reaper, smart-diff's `index.ts`).

It would flip to **option 5** if the user wants AC-21 guaranteed by one code path and accepts a refactor of `run-executor.ts` with the full reviews lane as the safety net. It would flip to **option 3** only if the user wants eval work capped by the shared queue and accepts editing `platform/jobs.ts`. It would flip to **option 4** only if a separate module is not wanted.

Mixing is possible and cheap at plan time: option 2 with S3 replaced by jsonb results, or option 2 with `_shared` promotion instead of `reviews/index.ts`, are both small deviations the planner can record.

## For the planner

Modules and files
- `server/src/modules/eval/` (new) and `server/src/modules/index.ts`; `server/src/platform/container.ts` (`evalDeps`, one narrow port for the finding markers); `server/src/app.ts` (eval reaper, awaited); `server/src/db/schema/eval.ts` (+ `pnpm db:generate`).
- `server/src/modules/reviews/` — new `index.ts`; `helpers.ts` (split the rules text out of `taskLine`); `service.ts` / `helpers.ts` read path for `eval_case_id` and `eval_unavailable_reason`; make sure `actOnFinding`'s returned finding is handled (see Context).
- `server/src/modules/agents/ports.ts`, `repository.ts` — `version` on `ResolvedSkill`; update the fake in `server/test/agents-service.test.ts`.
- `server/src/vendor/shared/contracts/eval-ci.ts`, `review-api.ts` (finding fields), `knowledge.ts` untouched; then `./scripts/shared-contracts.sh sync`; `mcp` runs type-drift checks on shared changes.
- Client: `src/components/eval/` (new), `agents/[id]/_components/AgentEditor/` (`TABS`, `EvalsTab`), `app/eval/**` (new), `FindingCard`, `src/vendor/ui/nav.ts` (new item after Conventions), `src/lib/hooks/eval.ts`, `src/lib/query-keys.ts`, `messages/en/eval.json`, the contract copy.
- Evals harness (stretch c): `evals/skills/spec-authoring/`.

Constraints
- Onion rules and `pnpm arch`; routes call one service method; zod on params/body/response; errors as `AppError` (`.claude/skills/onion-architecture/SKILL.md`).
- A server test that touches the DB must end in `.it.test.ts`; stub LLM/GitHub via `adapters/mocks.ts`. Any eval `.it.test.ts` app must mock the agent's provider or give an empty `MockSecretsProvider`, or it hits the real key store (`server/INSIGHTS.md:569`).
- A request that must send exactly one model request sets `maxRetries: 0` and `transportRetries: 0` (`server/INSIGHTS.md:498`); the spec does not ask for that on eval cases (NFR-2 counts one call per case), so decide whether the engine's default re-prompt budget (`DEFAULT_REVIEW_MAX_RETRIES = 2`, `reviewer-core/src/review/run.ts`) is acceptable for cost.
- Client: components never call `fetch`; hooks and keys as above; `renderWithIntl` tests; accessibility per NFR-6 (Escape closes, focus returns).
- Money: `numeric(14,8)` mapped at the repository (`server/INSIGHTS.md:491`).
- Scoring: swap-safe normalisation of a finding with `start_line > end_line` (grounding uses min/max, `reviewer-core/src/grounding.ts:74-77`); the spec's AC-29 says `[start_line, end_line]`.

INSIGHTS entries to read
- `server/INSIGHTS.md:58-63` (queue in memory, reviews fire-and-forget), `:161-166` (agent version vs skill bodies), `:208-214` (structural ports), `:357-368` (`_shared` move with re-exports), `:411-422` (background claim, single service, testing a fire-and-forget run), `:491-505` (numeric cost, `maxRetries`, bare patch), `:569-582` (unmocked providers in `.it.test.ts`), `:618-622` (skill versions open question).
- `client/INSIGHTS.md:80` (unused `messages/en` namespaces), `:200-201` (spread the original in `vi.mock` of hook modules), `:514-519` (modal that calls a mutation in an effect and Strict Mode).

Open questions for the user
1. Which build? (options: 1. Option 2, own module + `reviews/index.ts`, recommended / 2. Option 5, extract one shared pipeline / 3. Option 3, JobRunner job + jsonb results / 4. Option 4, inside `reviews`)
2. Are the cases of one run executed one after another or a few at a time? (options: 1. sequential, simplest and predictable, recommended / 2. concurrency of 3, about a third of the wall time on 50 cases, more provider rate-limit risk)
3. AC-1 says the stored patch "contains" the finding's range; AC-11 and grounding use "intersects". Which rule enables the action? (options: 1. fully inside one hunk's new-side range, as worded / 2. intersects a hunk, same as AC-11 and grounding / 3. covered by the union of hunks)
4. On Save of a seeded case, which diff and PR meta are stored? (options: 1. the values posted, after the AC-11 checks, as the wire lists / 2. the server re-reads them from the finding and ignores the posted ones)
5. A finding or pasted diff whose file matches the review exclusion list (lock files, generated code): what happens? (options: 1. reject the save with 422 naming the file / 2. accept; the run marks that case `error` / 3. accept; it is run and scored as `fail`)
6. What does `pnpm verify:l06` run? (options: 1. unit lane only, hermetic, no Docker, recommended / 2. also the eval `.it.test.ts` files, which self-skip without Docker)

## Sources
- Spec and course task: `specs/13-eval-pipeline.md`, `hw/L06/hw6-task.md`.
- Server: `server/src/db/schema/eval.ts`, `server/src/vendor/shared/contracts/eval-ci.ts`, `server/src/vendor/shared/contracts/knowledge.ts`, `server/src/modules/reviews/{run-executor,service,helpers,diff-filter,applicability,ports,routes,findings}.ts`, `server/src/modules/reviews/repository/review.repo.ts`, `server/src/modules/agents/{ports,repository,service}.ts`, `server/src/modules/skills/repository.ts`, `server/src/modules/onboarding/{service,repository}.ts`, `server/src/modules/_shared/{hunks,ports,context}.ts`, `server/src/modules/smart-diff/index.ts`, `server/src/platform/{container,jobs,errors}.ts`, `server/src/app.ts`, `server/src/modules/index.ts`, `server/package.json`, `server/AGENTS.md`, `server/INSIGHTS.md`.
- Engine: `reviewer-core/src/review/run.ts`, `reviewer-core/src/grounding.ts`, `reviewer-core/src/diff.ts`, `reviewer-core/src/scope.ts`, `reviewer-core/AGENTS.md`.
- Client: `client/src/vendor/ui/nav.ts`, `client/src/vendor/ui/charts/LineChart.tsx`, `client/src/components/app-shell/helpers.ts`, `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`, `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx`, `client/src/lib/hooks/onboarding-tour.ts`, `client/src/lib/query-keys.ts`, `client/messages/en/eval.json`, `client/docs/design/src/screen_skills.jsx`, `client/docs/design/src/screen_agents.jsx`, `client/package.json`, `client/AGENTS.md`, `client/INSIGHTS.md`.
- Rules and prior plans: `.claude/skills/onion-architecture/SKILL.md`, `.claude/skills/onion-architecture/assets/dependency-cruiser.cjs`, `.claude/skills/frontend-architecture/SKILL.md`, `docs/plans/08-pr-brief.brainstorm.md`, `AGENTS.md` (root, via `CLAUDE.md`).
- External: https://orm.drizzle.team/docs/indexes-constraints (fetched; shows `.where(sql…)` only on a plain index, no partial unique example, no 0.38-specific note).

## Not found
- Whether drizzle-orm 0.38 supports `uniqueIndex(...).where(...)` for the partial unique index in S4: the fetched docs page does not show it and `server/node_modules` is not installed in this worktree. The plan should confirm it (or use the row-lock fallback) before relying on it.
- How the design reaches the dashboard agent page (route and selection pattern): `screen_skills.jsx` shows the runs table and Compare, but I did not open the full dashboard screen; the route shape (`/eval/[agentId]` vs a query parameter) is the planner's.
- The exact names of the course's `verify:l06` checks: no `verify:*` script exists anywhere in the repo (rg), and the course task only says it must be green (`hw/L06/hw6-task.md:58`).
- Whether the existing server CI lane should also run `verify:l06`: not in the spec; `server-unit.yml` was only read in its header.
- The remaining body of `evals/skills/dependency-checker` and `evals/src` (stretch c): not opened; only the directory listing and `evals/README.md` were read.
