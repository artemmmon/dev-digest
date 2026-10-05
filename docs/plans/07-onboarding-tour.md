# Development Plan: Onboarding Tour (SPEC-11)
Status: approved
Spec: specs/11-onboarding-tour.md
Brainstorm: docs/plans/07-onboarding-tour.brainstorm.md
Execution mode: multi-agent (chosen by the user)

## Goal
Implement SPEC-11 as brainstorm option 3: a new server `onboarding` module that generates a five-section tour with one model request in the background, keeps the generation state in Postgres and reaps interrupted runs on boot; the client tour page; one stub-model e2e flow on a fixture repository.
In scope: tour contracts, `onboarding_generations` table, `server/src/modules/onboarding/`, a `transportRetries` request field honoured by the three LLM providers, an env-selected stub provider, the client route `/repos/[repoId]/onboarding`, the e2e fixture + flow + CI wiring.
Out of scope: everything in the spec's Non-goals; new unit/integration tests (tests are off — the `Tests (test-writer)` lines are a record only); changing existing e2e flows or the demo seed.

Names fixed by this plan: routes `GET /repos/:id/onboarding`, `POST /repos/:id/onboarding/generate`; LLM `schemaName` `OnboardingTourDraft`; env `DEVDIGEST_LLM_STUB` (path to a JSON fixture) and `SEED_E2E_FIXTURE_PATH`; fixture repository `devdigest-fixtures/tour-sample` with the fixed id `00000000-0000-4000-8000-0000000000e2` (never `acme/payments-api`).

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | 1–3 | server contracts + LLM port + schema, reviewer-core, client contract copy | — | Exports of `contracts/onboarding-tour.ts` (`TourSectionKind`, `TOUR_SECTION_KINDS`, `TOUR_LIMITS`, section schemas, `Tour`, `TourGeneration`, `TourRead`, `TourGenerationStarted`); `StructuredRequest.transportRetries`; table `onboardingGenerations`; the migration file name |
| G2 | 4–8 | server `modules/onboarding`, container, app | G1 | Route paths and status codes; error codes `generation_in_progress` (409), `repo_not_cloned` (409); `container.onboardingDeps`; the exact failure messages from `constants.ts` |
| G3 | 9–12 | client | G1 (may run in parallel with G2) | Route `/repos/<id>/onboarding`; the visible strings the flow waits on (`client/messages/en/onboarding.json`) |
| G4 | 13–15 | server stub + seed, scripts, CI, e2e | G2 and G3 | — |

## Skills behind the steps
| Path glob (routing.json rule id) | Skills | Why they matter here |
|---|---|---|
| `server/src/{modules,platform,adapters}/**`, `server/src/*.ts` (server-app) | onion-architecture, fastify-best-practices | ring placement, ports via constructor, thin zod-typed routes, per-route rate limit |
| `server/src/modules/**/repository.ts`, `server/src/db/**` (server-data) | drizzle-orm-patterns | upsert with `setWhere`, transaction, typed returns |
| `server/src/db/schema/**` (server-schema) | postgresql-table-design | PK = FK, `timestamptz`, `text`, NOT NULL |
| `server/src/vendor/shared/**`, `client/src/vendor/shared/**` (shared-contracts-*) | zod, onion-architecture | enums, bounds in the schema, exported schema + type |
| `reviewer-core/src/**` (reviewer-core) | typescript-expert, zod | purity contract, optional field with unchanged default |
| `client/src/**` (client-src), `client/src/app/**` (client-app-router), `client/messages/**` (client-i18n) | frontend-architecture, react-best-practices, next-best-practices | colocation, hooks in `src/lib/hooks`, derive-don't-store, thin page |
| `{client,server,reviewer-core,e2e}/**`, `scripts/**`, `.github/workflows/**`, `server/.env.example` (security-surface) | security | untrusted repo text in the prompt, LLM output as data, safe errors, rate limit, read-only CI |
(The practices are in the steps. The implementer loads a skill only where a step says `load:`.)

## Steps

### Step 1 — Tour contracts replace the old Onboarding scaffold (server contracts, client copy)
- Files: create `server/src/vendor/shared/contracts/onboarding-tour.ts` · modify `server/src/vendor/shared/contracts/knowledge.ts` · modify `server/src/vendor/shared/index.ts` · modify `server/test/contracts.test.ts` · create `client/src/vendor/shared/contracts/onboarding-tour.ts` · modify `client/src/vendor/shared/contracts/knowledge.ts` · modify `client/src/vendor/shared/index.ts`
- Change: delete `OnboardingLink`/`OnboardingSection`/`Onboarding` (`knowledge.ts:28-47`). New file exports: `TourSectionKind` (enum of the five kinds), `TOUR_SECTION_KINDS` (ordered const array), `TOUR_LIMITS` (`{ criticalPaths: 8, guidedReading: 8, howToRun: 8, firstTasks: 3, overviewChars: 1200 }`), `TourComplexity` (`low|medium|high`), five section schemas each with `kind: z.literal(...)` — `architecture_overview {body, diagram: nullable}`, `critical_paths {files[] of {path, note}}`, `how_to_run {steps[] of {command, source}}`, `guided_reading {reading[] of {path, why}}`, `first_tasks {tasks[] of {title, scope, complexity}}` — with `.max()` from `TOUR_LIMITS`; `Tour` (`repo_id, generated_at, commit_sha, files_indexed, limited_index, provider, model, tokens_in, tokens_out, cost_usd: nullable, dropped_items, sections: z.tuple([the five, in order])`); `TourGeneration` (`status: idle|running|failed`, `started_at: nullable`, `error: nullish`); `TourRead` (`tour: Tour.nullable()`, `generation`); `TourGenerationStarted` (`generation`). Add the `export *` line and fix the header comment in `index.ts`. Client files come only from `./scripts/shared-contracts.sh sync`.
- Covers: AC-18, AC-27, NFR-14
- Rules / skills: shared-contracts-server, shared-contracts-client (zod)
- Practices: wire fields stay `snake_case` (`AGENTS.md` Naming); `z.enum` for fixed sets, export schema and `z.infer` type under one name as the file's neighbours do (`knowledge.ts:9-10`); `Provider` is imported from `./knowledge.js` with the `.js` suffix (`platform.ts:2`); never hand-edit the client copy (`client/AGENTS.md` Gotchas).
- Tests (test-writer): `server/test/contracts.test.ts` additions — AC-18, AC-27 (tuple order, complexity enum, limits reject a 9th item)
- Existing tests to update: `server/test/contracts.test.ts:12,134-138` imports and parses `Onboarding` — replace with a `TourRead.parse` of a minimal valid tour.
- Done when: `rg -n "OnboardingSection|OnboardingLink" server/src client/src` prints nothing; `./scripts/shared-contracts.sh check` passes; `pnpm typecheck` passes in `server/` and `client/`; `pnpm test:unit` in `server/` passes.

