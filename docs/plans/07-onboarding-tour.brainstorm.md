# Brainstorm: Onboarding Tour (one model call, five typed sections, background generation)
Status: chosen: option 3
Spec: specs/11-onboarding-tour.md (SPEC-11, `Status: approved`)

## Problem
SPEC-11 adds a per-repository tour with five sections (overview + diagram, critical paths, how to run, reading order, three first tasks). One generation is exactly one model call and shows its cost. The request returns before the generation ends (AC-8), the page survives reload and a second tab (AC-12, EC-1, EC-2), a failed run never destroys the stored tour (AC-36), and the stale badge compares the stored commit with the index (AC-42). Cited paths are checked against the checkout's tracked files (AC-21).

The spec fixes behaviour, the wire shape and the security rules. It does not fix **how a generation is run and where its state (running / failed + message) lives**. That is the real choice, and it decides the module's size, whether a migration is needed, and whether OQ-1's default (restart → `failed`) can be met. Most other parts (prompt building, path check, cost, client page) have one sensible shape and are the same in every option.

Tags: **fact** = seen in the source; **inference** = my conclusion.

## Context found

Existing scaffolding (replaced by NFR-14)
- **fact** A table `onboarding(repo_id PK → repos ON DELETE CASCADE, json jsonb NOT NULL, generated_at)` already exists (`server/src/db/schema/context.ts:120-126`). No module, route or service uses it (rg for `onboarding` over `server/src`).
- **fact** The old contract `OnboardingLink/Section/Onboarding` (`kind: string`, `links[]`) is in `server/src/vendor/shared/contracts/knowledge.ts:28-47`; `server/src/prompts/onboarding.system.md:1-9` still asks for `architecture`/`routes_and_apis` sections with `links`. **inference** both are replaced, not extended (spec NFR-14).
- **fact** The feature model `onboarding` is registered, default `openrouter` / `deepseek/deepseek-v4-flash` (`server/src/vendor/shared/contracts/platform.ts:15, 45-50`), and `resolveFeatureModel` resolves it (`server/src/modules/settings/feature-models.ts:43-60`).
- **fact** The repo-intel facade has two onboarding hooks with no consumer: `getTopFilesByRank` and `getCriticalPaths`; both return `[]` when indexing is off or the repo is not JS/TS (`server/src/modules/repo-intel/types.ts:165-171`, `service.ts:684-715`). `getRepoMap` and `getIndexState` (with `lastIndexedSha`, `filesIndexed`) exist (`types.ts:130-148`, `repo-intel/routes.ts:33-39`).

Architecture and rules
- **fact** Module = `routes.ts` → `service.ts` → repository, registered in `modules/index.ts`; services get narrow ports through the constructor; `platform/container.ts` is the composition root (`server/AGENTS.md:33-37`, onion-architecture skill "Principles" 3, 8).
- **fact** The nearest LLM-generation precedent is `conventions`: deps object of ports (`ConventionsDeps`), `resolveModel`, lazy `llm(provider)`, `completeStructured` with `timeoutMs`/`maxRetries`, an in-memory `inFlight` guard returning an `AppError` 409, synchronous request (`server/src/modules/conventions/ports.ts:104-123`, `service.ts:52-92, 148-175`). **inference** its synchronous shape cannot satisfy AC-8/AC-12; its deps, evidence-gate and cost reporting shape can be copied.
- **fact** `GitClient.listFiles` returns tracked regular files, symlinks excluded; `readFile` resolves symlinks and re-checks the path is inside the clone (`server/src/adapters/git/simple-git.ts:190-210`; port `server/src/vendor/shared/adapters.ts:249-254`). **inference** these cover the path check (AC-21) and NFR-7 without a new adapter. `readFile` has no size cap; the conventions service adds its own `MAX_FILE_CHARS`/NUL filter (`conventions/service.ts:277-298`). The AC-33 rule (no real `.env`, only `.example/.sample/.template`) must be written new.
- **fact** `LLMProvider.completeStructured` returns `tokensIn`, `tokensOut`, `costUsd`; `StructuredRequest` takes `timeoutMs` and `maxRetries` ("controls reprompt-on-error") (`server/src/vendor/shared/adapters.ts:55-78`). **inference** whether `maxRetries > 0` counts as more than "exactly one model call" (AC-16, NFR-1) is not settled by the spec (see question 3).
- **fact** `ConfigError` (500) is thrown when a provider key is missing (`platform/container.ts` `buildLlm`: "OPENAI_API_KEY is not configured" style messages). **inference** AC-35 needs a message naming the provider, and NFR-9 forbids raw provider text; both need mapping in the service.
- **fact** Errors cross as `AppError(code, message, status)`; `ExternalServiceError` is 502 (`server/src/platform/errors.ts:8-37`).