### Step 2 — One request per call: `transportRetries` on the structured request (server port, reviewer-core, adapters)
- Files: modify `server/src/vendor/shared/adapters.ts` · modify `reviewer-core/src/llm/openrouter.ts` · modify `server/src/adapters/llm/openai.ts` · modify `server/src/adapters/llm/anthropic.ts` · modify `client/src/vendor/shared/adapters.ts`
- Change: add optional `transportRetries?: number` to `StructuredRequest` (`adapters.ts:55-70`), documented as "HTTP-level retries on timeout/429/5xx; unset keeps each provider's default". OpenRouter (`openrouter.ts:93`): when `req.transportRetries` or `req.timeoutMs` is set, pass them as the SDK per-request options (`{ maxRetries, timeout }`) — today the client-level `maxRetries: 2` / `timeout: 90_000` (`:78-79`) apply and `req.timeoutMs` is ignored. OpenAI (`openai.ts:97`) and Anthropic (`anthropic.ts:103`): when set, call `withRetry(fn, { retries: req.transportRetries })` and pass `{ maxRetries: req.transportRetries }` as the SDK request option. Behaviour with the field unset must not change. Re-sync the client copy.
- Covers: AC-16, EC-24, NFR-1
- Rules / skills: shared-contracts-server, reviewer-core (typescript-expert), server-app (onion-architecture)
- Practices: retry and timeout belong to the adapter, not the service (onion Principle 5); reviewer-core stays pure — no new imports (`reviewer-core/AGENTS.md` Rules); after touching reviewer-core run `cd server && pnpm typecheck` (`reviewer-core/AGENTS.md` Gotchas).
- Tests (test-writer): `reviewer-core/src/llm/openrouter.test.ts` — AC-16 (injected `fetch` answering 500 is called once with `transportRetries: 0`, `maxRetries: 0`)
- Existing tests to update: none (the field is optional).
- Done when: `npm run typecheck && npm test` pass in `reviewer-core/`; `pnpm typecheck && pnpm test:unit` pass in `server/`; `./scripts/shared-contracts.sh check` passes.

### Step 3 — `onboarding_generations` table (server schema)
- Files: modify `server/src/db/schema/context.ts` · modify `server/src/db/schema.ts`
- Change: next to `onboarding` (`context.ts:120-126`) add `onboardingGenerations` = `onboarding_generations(repo_id uuid PK → repos.id ON DELETE CASCADE, status text NOT NULL, started_at timestamptz NOT NULL, error text, updated_at timestamptz NOT NULL default now())`; `status` typed `'idle' | 'running' | 'failed'` with `.$type<>()`. Add it to the named import and the `schema` object in `schema.ts:36,50`. Leave `onboarding` untouched. Then run `pnpm db:generate` in `server/` and commit the generated migration as is.
- Covers: AC-9, EC-18
- Rules / skills: server-schema (postgresql-table-design), server-data (drizzle-orm-patterns)
- Practices: `timestamptz`, `text`, NOT NULL where required; the PK doubles as the FK index; FK written as `() => repos.id`; never hand-edit `server/src/db/migrations/` (`AGENTS.md` Do not touch); a dev DB that is ahead of the branch can fail `pnpm db:migrate` — report it, never `docker compose down -v` (`server/INSIGHTS.md:476-490`).
- Tests (test-writer): none (covered by the repository test of step 6)
- Existing tests to update: none
- Done when: one new file `server/src/db/migrations/0022_*.sql` exists that only creates `onboarding_generations` and its FK; `pnpm typecheck` passes in `server/`.

### Step 4 — Module core: constants, domain, ports, pure tour and source helpers (server)
- Files: create `server/src/modules/onboarding/constants.ts` · create `server/src/modules/onboarding/domain.ts` · create `server/src/modules/onboarding/ports.ts` · create `server/src/modules/onboarding/sources.ts` · create `server/src/modules/onboarding/tour.ts`
- Change:
  - `constants.ts`: `GENERATION_TIMEOUT_MS = 180_000`, `PROMPT_TOKEN_BUDGET = 30_000`, `MAX_FILE_CHARS`, candidate counts, the run-file name patterns (README*, package/pyproject/pubspec/Cargo/go.mod/Makefile-style manifests, compose files, example env files), `EXAMPLE_ENV_SUFFIXES = ['.example', '.sample', '.template']`, and the user-facing messages: `'Generation timed out'`, the restart message, the generic model-failure message, the missing-key message template.
  - `domain.ts`: zod `TourDraft` — the model's output — as ONE flat object keyed by the five kinds (`architecture_overview: {body, diagram: string|null}`, `critical_paths: {files}`, …), all keys required, `nullable` not `optional`, no `.max()` on arrays or body (the server trims, the model must not fail validation for length).
  - `ports.ts`: `TourStore` (`getTour`, `getGeneration`, `claim(repoId, now) → startedAt | null`, `complete(repoId, startedAt, tour) → boolean`, `fail(repoId, startedAt, message)`, `reapRunning(message) → number`), `TourRepo` + `RepoLookup` (`id, owner, name, fullName, clonePath`, as `conventions/ports.ts:68-78`), `OnboardingDeps` (`store`, `repos`, `git: GitClient`, `intel: { topFiles(repoId, n), criticalPaths(repoId), repoMap(repoId), indexState(repoId) → { filesIndexed, lastIndexedSha } }`, `resolveModel`, `llm`, `systemPrompt`, `tokenizer: { count(text): number }`, `logger?`, `now?`).
  - `sources.ts` (pure): `isEnvFile`/`isExampleEnvFile` — a path whose base name starts with `.env` is readable only when it ends with one of `EXAMPLE_ENV_SUFFIXES`; `pickRunFiles(tracked)`; `pickCandidates({ topFiles, chains, tracked })` — ranked files and chains filtered to tracked paths, falling back to tracked source files + manifests + README when there are no ranked files.
  - `tour.ts` (pure): `buildTour(draft, { tracked: Set<string>, meta })` → `{ tour, dropped }`: drop `critical_paths`/`guided_reading` items and `how_to_run` steps whose `path`/`source` is not in `tracked` (exact match after trimming a leading `./`), count them, THEN keep the first N per `TOUR_LIMITS`; keep the first 3 tasks; never check `first_tasks.scope`; cut `body` to 1,200 chars ending with `…`; empty `diagram` string → `null`; assemble the five sections in `TOUR_SECTION_KINDS` order and parse with the `Tour` contract.
- Covers: AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-28, AC-29, AC-30, AC-31, AC-33, AC-62, EC-3, EC-4, EC-5, EC-6, EC-9, EC-16, EC-20
- Rules / skills: server-app (onion-architecture), zod, security
- Practices: `ports.ts`/`domain.ts` import only `zod` and `@devdigest/shared` types (onion "The one rule"); no Drizzle, Fastify, SDK or `adapters/*` import in any of these files; model output never chooses a path the server reads — it is only compared with `git.listFiles` output (security rule 7; `listFiles` already skips symlinks, `server/src/adapters/git/simple-git.ts:200-211`); the env-file rule is an allowlist by suffix, not a denylist of names.
- Tests (test-writer): `server/src/modules/onboarding/tour.test.ts` — AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-28, AC-29, AC-30, AC-62, EC-3, EC-4, EC-5, EC-6, EC-20 · `server/src/modules/onboarding/sources.test.ts` — AC-31, AC-33, EC-9, EC-16
- Existing tests to update: none
- Done when: `pnpm typecheck && pnpm lint && pnpm arch` pass in `server/`.

### Step 5 — Prompt: system template and user prompt builder (server)
- Files: modify `server/src/prompts/onboarding.system.md` · create `server/src/modules/onboarding/prompt.ts`
- Change: rewrite the template for the five sections and their fields (one `flowchart` diagram only in `architecture_overview`, else `null`; cite only paths present in the input; `how_to_run.source` is the file the command came from; at most 8/8/8/3 items; English). Keep the SECURITY paragraph (`onboarding.system.md:11-13`) and the mermaid rules (`:29-36`); drop `{{sections}}`/`{{language}}` and the `links`/`routes_and_apis` text. `prompt.ts` exports a pure `buildTourPrompt(input, countTokens)`: every piece of repository text — repo map, candidate paths, dependency chains, tracked-file summary, stack, each file's content — goes inside `wrapUntrusted(label, text)` from `@devdigest/reviewer-core`; file labels are fixed strings plus an index, the path travels inside the block. Fit `PROMPT_TOKEN_BUDGET`: README first, then manifests/compose/example env, then the repo map and candidates, then excerpts; clip or skip what does not fit.
- Covers: NFR-3, EC-15
- Rules / skills: server-app (onion-architecture), security
- Practices: untrusted text enters a prompt only through `wrapUntrusted`, which escapes the closing marker (`reviewer-core/src/prompt.ts:30-35`; security rule 6); no keyword filtering (`reviewer-core/AGENTS.md` Rules); do not copy the conventions prompt's unfenced tree/manifest/`path` attribute — a known gap (`.claude/skills/security/references/devdigest.md` G4); import `wrapUntrusted` as `modules/intent/prompt.ts:3` does.
- Tests (test-writer): `server/src/modules/onboarding/prompt.test.ts` — NFR-3 (a README containing `</untrusted>` stays inside one block), EC-15
- Existing tests to update: none
- Done when: `rg -n "routes_and_apis|\{\{" server/src/prompts/onboarding.system.md` prints nothing; `pnpm typecheck && pnpm arch` pass in `server/`.

### Step 6 — Repository and container wiring (server)
- Files: create `server/src/modules/onboarding/repository.ts` · modify `server/src/platform/container.ts`
- Change: `OnboardingRepository implements TourStore` over `onboarding` + `onboarding_generations`. `claim`: one statement `INSERT … ON CONFLICT (repo_id) DO UPDATE SET status='running', started_at=…, error=NULL WHERE onboarding_generations.status <> 'running' RETURNING started_at` (Drizzle `onConflictDoUpdate({ target, set, setWhere })`); no row back = already running. `complete`: in one `db.transaction` — update the generation row to `idle` where `repo_id`, `started_at` and `status='running'` match; if no row matched return `false` and write nothing; else upsert `onboarding` (`json`, `generated_at`). `fail`: same match, set `failed` + message; never touches `onboarding`. `reapRunning`: every `running` row → `failed` with the message. `getTour` parses `json` with `Tour.safeParse` and returns `null` when it does not parse. Container: lazy `onboardingRepo` getter and `get onboardingDeps(): OnboardingDeps` built like `conventionsDeps` (`container.ts:157-169`) — `resolveModel` via `resolveFeatureModel(this.settingsRepo, ws, 'onboarding')`, `systemPrompt: () => renderPrompt('onboarding.system.md', {})`, `intel` as four arrow functions over `this.repoIntel`, `tokenizer: this.tokenizer`.
- Covers: AC-14, AC-36, AC-46, EC-1
- Rules / skills: server-data (drizzle-orm-patterns), server-app (onion-architecture), security
- Practices: Drizzle rows and `$inferSelect` types stay in this file; methods return the port's types (onion Principle 1); only the query builder / `sql` template, no `sql.raw` (security rule 4); the repository does not know `workspaceId` — the service checks the repo's workspace before every call (security rule 5); every store gets a lazy container getter (`.claude/skills/onion-architecture/references/devdigest.md` §2).
- Tests (test-writer): `server/test/onboarding-repository.it.test.ts` — AC-9, AC-14, AC-36, AC-46, EC-1, EC-18 (a second `claim` returns null; `fail` leaves the tour; deleting the repo removes both rows)
- Existing tests to update: none
- Done when: `pnpm typecheck && pnpm lint && pnpm arch` pass in `server/` (`no dependency violations found`).

### Step 7 — Service: read, start, background run (server)
- Files: create `server/src/modules/onboarding/service.ts`
- Change: `OnboardingService(deps: OnboardingDeps)`.
  - `read(workspaceId, repoId)` → `TourRead`: 404 `NotFoundError` when the repo is not in the workspace; no generation row → `{ status: 'idle', started_at: null }`.
  - `start(workspaceId, repoId)` → `TourGenerationStarted`: repo check; `clonePath` null → `AppError('repo_not_cloned', …, 409)`; `store.claim` null → `AppError('generation_in_progress', …, 409)`; then start `run(...)` WITHOUT awaiting it, with a `.catch` that only logs, and return `running`.
  - `run`: race the work against `GENERATION_TIMEOUT_MS` with a module-local deadline helper. Work: `git.currentHead` + `git.listFiles`; `intel.*` reads each wrapped in `.catch(() => empty)`; read files chosen by `sources.ts` with `git.readFile`, skipping empty, NUL-containing or oversized text (as `conventions/service.ts:282-300`); `resolveModel` → `llm(provider)` → `completeStructured({ schema: TourDraft, schemaName: 'OnboardingTourDraft', maxRetries: 0, transportRetries: 0, timeoutMs: GENERATION_TIMEOUT_MS, temperature, maxTokens })` exactly once; `buildTour`; `store.complete`. `limited_index = topFiles.length === 0`; `files_indexed` from `indexState`; provider/model from the resolved choice; tokens and `costUsd` from the result.
  - Failure mapping (the only texts that reach `store.fail`): deadline → `'Generation timed out'`; `AppError` with code `config_error` from `deps.llm` → the missing-key message with the provider's display name (`openrouter` → `OpenRouter`, …); anything else → the generic model-failure message. Never store or log `err.message`, the raw output or repository text.
  - Log one line per outcome: `{ repoId, outcome, tokensIn, tokensOut, costUsd, droppedItems }`.
  - `reapInterrupted()` → `store.reapRunning(restart message)`.
- Covers: AC-8, AC-17, AC-19, AC-20, AC-32, AC-34, AC-35, AC-39, AC-45, AC-72, EC-8, EC-10, EC-11, EC-12, EC-23, NFR-2, NFR-6, NFR-7, NFR-9, NFR-10
- Rules / skills: server-app (onion-architecture), security
- Practices: imports only ports, `@devdigest/shared`, the module's pure files and `platform/errors.js` (onion ring table); a `ConfigError` message names the env var (`platform/container.ts:378-395`) — do not forward it; a provider's schema failure is a plain `Error` (`reviewer-core/src/llm/openrouter.ts:139`), so do not branch on its text; `store.complete` returning `false` (repo removed, or the run was already timed out) means "store nothing" and is logged, not an error; a fire-and-forget promise needs its own `.catch` (`server/INSIGHTS.md:494`); file reads go only through `git.readFile`, which re-checks the real path (`simple-git.ts:190-198`); no GitHub client in deps; a command from the model is only stored as text.
- Tests (test-writer): `server/src/modules/onboarding/service.test.ts` with in-memory fakes — AC-8, AC-16, AC-17, AC-19, AC-20, AC-32, AC-34, AC-35, AC-39, AC-45, EC-8, EC-10, EC-11, EC-12, EC-23, EC-24, NFR-1, NFR-2, NFR-9, NFR-10
- Existing tests to update: none
- Done when: `pnpm typecheck && pnpm lint && pnpm arch` pass in `server/`; `rg -n "from '\.\./\.\./(adapters|db)|container" server/src/modules/onboarding/service.ts` prints nothing.