Async and state
- **fact** Reviews run fire-and-forget in-process; a boot step `reapStaleRuns()` (awaited in `buildApp`) marks orphaned `running` rows failed (`server/src/app.ts:70-86`, `server/src/modules/reviews/service.ts:127`, `server/INSIGHTS.md:58-63`). **inference** this is the codebase's own pattern for "restart → failed" and maps onto OQ-1's default.
- **fact** `JobRunner` persists jobs in `jobs(kind, payload jsonb, status, attempts, started_at, error)` with a per-runner `timeoutMs` default 120 000 and `retries` default 2; retries apply to HTTP 429/5xx and network errors (`server/src/db/schema/ops.ts:6-27`, `server/src/platform/jobs.ts:68-71, 110-115`, `server/src/platform/resilience.ts:29-40`). **inference** a job handler that calls the model and fails with a 5xx would be run again, i.e. a second model call (AC-16), and the runner timeout (120 s) is lower than OQ-1's 180 s default. The timeout is per runner, not per job.
- **fact** A shutdown marks queued/running jobs failed; "nothing re-queues them on boot" (`server/src/platform/jobs.ts` doc on `shutdown`). **inference** a hard kill leaves a `running` jobs row; nothing reaps it (I found no reaper for `jobs`).
- **fact** `RunBus` (SSE) is keyed by `runId` for review runs (`server/src/modules/_shared/ports.ts:27-38`). **inference** nothing in the spec asks for a live stream (declined, spec Non-goals), so it is not an option.