### Step 8 — Routes, registration, boot reaper (server)
- Files: create `server/src/modules/onboarding/routes.ts` · modify `server/src/modules/index.ts` · modify `server/src/app.ts`
- Change: plugin builds `new OnboardingService({ ...app.container.onboardingDeps, logger: app.log })`. `GET /repos/:id/onboarding` → `200: TourRead`. `POST /repos/:id/onboarding/generate` (no body) → `reply.status(202)`, `202: TourGenerationStarted`, with `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }`. Register as `onboarding` in `modules/index.ts:29-43`. In `app.ts`, right after the `reapStaleRuns` block (`:70-86`) and before any plugin registration, `await` `reapInterrupted()` in the same try/catch-and-warn shape.
- Covers: AC-12, AC-15, EC-2, EC-19, NFR-8
- Rules / skills: server-app (fastify-best-practices, onion-architecture), security
- Practices: handler = schema → `getContext(app.container, req)` → one service call → status (`conventions/routes.ts:33-49`); `IdParams` from `_shared/schemas.js`; zod on params and response, never `parse` in a handler (`server/AGENTS.md` Conventions); per-route limit copies `intent/routes.ts:29`; the global limiter is not registered under `NODE_ENV=test` (`app.ts:93-97`), so the limit is not visible through `inject()`; the reaper must be awaited before the server listens, or it could reap a fresh run (`app.ts:73-79`).
- Tests (test-writer): `server/test/onboarding.it.test.ts` — AC-8, AC-12, AC-14, AC-15, EC-2, EC-19, NFR-8 (mock every provider the test can reach, `server/INSIGHTS.md:30-36`)
- Existing tests to update: none
- Done when: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm arch` pass in `server/`; with the API running, `curl -s localhost:3001/repos/<a repo id>/onboarding` returns `{"tour":null,"generation":{"status":"idle",…}}`.

### Step 9 — Client entry, data hooks, strings (client)
- Files: modify `client/src/vendor/ui/nav.ts` · modify `client/src/lib/query-keys.ts` · create `client/src/lib/hooks/onboarding-tour.ts` · modify `client/src/lib/hooks/index.ts` · modify `client/messages/en/onboarding.json` · modify `client/messages/en/meta.json`
- Change: NAV item `{ key: "onboarding-tour", label: "Onboarding Tour", icon: "Boxes", href: "/repos/:repoId/onboarding" }` between `pulls` and `context` (`nav.ts:25-26`); the route itself arrives in step 11. Key `keys.onboardingTour(repoId)`. `useOnboardingTour(repoId)`: `GET /repos/${repoId}/onboarding`, `refetchInterval` as a function — 1500 ms while `data.generation.status === 'running'`, else `false` (pattern: `lib/hooks/reviews.ts:34`). `useGenerateOnboardingTour(repoId)`: `POST …/generate`, `meta: { silent: true }`, on success write `generation` into the cached `TourRead` and invalidate the key; on an `ApiError` with code `generation_in_progress` also invalidate (the page then shows the running one). Rewrite `onboarding.json` with every fixed string of the spec, nested by UI area (page, empty, generating, error, header, copy, nav, sections, run, tasks, footer); add `onboardingTour` to `meta.json`.
- Covers: AC-1, AC-12, AC-13, NFR-12
- Rules / skills: client-src (frontend-architecture, react-best-practices), client-app-router (next-best-practices), client-i18n
- Practices: components never call `fetch`; hooks live in `src/lib/hooks`, keys in `query-keys.ts` (`client/AGENTS.md`); import contract types with `import type` from `@devdigest/shared` (`client/INSIGHTS.md:12-48`); server state stays in the query cache, never copied to `useState`; the wizard at `/onboarding` uses the `addRepo` namespace, so the `onboarding` namespace is free for the tour; `activeKeyFor` already maps `/onboarding` paths to `onboarding-tour` (`components/app-shell/helpers.ts:31`) and `shell.json` already has the label; a failed mutation toasts globally unless `meta.silent` (`client/INSIGHTS.md:98`).
- Tests (test-writer): `client/src/lib/hooks/onboarding-tour.test.tsx` — AC-12, AC-13 · `client/src/components/app-shell/nav.test.ts` addition — AC-1
- Existing tests to update: none (`nav.test.ts` asserts only SKILLS LAB and g-keys)
- Done when: `pnpm typecheck && pnpm lint && pnpm test` pass in `client/`; the sidebar shows "Onboarding Tour" between "Pull Requests" and "Project Context".

### Step 10 — "On this page" navigation, the five cards, pure helpers (client)
- Files: create `client/src/app/repos/[repoId]/onboarding/_components/TourView/constants.ts` · create `client/src/app/repos/[repoId]/onboarding/_components/TourView/helpers.ts` · create `client/src/app/repos/[repoId]/onboarding/_components/TourView/styles.ts` · create `client/src/app/repos/[repoId]/onboarding/_components/TourView/hooks/useActiveSection.ts` · create `client/src/app/repos/[repoId]/onboarding/_components/TourView/_components/TourNav/TourNav.tsx` · create `client/src/app/repos/[repoId]/onboarding/_components/TourView/_components/TourNav/index.ts` · create `client/src/app/repos/[repoId]/onboarding/_components/TourView/_components/TourCard/TourCard.tsx` · create `client/src/app/repos/[repoId]/onboarding/_components/TourView/_components/TourCard/index.ts` · create `client/src/app/repos/[repoId]/onboarding/_components/TourView/_components/TourSections/TourSections.tsx` · create `client/src/app/repos/[repoId]/onboarding/_components/TourView/_components/TourSections/index.ts`
- Change: this step builds the parts; step 11 composes them (the open/collapsed set comes in as props). `constants.ts`: section order, icon and message key per kind. `helpers.ts` (pure): `tourToMarkdown(tour, repoName, labels)` — title, then the five sections in order, each under its own heading with every item; `isSectionEmpty(section)`. `TourNav`: "On this page", one `<button>` per kind in order with the five titles, `aria-current` on the active one; activating it asks the parent to open the card if collapsed, scrolls the card to the top of the scroll container and sets the hash with `history.replaceState`. `useActiveSection(kinds)`: finds the nearest scrollable ancestor, listens to `scroll` (passive, cleaned up), returns the kind at the top; on mount, a hash equal to one of the five kinds scrolls to it, any other hash is ignored. `TourCard`: `id={kind}`, `scrollMarginTop`, a header `<button aria-expanded>` with icon + title + chevron, body shown when open, "Nothing found for this section" when `isSectionEmpty`. `TourSections.tsx` exports the five bodies as components: overview — kit `Markdown` for `body`, `MermaidDiagram` below it when `diagram` is set; critical paths — row with path (mono, plain text), note, "Open" link; how to run — numbered rows from 1, command in mono, copy button with "Copied" on that step, the `source` file under the command, the warning line when there is at least one step; guided reading — numbered rows, path as a link, reason below; first tasks — one tile per task with title, scope in mono as plain text, badge "Low/Medium/High complexity". Links: `githubBlobUrl(repo.full_name, tour.commit_sha, path)`, `target="_blank" rel="noopener noreferrer"`.
- Covers: AC-50, AC-53, AC-54, AC-55, AC-56, AC-57, AC-58, AC-59, AC-60, AC-61, AC-63, AC-65, AC-66, AC-67, AC-68, AC-69, AC-70, AC-71, AC-73, AC-74, AC-75, AC-76, EC-14, EC-21, NFR-4, NFR-11
- Rules / skills: client-src (frontend-architecture, react-best-practices), security
- Practices: clickable headers and rows are real `<button>`/`<a>`, never a bare `<div onClick>` (`client/AGENTS.md`; `client/INSIGHTS.md:104,137`); an icon-only copy button needs an `aria-label`; the scroll listener is the one legitimate effect here, everything else is derived; PascalCase components, no `renderX()` factories; model text is rendered only through the kit `Markdown` or as text nodes, no `dangerouslySetInnerHTML` (security rule 7); links are built from the stored repo name, the stored commit and a checked path via `src/lib/github-urls.ts:24-37`, which encodes each segment; split a file that passes ~200 lines into nested `_components/`; styles as `CSSProperties` in `styles.ts` with the design CSS variables; design source: `client/docs/design/src/screen_tour_context.jsx:32-125` (icons `Boxes`, `Activity`, `Command`, `ListChecks`, `Target`, all in the kit).
- Tests (test-writer): `client/src/app/repos/[repoId]/onboarding/_components/TourView/_components/TourSections/TourSections.test.tsx` — AC-60, AC-61, AC-63, AC-65, AC-66, AC-67, AC-68, AC-69, AC-70, AC-71, AC-73, AC-74, AC-75, AC-76, EC-14 · `client/src/app/repos/[repoId]/onboarding/_components/TourView/helpers.test.ts` — AC-50
- Existing tests to update: none
- Done when: `pnpm typecheck && pnpm lint && pnpm test` pass in `client/` (the parts are not mounted until step 11); `rg -n "dangerouslySetInnerHTML" "client/src/app/repos/[repoId]/onboarding"` prints nothing.

### Step 11 — Route, page states, header, copy as markdown, cost line (client)
- Files: create `client/src/app/repos/[repoId]/onboarding/page.tsx` · create `client/src/app/repos/[repoId]/onboarding/layout.tsx` · create `client/src/app/repos/[repoId]/onboarding/_components/TourView/TourView.tsx` · create `client/src/app/repos/[repoId]/onboarding/_components/TourView/index.ts` · create `client/src/app/repos/[repoId]/onboarding/_components/TourView/_components/TourHeader/TourHeader.tsx` · create `client/src/app/repos/[repoId]/onboarding/_components/TourView/_components/TourHeader/index.ts` · create `client/src/app/repos/[repoId]/onboarding/_components/TourView/_components/TourFooter/TourFooter.tsx` · create `client/src/app/repos/[repoId]/onboarding/_components/TourView/_components/TourFooter/index.ts`
- Change: `page.tsx`/`layout.tsx` copy `context/page.tsx` and `context/layout.tsx` (`meta.onboardingTour`). `TourView` sets the crumb `[repo full name (mono), "Onboarding Tour"]` via `usePageCrumb`, returns `RepoNotFound` as `ProjectContextView.tsx:20-33` does, owns `collapsed: Set<TourSectionKind>` (all open on mount, nothing persisted; an "On this page" activation removes the kind from the set before scrolling) and composes `TourNav`, `TourCard` and the section bodies from step 10. It branches with early returns, in this order: not cloned (`activeRepo.clone_path === null` → kit `EmptyState`, no button) → `isPending` skeleton (`role="status"`) → `isError` kit `ErrorState` titled "Couldn't load the onboarding tour" with retry → no tour + running → "Generating onboarding tour…" → no tour → `EmptyState` (title, body, button exactly as AC-6; no token or duration text; the generation `error` above the button when `status === 'failed'`) → tour. With a tour: error banner with the message and "Retry" above it when `failed`; `TourHeader`: "Onboarding for" + repo name (mono), subtitle with `files_indexed` and relative time, stale badge when `useRepoIntelStatus(repoId).data?.lastIndexedSha` is a non-empty string different from `tour.commit_sha`, the "Limited index — file suggestions are less precise" note when `limited_index`, "Regenerate" (disabled and labelled "Regenerating…" while running; no confirm dialog), "Copy as Markdown" (uses `tourToMarkdown` from step 10's `helpers.ts`). Copy: `await navigator.clipboard.writeText(...)` in try/catch → "Copied" or an error message. `TourFooter`: one line with model, input tokens, output tokens, cost (`—` when `cost_usd` is null).
- Covers: AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-10, AC-11, AC-37, AC-38, AC-40, AC-41, AC-42, AC-43, AC-44, AC-47, AC-48, AC-49, AC-50, AC-51, AC-52, AC-77, EC-13, EC-17, EC-22
- Rules / skills: client-src (frontend-architecture, react-best-practices), client-app-router, security
- Practices: branch on `isPending`, not `isLoading`, for "no data yet" (`client/INSIGHTS.md:480`); derive every state from query data during render — no `useState`/`useEffect` mirror of the tour or the status; `''` means "no indexed commit" (`server/src/modules/repo-intel/service.ts:214-229`); the existing clipboard calls (`RunTraceDrawer.tsx:56`) swallow failures — do not copy them; reuse `src/lib/format-cost.ts` and `src/lib/model-label.ts`; relative time via next-intl `useFormatter().relativeTime` (not used in the repo yet; if it does not fit, write a helper in this folder — never import `pulls/helpers.ts` from another route); design source: `client/docs/design/src/screen_tour_context.jsx:106-124` ("Share link" becomes "Copy as Markdown", the "Takes 30–60s and ~5,000 tokens" sentence is dropped); styles as `CSSProperties` in `styles.ts` with the design CSS variables; confirmations in an `aria-live="polite"` region.
- Tests (test-writer): `client/src/app/repos/[repoId]/onboarding/_components/TourView/TourView.test.tsx` — AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-10, AC-11, AC-37, AC-38, AC-40, AC-41, AC-42, AC-43, AC-44, AC-47, AC-48, AC-49, AC-51, AC-52, AC-53, AC-54, AC-55, AC-56, AC-57, AC-58, AC-59, AC-77, EC-13, EC-17, EC-21, EC-22, NFR-11
- Existing tests to update: none
- Done when: `pnpm typecheck && pnpm lint && pnpm test` pass in `client/`; `/repos/<id>/onboarding` renders inside the shell with the sidebar item active; `rg -n "\"[A-Z][a-z]+ [a-z]" "client/src/app/repos/[repoId]/onboarding" --glob '*.tsx'` shows no hardcoded UI sentence.

### Step 12 — Mermaid follows the colour theme (client)
- Files: modify `client/src/components/mermaid-diagram/MermaidDiagram.tsx`
- Change: read `useTheme()` from `@/lib/theme`; pass `theme: theme === "light" ? "default" : "dark"` to `mermaid.initialize` (`:37`) and add `theme` to the effect dependencies so the diagram re-renders on a theme switch. Keep `securityLevel: "strict"`, the parse-before-render check and "render nothing when invalid" unchanged.
- Covers: AC-64, EC-7, NFR-5, NFR-12
- Rules / skills: client-src (react-best-practices), security
- Practices: mermaid stays `securityLevel: "strict"` (security rule 8); invalid text renders no area and no error (`MermaidDiagram.tsx:38-59`) — the overview section must not add its own wrapper box around it.
- Tests (test-writer): none (mermaid does not render in jsdom; AC-64 is proven by the overview test rendering no diagram area for junk text)
- Existing tests to update: none
- Done when: `pnpm typecheck && pnpm lint && pnpm test` pass in `client/`; a diagram is readable in both themes.

### Step 13 — Env-selected stub LLM provider (server)
- Files: create `server/src/adapters/llm/stub.ts` · modify `server/src/platform/config.ts` · modify `server/src/platform/container.ts` · modify `server/.env.example`
- Change: `StubLLMProvider implements LLMProvider`, built by `StubLLMProvider.fromFile(path, id)`: reads the JSON file once, validates it as a record of `schemaName → fixture`; `completeStructured` parses the fixture for `req.schemaName` with `req.schema` and returns it with fixed token counts and a fixed `costUsd`, or throws when there is no fixture or it does not match; `listModels` returns `[]`; `complete`/`embed` throw. Config: optional `DEVDIGEST_LLM_STUB` → `AppConfig.llmStubPath: string | null` (resolved to an absolute path); `loadConfig` throws when it is set with `NODE_ENV=production`. `Container.llm(id)` (`container.ts:363-372`): after the `overrides` check, return the stub when `config.llmStubPath` is set — before any secret lookup. Document the variable in `.env.example` as test-only.
- Covers: NFR-13
- Rules / skills: server-app (onion-architecture), security
- Practices: the adapter is the only place that reads the file; the path comes from `AppConfig`, never from a request; never trust `JSON.parse` output — parse it with zod; this is not a secret, so `AppConfig` is the right home (`platform/config.ts:8-13`); `llmWithKey` (test-connection) keeps using real providers.
- Tests (test-writer): `server/src/adapters/llm/stub.test.ts` — NFR-13 (fixture returned for its schema; unknown schema throws)
- Existing tests to update: any test that builds an `AppConfig` literal by hand gains `llmStubPath: null` — find them with `rg -n "repoIntelEnabled" server/test server/src --glob '*.test.ts'`.
- Done when: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm arch` pass in `server/`.

### Step 14 — Fixture repository, seed step, hermetic stack and CI wiring (e2e, server seed, scripts, CI)
- Files: create `e2e/fixtures/tour-repo/README.md` · create `e2e/fixtures/tour-repo/Makefile` · create `e2e/fixtures/tour-repo/docker-compose.yml` · create `e2e/fixtures/tour-repo/.env.example` · create `e2e/fixtures/tour-repo/requirements.txt` · create `e2e/fixtures/tour-repo/app/main.py` · create `e2e/fixtures/tour-repo/app/routes.py` · create `e2e/fixtures/llm-stub.json` · create `scripts/e2e-tour-fixture.sh` · modify `server/src/db/seed.ts` · modify `scripts/e2e.sh` · modify `.github/workflows/e2e-web.yml`
- Change: a tiny non-TypeScript fixture tree (kept out of the e2e package's `tsc`/eslint globs). `llm-stub.json`: `{ "OnboardingTourDraft": { … } }` — a valid draft that cites only fixture paths, with a one-line-label `flowchart LR` diagram, 2+ items per list and 3 tasks. `scripts/e2e-tour-fixture.sh <clone-dir>`: copies the tree to `<clone-dir>/devdigest-fixtures/tour-sample`, then `git init`, add, commit with a fixed author and date; prints the checkout path; idempotent. `seed.ts`: `SeedOptions.e2eFixturePath?: string`; when set, after the demo block insert (if absent) the repo `devdigest-fixtures/tour-sample` with id `00000000-0000-4000-8000-0000000000e2`, `defaultBranch: 'main'`, `clonePath` = that path; the CLI reads `SEED_E2E_FIXTURE_PATH`. `e2e.sh`: export a temp `DEVDIGEST_CLONE_DIR` (removed in `cleanup`), run the fixture script before the seed, export `SEED_E2E_FIXTURE_PATH` and `DEVDIGEST_LLM_STUB="$ROOT/e2e/fixtures/llm-stub.json"`; keep `SEED_DEMO=true`. Workflow: the same three variables in `env:` (under `${{ runner.temp }}` / `${{ github.workspace }}`) and one step running the fixture script before "Install + migrate + seed".
- Covers: NFR-13
- Rules / skills: security (scripts, CI), server-data
- Practices: the checkout must sit at `<cloneDir>/<owner>/<name>` — `GitClient` derives the path from owner and name, not from `clone_path` (`server/src/adapters/git/simple-git.ts:49-51`); seed the fixture AFTER the demo repo so the demo stays the first repo that flows 02/04/05 open (`e2e/INSIGHTS.md:68-72`, `client/src/app/page.tsx:21`); bash: `set -euo pipefail`, every expansion quoted, no network, `git -c user.name=… -c user.email=…`; workflow keeps `permissions: contents: read`, adds no action and no secret (security rule 12); never name or reuse `acme/payments-api` for the fixture.
- Tests (test-writer): none
- Existing tests to update: none
- Done when: `bash scripts/e2e-tour-fixture.sh "$(mktemp -d)"` exits 0 and `git -C <printed path> ls-files` lists the seven fixture files; `pnpm typecheck` passes in `server/`; `./scripts/e2e.sh` still passes flows 01–11.

### Step 15 — The tour flow and the e2e rule note (e2e)
- Files: create `e2e/specs/12-onboarding-tour.flow.json` · modify `e2e/AGENTS.md` · modify `e2e/README.md`
- Change: one flow: open `{BASE}/repos/00000000-0000-4000-8000-0000000000e2/onboarding` → wait for the empty-state body text → click the button "Generate onboarding tour" → wait for "Onboarding for" → wait for each of the five card titles and at least one item text of each section taken from `llm-stub.json` → click "Regenerate" → wait for "Regenerate" and "Onboarding for" again. `e2e/AGENTS.md` Rules: state that flow 12 is the single exception to "never trigger a model call or mutate data" (stub provider, fixture repository). `e2e/README.md`: add the flow to the coverage table and the three env variables.
- Covers: NFR-13
- Rules / skills: none (JSON + docs)
- Practices: locators only `wait --url|--text` and `find role|text|label`; `find role button --name …` with no action clicks (`e2e/INSIGHTS.md:49-56`); `wait --text` matches rendered text, so an upper-cased label ("ON THIS PAGE") must be written as rendered (`e2e/INSIGHTS.md:58`); avoid 2-character targets (`e2e/INSIGHTS.md:90`); the file is numbered 12 so it runs last and no later flow sees a browser that last visited the fixture; `e2e/AGENTS.md` stays ≤ 100 lines.
- Tests (test-writer): the flow itself — NFR-13
- Existing tests to update: none
- Done when: `./scripts/e2e.sh` reports `12/12 flows passed`; `npm run typecheck && npm run lint` pass in `e2e/`.

## Contracts & migrations
- Shared contracts sync: yes — `contracts/onboarding-tour.ts` (new), `contracts/knowledge.ts`, `index.ts`, `adapters.ts`
- Schema change + `pnpm db:generate`: yes — new table `onboarding_generations` (`onboarding` unchanged)
- Spec `Status` update: yes — `specs/11-onboarding-tour.md`, per the vocabulary in `specs/README.md`

## Verification
| Package | Checks (from routing.json) |
|---|---|
| server | `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm arch` |
| client | `pnpm typecheck` · `pnpm lint` · `pnpm test` |
| reviewer-core | `npm run typecheck` · `npm run lint` · `npm test` |
| e2e | `npm run typecheck` · `npm run lint` |
Plus extra checks: `./scripts/shared-contracts.sh check`; `./scripts/e2e.sh` (G4 only; needs Docker and the `agent-browser` CLI). Needs Postgres: yes (migration, `./scripts/e2e.sh`).
All of the above in one command: `./scripts/check-changed.sh` (a group that is not the last runs `--quick`).

## Insights to record
- `server/INSIGHTS.md` · Tool & Library Notes — `StructuredRequest.maxRetries` only limits re-prompts; HTTP retries are separate (OpenAI SDK client `maxRetries: 2`, `withRetry` 3) and OpenRouter ignored `req.timeoutMs`; a caller that needs exactly one request sets `transportRetries: 0` too (Where: `reviewer-core/src/llm/openrouter.ts:79`, `server/src/adapters/llm/openai.ts:97`)
- `server/INSIGHTS.md` · Codebase Patterns — background generation with persisted state: atomic claim by upsert + `setWhere`, completion guarded by `started_at`, boot reaper next to `reapStaleRuns` (Where: `server/src/modules/onboarding/repository.ts`, `server/src/app.ts:81`)
- `e2e/INSIGHTS.md` · Codebase Patterns — a fixture checkout must live at `<DEVDIGEST_CLONE_DIR>/<owner>/<name>`; `repos.clone_path` alone is not used for git reads (Where: `../server/src/adapters/git/simple-git.ts:49`)
- `e2e/INSIGHTS.md` · What Works — supersedes "SPEC-10 NFR-11 … is deferred" in part: the stub provider (`DEVDIGEST_LLM_STUB`) and a seeded fixture checkout now exist (Where: `../scripts/e2e.sh`, `fixtures/llm-stub.json`)

<!-- implementer-brief:end -->

## Context read
- `AGENTS.md` (root) — naming, contract sync, migrations only via `pnpm db:generate`, `.it.test.ts`, do-not-touch list, `AGENTS.md` ≤ 100 lines
- `server/AGENTS.md` — module shape, zod route schemas, `AppError`, secrets only via `SecretsProvider`, single API instance
- `client/AGENTS.md` — thin pages, hooks in `src/lib/hooks`, i18n files, real buttons, never edit `vendor/shared`
- `reviewer-core/AGENTS.md` — purity, `wrapUntrusted`/`INJECTION_GUARD`, npm, server typecheck after a change
- `e2e/AGENTS.md:24-28` — deterministic locators; the read-only / no-model rule that NFR-13 relaxes for one flow
- `specs/11-onboarding-tour.md` — approved, amended 2026-10-05 (commit e080440): AC-16, AC-19, AC-42, AC-77, EC-8, EC-13, EC-23, EC-24, NFR-1, NFR-13; OQ defaults used as written
- `docs/plans/07-onboarding-tour.brainstorm.md` — option 3; its "For the planner" list, re-verified below
- `server/INSIGHTS.md:58-63` — reviews run fire-and-forget, `reapStaleRuns` on boot, single instance
- `server/INSIGHTS.md:476-490, 522-527` — dev DB ahead of migrations
- `server/INSIGHTS.md:494` — unhandled rejection of a fire-and-forget promise
- `server/INSIGHTS.md:529-536` — structured output fails schema validation about half the time on the default model; `maxRetries` unverified
- `server/INSIGHTS.md:30-36` — un-mocked providers hit the real network in integration tests
- `server/INSIGHTS.md:146-152` — deps objects built by container getters
- `client/INSIGHTS.md:12-48` — runtime imports from `@devdigest/shared` and the `.js` suffix
- `client/INSIGHTS.md:62-66` — kit `Markdown` renders remote images
- `client/INSIGHTS.md:98, 104, 116-121, 137, 480` — silent mutations, jsx-a11y, shell in the root layout, clickable rows, `isPending`
- `e2e/INSIGHTS.md:49-58, 68-72, 90, 99-102` — click default, text matching, first-repo assumption, the deferred stub/fixture
- `.claude/skills/pr-self-review/assets/routing.json` — rules and checks used in the tables above
- `.claude/skills/security/references/devdigest.md` — existing guards (rate limit 10/min precedent, `wrapUntrusted`, `insideDir`), known gaps G4/G7
- `.claude/skills/onion-architecture/references/devdigest.md` — container getters, lazy factory ports, worked examples
- `.claude/skills/frontend-architecture/references/devdigest.md` — locations for hooks, helpers, components
- `server/src/db/schema/context.ts:120-126`, `server/src/db/schema.ts:36,50` — existing `onboarding` table and the schema barrel
- `server/src/vendor/shared/contracts/knowledge.ts:28-47`, `server/test/contracts.test.ts:12,134-138` — old contract and its only consumer
- `server/src/vendor/shared/adapters.ts:55-88, 228-254` — `StructuredRequest`, `LLMProvider`, `GitClient`
- `reviewer-core/src/llm/openrouter.ts:74-139`, `server/src/adapters/llm/openai.ts:88-125`, `server/src/adapters/llm/anthropic.ts:93-125`, `server/src/platform/resilience.ts:13-65` — retry layers
- `server/src/modules/conventions/{ports,service,routes,prompt}.ts` — deps shape, in-flight guard, file reading, unfenced prompt parts
- `server/src/modules/intent/routes.ts:29`, `server/src/modules/intent/prompt.ts:3,129` — per-route rate limit, `wrapUntrusted` use
- `server/src/platform/container.ts:157-169, 363-397`, `server/src/platform/config.ts`, `server/src/app.ts:70-97` — wiring, LLM resolution, reaper, limiter
- `server/src/modules/repo-intel/types.ts:42-50,130-171`, `service.ts:214-229,423-440,664-720` — index state (`lastIndexedSha: ''` when absent), repo map, ranked files, chains
- `server/src/adapters/git/simple-git.ts:49-51,151-153,190-211` — clone path, head, read, list
- `server/src/db/seed.ts:59-67,302-322,410-418`, `scripts/e2e.sh:35-45,69-84,121-137`, `.github/workflows/e2e-web.yml` — seed options, hermetic stack, CI steps
- `client/src/vendor/ui/nav.ts:21-37`, `components/app-shell/{helpers.ts:28-42,ShellFrame.tsx:12-22,nav.test.ts}`, `messages/en/{onboarding,shell,meta}.json` — nav, active key, strings
- `client/src/app/repos/[repoId]/context/{page,layout}.tsx`, `…/ProjectContextView.tsx:18-107` — page pattern
- `client/src/lib/hooks/{conventions,repo-intel}.ts`, `query-keys.ts:20,45`, `github-urls.ts`, `theme.tsx`, `api.ts:9-17` — hooks, keys, links, theme, `ApiError.code`
- `client/src/components/mermaid-diagram/MermaidDiagram.tsx`, `client/src/vendor/ui/primitives/Markdown.tsx` — renderers
- `client/docs/design/src/screen_tour_context.jsx:1-126`, `client/docs/design/src/chrome.jsx:6` — design source, nav icon

## Requirements trace
| R | Requirement (source `path:line` or "request") | Steps |
|---|---|---|
| AC-1 … AC-77, EC-1 … EC-24, NFR-1 … NFR-14 | `specs/11-onboarding-tour.md` | per the `Covers` lines of steps 1–15 (every id appears at least once) |
| OQ-1 | restart → `failed`, 180 s timeout (request; spec default) | 6, 7, 8 |
| OQ-2 … OQ-8 | spec defaults as written | 4 (OQ-3, OQ-4, OQ-5), 5 (OQ-2), 7 (OQ-8), 10 and 11 (OQ-6), 11 (OQ-7) |
| R1 | `maxRetries: 0`, no re-prompt (request; AC-16 as amended) | 2, 7 |
| R2 | env-selected stub provider + fixture repository; e2e rule relaxed for one flow (request; NFR-13) | 13, 14, 15 |
| R3 | fixture is never `acme/payments-api` (request) | 14 (`devdigest-fixtures/tour-sample`) |
| R4 | new tests off; the e2e flow stays (request) | 15; `Tests (test-writer)` lines are a record only |
| R5 | metadata location and table choice are the planner's (request) | 1, 3; Design notes |
Recommendations: None were made in the Requirements review.

## Affected modules
| Package | Path | Ring / layer | Change |
|---|---|---|---|
| server | `src/vendor/shared/contracts/onboarding-tour.ts`, `knowledge.ts`, `index.ts` | core — domain | new tour contracts, old scaffold removed |
| server | `src/vendor/shared/adapters.ts` | core — ports | `transportRetries` |
| server | `src/db/schema/context.ts`, `src/db/schema.ts`, migration | outer — db | new table |
| server | `src/modules/onboarding/{constants,domain,ports,sources,tour,prompt,service}.ts` | core + application | new |
| server | `src/modules/onboarding/{repository,routes}.ts` | outer — driven / driving adapters | new |
| server | `src/adapters/llm/{openai,anthropic,stub}.ts` | outer — driven adapters | retries option; stub provider |
| server | `src/platform/{container,config}.ts`, `src/app.ts`, `src/modules/index.ts` | composition root / outer | wiring, env, reaper, registration |
| server | `src/prompts/onboarding.system.md`, `src/db/seed.ts`, `.env.example` | outer | prompt rewrite, fixture seed, env doc |
| reviewer-core | `src/llm/openrouter.ts` | LLM adapter | per-request retries and timeout |
| client | `src/vendor/shared/**` | contracts copy | synced |
| client | `src/vendor/ui/nav.ts` | UI kit config | nav entry |
| client | `src/lib/{query-keys.ts,hooks/onboarding-tour.ts,hooks/index.ts}` | data layer | key + hooks |
| client | `src/app/repos/[repoId]/onboarding/**` | route + feature components | new page |
| client | `src/components/mermaid-diagram/MermaidDiagram.tsx` | shared chrome | theme |
| client | `messages/en/{onboarding,meta}.json` | i18n | strings |
| e2e | `fixtures/**`, `specs/12-onboarding-tour.flow.json`, `AGENTS.md`, `README.md` | flows | fixture, flow, rule note |
| repo | `scripts/e2e.sh`, `scripts/e2e-tour-fixture.sh`, `.github/workflows/e2e-web.yml` | tooling / CI | fixture + stub wiring |

## Constraints honored
| Rule | Source (`path:line`) | How the plan respects it |
|---|---|---|
| Onion layering, ports via constructor, thin routes | `server/AGENTS.md` Conventions; onion-architecture skill | steps 4–8: `ports.ts`/`domain.ts` core, service against `OnboardingDeps`, Drizzle only in `repository.ts`, wiring only in `container.ts`; `pnpm arch` in every "Done when" |
| Contracts edited in the server copy, then synced | `AGENTS.md` Cross-package rules | steps 1–2 edit `server/src/vendor/shared`, then `./scripts/shared-contracts.sh sync`; `check` in "Done when" |
| DB changes via schema + `pnpm db:generate` | `AGENTS.md` Do not touch | step 3; the migration is generated, not written |
| DB tests end in `.it.test.ts` | `AGENTS.md` Naming | recorded test files in steps 6 and 8 use the suffix |
| i18n strings in `client/messages/en/<camelCase>.json` | `AGENTS.md` Naming | step 9 rewrites `onboarding.json`; no hardcoded text (step 10 check) |
| Wire fields `snake_case` | `AGENTS.md` Naming | step 1 |
| Never touch `server/clones/`, lock files, `CLAUDE.md` links | `AGENTS.md` Do not touch | no step touches them; no dependency is added |
| Never seed or show `acme/payments-api` beyond what exists | request (standing user rule) | fixture is `devdigest-fixtures/tour-sample`; the flow opens only the fixture; demo seed left as is by the user's answer 3 |
| Secrets only via `SecretsProvider` | `server/AGENTS.md` Conventions | the stub path is config, not a secret; the missing-key message never includes a key or the env var name |
| CI read-only | security skill rule 12 | step 14 adds env and one `run` step only |

## Design notes
**Where the tour's metadata lives.** Inside the stored `onboarding.json`, as the full `Tour` contract. No query filters, sorts or joins on commit, tokens or cost; one zod schema then guards the wire, the stored value and the read (`getTour` treats a non-parsing row as "no tour", which also covers NFR-14's "no old-shape row").