Rate limit
- **fact** `@fastify/rate-limit` is registered globally only when `nodeEnv !== 'test'` (120/min) (`server/src/app.ts:94-97`). **fact** Per-route `config.rateLimit {max, timeWindow}` works only when the plugin is registered; the default key is the client IP (https://github.com/fastify/fastify-rate-limit). **inference** AC-15 (10/min) can be met with a route-level config, but an `inject()` integration test will not see it unless the plugin is registered in that test or the limiter lives in the service. No per-route use exists yet in the repo.

Client
- **fact** The sidebar `NAV` has no tour entry; `shell.json` and `activeKeyFor` already know the key `onboarding-tour` (`client/src/vendor/ui/nav.ts:20-28`, `client/src/components/app-shell/helpers.ts:31`, `client/messages/en/shell.json:23`). **fact** `client/src/vendor/ui/` is the vendored UI kit; AC-1 needs a NAV entry there (not hand-checked whether the vendor copy has a sync rule — see Not found).
- **fact** `/onboarding` is the first-run setup wizard, a bare route without the shell (`client/src/components/app-shell/ShellFrame.tsx:12`, `RepoNotFound.tsx:20`). `messages/en/onboarding.json` already holds tour strings with the OLD wording ("5-section guided tour: overview, architecture, key modules…") and an `onboarding` namespace that the wizard may also use (not checked). **inference** the tour page lives at `/repos/[repoId]/onboarding` (like `context`, `conventions`), and its strings must not collide with the wizard's.
- **fact** Pattern for pages: a thin `page.tsx` plus `_components/<Name>View` and hooks in `src/lib/hooks/*` (`client/src/app/repos/[repoId]/context/page.tsx`, `client/AGENTS.md:27-35`). **fact** Polling precedent: `refetchInterval` as a function of query data (`client/src/lib/hooks/reviews.ts:34`) and a fixed 1500 ms poll (`hooks/repo-intel.ts:36`). **inference** a `refetchInterval` that is on only while `generation.status === 'running'` gives AC-13 with no new transport.
- **fact** `MermaidDiagram` already uses `securityLevel: "strict"`, validates before render and renders nothing for invalid text (`client/src/components/mermaid-diagram/MermaidDiagram.tsx:14-45`) — this is AC-64 and NFR-5. **fact** It hardcodes `theme: "dark"` (`:37`). **inference** NFR-12 (both themes) needs a theme switch there.
- **fact** The kit's `Markdown` is `react-markdown` + `remark-gfm` without raw HTML (`client/src/vendor/ui/primitives/Markdown.tsx`, as recorded in `docs/plans/06-project-context.brainstorm.md`; react-markdown `^9.0.3`, `client/package.json:21`). I did not re-open the file in this run.
- **fact** The design `ScreenTour` and the "Share link" button are at `client/docs/design/src/screen_tour_context.jsx:75, 124`; the artboards are `tour` and `e-tour` (`client/docs/design/artboards.md:77, 89`). I read only these lines of the design file.

E2E
- **fact** e2e rules: flows "must never trigger a model call or mutate data", on the seeded `acme/payments-api`, no API key (`e2e/AGENTS.md:4-5, 27-28`). **fact** The seed sets `clonePath: null` for the demo repo (`server/src/db/seed.ts:318`). **fact** The hermetic stack starts the API with `tsx src/server.ts` (`scripts/e2e.sh:136`) and the only LLM mock is `MockLLMProvider`, an in-process test class injected through `ContainerOverrides` (`server/src/adapters/mocks.ts:45-112`). **inference** NFR-13 ("one deterministic e2e flow, using the stub model") needs a cloned fixture repository, a stub provider selectable from the running API, and a flow that mutates data. None exists. This holds for every option.

Prior plans
- **fact** `docs/plans/02-intent-layer.md` and `06-project-context.md` took the "narrow port + new module + container wiring" shape; no earlier plan covers background generation with persisted state.

## Options

**Option 1 — Baseline: do nothing extra.**
- How: no code. The "Onboarding Tour" entry stays without a screen; the `onboarding` table, old contract and prompt stay as unused scaffolding.
- Pros: no effort, no risk.
- Cons: fails US-1..US-9 and every AC; leaves the old contract and the old prompt wording in the studio.
- Risks: none technical; the product gap stays.

**Option 2 — New `onboarding` module; generation fire-and-forget in the service; generation state in memory; tour in the existing `onboarding` table (no migration).**
- How:
  - Module `server/src/modules/onboarding/` (routes → service → repository for the existing table). Contract: typed `Tour`, `TourRead`, section schemas in server `vendor/shared`, then sync.
  - `POST /repos/:id/onboarding/generate` checks workspace, checkout and a per-repo in-memory set, answers 202 `{generation:{status:'running'}}`, and starts an un-awaited async function with a 180 s timeout (`withTimeout` + `AbortSignal`).
  - Failure is kept in a service `Map<repoId, {status, error, started_at}>`. `GET /repos/:id/onboarding` merges the stored tour (`onboarding.json`, `generated_at`) with that map.
  - Tour metadata (commit, files, provider, model, tokens, cost, `dropped_items`) goes inside `json`.
  - Rate limit as route-level `config.rateLimit`.
- Pros: no migration; smallest server diff; mirrors the `conventions` in-memory guard (`conventions/service.ts:55-92`).
- Cons: a restart loses a running or failed state, so OQ-1's default ("interrupted by a restart is reported as failed") cannot be met: the page after a restart shows `idle`, and the AC-37 banner disappears. Two API instances would not share the guard (`server/INSIGHTS.md:644`).
- Risks: `json` NOT NULL means the first generation has no row, so "running" can only live in memory; a crash mid-run is invisible to the user.

**Option 3 — New `onboarding` module; fire-and-forget in the service; generation state persisted next to the tour; boot-time reaper.**
- How:
  - Same module, contract, route and timeout shape as option 2.
  - A migration via `pnpm db:generate` makes the state durable. Either (3a) the existing `onboarding` table gets `status`, `started_at`, `error` columns and a nullable `json`, or (3b) a small new `onboarding_generations` table keyed by `repo_id`. Both keep `ON DELETE CASCADE` on `repo_id` (AC-39 then follows: an insert for a removed repo fails the FK, and the service treats it as "store nothing").
  - A single atomic "claim" (insert/update where status is not `running`) gives `generation_in_progress` across tabs and removes the need for an in-memory set. A reaper called from `buildApp` next to `reapStaleRuns` (`app.ts:70-86`) marks leftover `running` as `failed` with "Generation timed out" semantics for restarts.
  - The old failed message is cleared by the next claim; a failed run never touches the stored `json` (AC-36).
  - Tour metadata may stay inside `json` (one zod parse on read) or become columns; that is a planner detail.
- Pros: meets every AC and OQ-1's default; the state survives reload and restart; the atomic claim is the single place for EC-1; follows the reviews/`reapStaleRuns` pattern; repository tests are plain `.it.test.ts`.
- Cons: one migration (additive); the dev-DB drift trap noted in `server/INSIGHTS.md:485-490` applies; a bit more code than option 2 (repository, reaper).
- Risks: reaper must run before the server accepts requests (as the review reaper does) or it could reap a fresh run; single-instance assumption is the same as for reviews.

**Option 4 — New `onboarding` module; run each generation as a `JobRunner` job (`onboarding-generate`); state derived from the `jobs` table; tour in the existing table.**
- How: register a handler in the route plugin with `serializeBy: payload → onboarding:<repoId>`; `enqueue` returns the job id; the read endpoint looks up the latest `jobs` row of that kind and repo (payload is jsonb, no repo column) and maps its `status`/`error` to `generation`.
- Pros: no tour-specific state table; serialisation per repo exists; the pattern is used by clone and index jobs.
- Cons: the runner's `retries: 2` re-runs the handler on 429/5xx, which can make a second model call (AC-16, NFR-1); the runner `timeoutMs` is 120 s for all kinds, not the 180 s default of OQ-1; `jobs.error` stores the raw error message, which then needs scrubbing for NFR-9 before it is shown; no repo key, so the read path queries jsonb; a hard kill leaves `running` forever (no `jobs` reaper); two quick requests are serialised, not rejected, so `generation_in_progress` still needs its own guard.
- Risks: needs changes to the shared `JobRunner` (per-kind retries/timeout) to fit, which touches a platform file used by clone and index.

## Rejected upfront
| Option | Rule broken | Source |
|---|---|---|
| Run the generation inside the POST request and return the finished tour (the `conventions` shape) | Spec: the server must accept the request before the generation ends; the page must show "generating" on reopen | `specs/11-onboarding-tour.md` AC-8, AC-12, EC-2 |
| Share the `RunBus` SSE stream for progress | Spec non-goal "live step log"; the bus is keyed to review runs | `specs/11-onboarding-tour.md` Non-goals; `server/src/modules/_shared/ports.ts:27-38` |
| One model call per section, or feeding SPEC-10 documents / GitHub issues into the prompt | Spec non-goals; exactly one call | `specs/11-onboarding-tour.md` Non-goals, AC-16 |
| Hand-write the SQL for the new columns/table | Migrations only through `pnpm db:generate` | `AGENTS.md` "Do not touch" |
| Service takes the whole `Container`, or `routes.ts` queries the DB | Onion layering: ports through the constructor, thin routes | `.claude/skills/onion-architecture/SKILL.md` Principle 3, "Review checklist" |
| Edit `client/src/vendor/shared` directly | Contracts are edited in the server copy, then synced | `AGENTS.md` "Cross-package rules" |

## Criteria & weights
| # | Criterion | Weight | Why this weight |
|---|---|---|---|
| c1 | Fit with architecture and conventions | 4 | onion layers, existing reaper and module patterns |
| c2 | Scope and effort | 3 | the feature is already large (server, client, e2e) |
| c3 | Risk and reversibility | 3 | the cost of a wrong call is a paid model call and lost state |
| c4 | Testability | 3 | NFR-13, fakes for ports, `.it.test.ts` lane |
| c5 | Security surface | 3 | untrusted repo text and model output are in every option |
| c6 | Spec and UX fit (AC/EC/OQ defaults met) | 5 | the spec is approved; a missed AC is a rework |

## Scoring matrix
| Option | c1 (×4) | c2 (×3) | c3 (×3) | c4 (×3) | c5 (×3) | c6 (×5) | Weighted total (max 105) |
|---|---|---|---|---|---|---|---|
| 1 Baseline | 3 | 5 | 5 | 3 | 5 | 1 | 71 |
| 2 In-memory state, no migration | 4 | 4 | 3 | 4 | 4 | 3 | 76 |
| 3 Persisted state + reaper | 5 | 3 | 3 | 4 | 4 | 5 | 87 |
| 4 `JobRunner` job | 3 | 3 | 2 | 3 | 3 | 3 | 60 |

Evidence per score
- Option 1: c1 3 — breaks nothing but leaves the scaffolding unused (`context.ts:120`); c2/c3/c5 5 — no change; c4 3 — nothing to test; c6 1 — no AC met.
- Option 2: c1 4 — same module shape and in-memory guard as `conventions` (`service.ts:55`); c2 4 — no migration, no reaper; c3 3 — state lost on restart, a running generation after a crash is invisible; c4 4 — service testable with fakes, a repository test is only for the existing table; c5 4 — same prompt/validation handling in every option, route config limiter cannot be tested through `inject()` (`app.ts:94-97`); c6 3 — OQ-1 default and the post-restart banner not met.
- Option 3: c1 5 — follows `reapStaleRuns` and the repository/port layering (`app.ts:70-86`); c2 3 — adds a migration, repository and reaper; c3 3 — additive migration, but the dev-DB drift trap exists (`server/INSIGHTS.md:485`); c4 4 — atomic claim and reaper are repository-level `.it.test.ts`, service uses fakes; c5 4 — error text is written by the service, so NFR-9 is handled in one place; c6 5 — every AC and the OQ-1 default can be met.
- Option 4: c1 3 — `JobRunner` is meant for clone/index work, state lives in a generic jobs payload (`ops.ts:6-27`); c2 3 — runner needs per-kind retry/timeout to be usable; c3 2 — retry can double the model call, shared platform file touched (`jobs.ts:68-71, 110-115`); c4 3 — runner tests need DB (`test/jobs.test.ts` exists); c5 3 — raw `jobs.error` must be scrubbed before display; c6 3 — 180 s default and restart → failed not met without extra code.

## Sensitivity
Move the top weight (c6, 5) by ±1, others fixed.
- c6 = 4 → option 1: 70, option 2: 73, option 3: 82, option 4: 57.
- c6 = 6 → option 1: 72, option 2: 79, option 3: 92, option 4: 63.
The winner does not change. Moving c2 (effort) up to 5 raises option 2 to 82 and option 3 to 93, still option 3. Option 2 only wins if c6 drops to about 2, i.e. if the user decides OQ-1's restart behaviour does not matter (see question 1).

## Recommendation
**Option 3** (persisted state, atomic claim, boot reaper). It is the only option that meets OQ-1's default, survives reload and restart (EC-2, EC-10), and puts the "one generation per repository" rule (EC-1) in one atomic place instead of an in-memory set. It reuses a pattern the repo already has (`reapStaleRuns`).

What would flip it
- To option 2: the user accepts that a restart simply forgets a running or failed generation (changing OQ-1's default), and wants no migration.
- To option 4: the `JobRunner` gets per-kind `retries`/`timeoutMs` for another reason, and the user wants all background work visible in the `jobs` table.

## For the planner
Modules and files (inference from the above; paths are where work lands)
- Server: new `server/src/modules/onboarding/` (domain, ports, service, repository, routes, prompt builder, candidate/excerpt picking, AC-33 file filter, path check); `modules/index.ts` registration (`index.ts:36-49`); `platform/container.ts` wiring (deps pattern at `container.ts:~165-200`); `server/src/db/schema/context.ts` (+ `pnpm db:generate`); `src/prompts/onboarding.system.md` rewritten (keep the untrusted-data rule, `server/src/prompts/onboarding.system.md:12-13`); `app.ts` reaper call.
- Contracts: replace `Onboarding*` in `server/src/vendor/shared/contracts/knowledge.ts:28-47`, then `./scripts/shared-contracts.sh sync`; also `server/test/contracts.test.ts` (mentions onboarding) and the `server/src/vendor/shared/index.ts` comment.
- repo-intel: consume `getRepoMap`, `getTopFilesByRank`, `getCriticalPaths`, `getIndexState` through the facade (`repo-intel/types.ts:130-171`), degrading to the tracked-file list when empty (AC-31/32).
- Client: `NAV` entry in `client/src/vendor/ui/nav.ts:20-28` between pulls and context; route `client/src/app/repos/[repoId]/onboarding/` (`page.tsx`, `layout.tsx` for the crumb like `context/`), `_components/TourView/…`; hooks in `client/src/lib/hooks/` and keys in `query-keys.ts`; replace the old strings in `client/messages/en/onboarding.json` (check the wizard's use first); theme switch in `MermaidDiagram` (`:37`).
- E2E: `e2e/specs/` flow plus whatever stub-model and cloned-fixture mechanism question 2 settles (existing `e2e/specs/06-onboarding.flow.json` is the wizard flow — not read in this run).

Constraints
- Onion layering and `pnpm arch`; zod on route params/response; errors as `AppError`; the secret key never in logs or messages (NFR-9, NFR-10).
- Migrations only via `pnpm db:generate`; contracts edited in the server copy then synced; any server DB test ends in `.it.test.ts` (`AGENTS.md`).
- `ConfigError` for a missing key is HTTP 500 with the env var name in its message; the tour needs its own message naming the provider (AC-35).
- The global rate limit is off in tests (`app.ts:94-97`).

INSIGHTS to read first
- `server/INSIGHTS.md:58-63` (queue state in memory, reaper), `:485-490` (dev DB ahead of migrations), `:494` (`enqueue` unhandled rejection), `:640-650` (conventions: synchronous, in-memory guard).
- `server/src/modules/repo-intel/INSIGHTS.md` and `README.md` (not opened in this run; read before touching repo-intel).
- `client/INSIGHTS.md:117` (`ShellFrame` and the bare `/onboarding` route).

Open questions for the user
1. Must a generation that was running when the API restarted show as `failed` after the restart (OQ-1's default), or may it just disappear? (options: 1. yes, persist the state — option 3 / 2. no, forgetting is fine — option 2)
2. How do we meet NFR-13's "stub model" in the hermetic e2e stack? The demo repo has no checkout, the runner forbids model calls and data changes, and no stub provider is reachable from `tsx src/server.ts`. (options: 1. add an env-selected stub LLM provider plus a cloned fixture repository in the e2e stack and relax the e2e rule for this one flow / 2. cover the five cards with a server integration test and keep e2e to the empty and not-cloned states / 3. a test-only seed route)
3. Does "exactly one model call" allow the provider's own re-prompt on invalid output (`maxRetries`), or must it be 0 so malformed output fails at once (EC-10)? (options: 1. `maxRetries: 0`, one call, failure on bad output / 2. allow re-prompt, count it as one logical call)
4. Where does the tour's metadata live? (options: 1. inside the stored json, parsed once with zod / 2. typed columns for commit, tokens, cost)
5. Do we keep the table name `onboarding` (3a) or add a separate generations table (3b)? (options: 1. extend `onboarding` / 2. new `onboarding_generations`)

## Sources
- `specs/11-onboarding-tour.md` (all AC/EC/NFR/OQ references)
- `docs/plans/06-project-context.brainstorm.md` (comparable brief; client Markdown fact reused, not re-opened)
- https://github.com/fastify/fastify-rate-limit (per-route `config.rateLimit`, default key, plugin must be registered) — fetched in this run
- Code opened: `server/src/db/schema/context.ts`, `server/src/db/schema/ops.ts`, `server/src/prompts/onboarding.system.md`, `server/src/vendor/shared/contracts/knowledge.ts`, `server/src/vendor/shared/contracts/platform.ts`, `server/src/vendor/shared/adapters.ts`, `server/src/modules/conventions/{routes,service,ports}.ts`, `server/src/modules/repo-intel/{types,service,routes}.ts`, `server/src/modules/project-context/{routes,service}.ts`, `server/src/modules/settings/feature-models.ts`, `server/src/platform/{container,jobs,resilience,errors,prompts}.ts`, `server/src/app.ts`, `server/src/adapters/mocks.ts`, `server/src/adapters/git/simple-git.ts`, `server/src/adapters/repo-files/fs.ts`, `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/{helpers,ShellFrame}.ts*`, `client/src/components/mermaid-diagram/MermaidDiagram.tsx`, `client/src/lib/hooks/{conventions,repo-intel}.ts`, `client/messages/en/onboarding.json`, `scripts/e2e.sh`, `e2e/AGENTS.md`, `server/AGENTS.md`, `client/AGENTS.md`, `server/INSIGHTS.md` (grep), `client/INSIGHTS.md` (grep)

## Not found
- Whether `client/src/vendor/ui/nav.ts` is edited by hand or has its own sync rule (vendored UI kit); I did not open `client/src/vendor/ui/README.md`.
- The content of `client/messages/en/onboarding.json` beyond its first lines, and whether the setup wizard uses the same namespace.
- The repo-intel `INSIGHTS.md` and the indexer README (not opened); how `getRepoMap` output is sized for a 30,000-token prompt budget (OQ-2) is unverified.
- Whether the installed `react-markdown` version's default URL transform meets "links limited to the schemes the studio's markdown renderer already allows" (NFR-4) — not checked.
- `e2e/specs/06-onboarding.flow.json` and `e2e/INSIGHTS.md` (the existing wizard flow; not opened).
- The existing `onboarding` table has no migration-time rows I could verify (not queried; read-only run), so "no stored tour in the old shape" rests on the spec's NFR-14.
- Whether the dev server's global rate limiter and a route-level override both apply to the same request (only the plugin README was read).
- Real design details of the `ScreenTour` card layout (only the matching lines were read).