**Why a new `onboarding_generations` table.** `onboarding.json` stays `NOT NULL`, so a row in `onboarding` is always a tour. A running or failed generation lives in another table, so AC-36 holds by construction, and the first generation of a repository (no tour row yet) has somewhere to be `running`. The claim is one upsert with `setWhere`, which is the single place for EC-1. Cost: the read does two lookups. Rejected: nullable `json` + status columns on `onboarding` — one table, but "a tour row that is not a tour" and a wider blast radius on a table that predates the feature.

**Late results.** The service ends a run at 180 s by a deadline race; the provider call may still return later. `complete`/`fail` match on `started_at` and `status='running'`, so a late result of a timed-out or reaped run, or of a repository that was removed (cascade deleted the row), writes nothing (AC-39, EC-18).

**One request.** `maxRetries: 0` stops the re-prompt loop (`openrouter.ts:92`), but two more retry layers sit below it: the OpenAI SDK client (`maxRetries: 2`, `openrouter.ts:79`; SDK default in `openai.ts:52`, `anthropic.ts:51`) and `withRetry` (3, `resilience.ts:47`). AC-16 says "exactly one request to the model provider", so step 2 adds an opt-in `transportRetries` and the tour sets it to 0. Other callers are unchanged.

**Failure messages.** Three fixed texts plus the restart text, chosen in the service. Provider error text is never stored: it can carry a raw provider response (NFR-9), and `NODE_ENV` defaults to `development`, where unmapped messages would reach the client.

**Stub selection.** One env variable holding a fixture file path, read in the composition root, refused in production. Rejected: a fourth value in the `Provider` enum — it would show in Settings and in the shared contract for a test-only need.

**Client state.** One query (`TourRead`) drives everything; polling is on only while `running`, which gives AC-13, AC-12 and EC-2 without SSE. The stale badge reads the existing index-state query; the server adds no `stale` field because the spec fixes the wire shape.

## Risks & open questions
- Step 2 reads AC-16 strictly: HTTP-level retries on 429/5xx/timeout count as extra requests, so the tour turns them off. The price is that a transient provider error fails the generation at once (the user retries). If you read AC-16 as "no re-prompt" only, drop `transportRetries` and keep `maxRetries: 0`; step 2 then shrinks to making OpenRouter honour `timeoutMs`.
- Per-request SDK options (`{ maxRetries, timeout }` as the second argument of `create`) were not checked against the installed `openai` and `@anthropic-ai/sdk` versions.
- The default model fails structured-output validation about half the time on the conventions schema (`server/INSIGHTS.md:529-536`). With no re-prompt, tour generations on `deepseek/deepseek-v4-flash` may fail often. The flat, small `TourDraft` reduces this; the rate is unknown until tried.
- `RepoRepository.list` has no `ORDER BY` (`server/src/modules/repos/repository.ts:53-56`), so "the demo repo stays first" rests on insertion order. If anything updates the demo row during the e2e run, flows 02/04/05 could open the fixture. Step 14's "Done when" (`./scripts/e2e.sh` passes 01–11) detects it; the fix would be an explicit order in `list`, which is a behaviour change outside SPEC-11.
- `.github/workflows/e2e-web.yml` must change, or CI fails on flow 12. The Emdash git token has no `workflow` scope, so the push of that file needs the `gh` credential helper.
- AC-15 says "more than 10 generation requests within one minute"; the route-level limiter counts per client IP, and it is not registered under `NODE_ENV=test`, so an `inject()` test cannot prove it.
- The kit `Markdown` renders `![](…)` as a real `<img>` (`client/INSIGHTS.md:62-66`). A tour overview steered by a hostile README could make the browser load a remote image. NFR-4 limits link schemes and forbids raw HTML, which holds; image loading is not addressed by the spec. Not fixed here, since the primitive is shared.
- AC-41's "generated T": next-intl `useFormatter().relativeTime` is not used anywhere in the client yet; step 10 names the fallback.
- The scroll container of the app shell was not read; `useActiveSection` finds the nearest scrollable ancestor as the design source does (`screen_tour_context.jsx:63-73`).
- `getRepoMap` returns text only for the default token budget cache hit (`repo-intel/service.ts:423-440`); how large that text is against the 30,000-token budget is unverified — the prompt builder clips it.
- The plan has 15 steps and about 60 files; G2 (5 steps) and G3 (4 steps, ~25 files) are at the upper end of one implementer run.
- `server/README.md`, `client/README.md` route maps and `docs/` are left to `doc-writer`.

## Handed off
- Architecture reviewer: `modules/onboarding/service.ts` imports (no `platform/resilience`, no adapters); the transaction living inside `OnboardingRepository.complete` (precedent: `ConventionStore.replacePending`); `transportRetries` on a core port; `Container.llm` returning the stub; `TourSections.tsx` holding five small components in one file; the `client/src/vendor/ui/nav.ts` edit in the vendored kit.
- Security reviewer: `modules/onboarding/prompt.ts` (every repo string inside `wrapUntrusted`, labels not built from paths); `sources.ts` env-file allowlist (AC-33); the path check in `tour.ts` and that no model value reaches `git.readFile`; failure-message mapping in the service (NFR-9) and the log line (NFR-10); the 10/min limit and the unauthenticated `POST …/generate` (known gap G1); `StubLLMProvider.fromFile` and the production guard; `scripts/e2e-tour-fixture.sh` quoting; the workflow change; remote images in the overview markdown; GitHub links built with `githubBlobUrl`.
