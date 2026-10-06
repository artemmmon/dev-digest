# Development Plan: PR Brief (Why + Risk brief on the Overview tab)
Status: implemented
Spec: specs/12-pr-brief.md
Brainstorm: docs/plans/08-pr-brief.brainstorm.md
Execution mode: multi-agent (chosen by the user)

## Goal
Implement SPEC-12: an on-demand PR Brief (summary, Risk areas, Review focus) built by a new server `brief` module from facts other modules already own, stored in `pr_brief`, shown on the Overview tab, with a jump to Files changed at a file and line.
In scope: shared contract, `_shared` helpers, `project-context` candidate documents, the `brief` module and its wiring, client hooks, Overview blocks, Files changed arrival, i18n.
Out of scope: new tests and the e2e flow (off for this run), an MCP tool, PR history, automatic generation, docs (doc-writer), any migration (`pr_brief` exists).

Precondition (user's homework rule): the main session commits `specs/12-pr-brief.md`, `specs/README.md`, the brainstorm brief and this plan before G1 writes any code.
Tests are off: no implementer creates a test file. Each `Tests (test-writer)` line is only the record for a later test-writer run; no "Done when" depends on it.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | 1–3 | server contracts + `_shared` + project-context (and the client contract copy) | — | New exports in `@devdigest/shared`: `PrBrief` (new shape), `PrBriefResponse`, `BriefMissing`, `ReviewFocusItem`, `Risk.kind: RiskAreaKind`. `_shared/hunks.ts`: `extractHunkHeaders`, `newSideRanges`. `_shared/issue-refs.ts`: `extractIssueRefs`. `ProjectContextService.candidateDocuments(workspaceId, repoId)`. `risk_brief` default is now `openrouter` / `deepseek/deepseek-v4-flash` |
| G2 | 4–8 | server `modules/brief` + container | G1 | Routes `GET` / `POST /pulls/:id/brief`; a missing key answers `config_error` with `details.provider` |
| G3 | 9–11 | client Overview | G1 (parallel with G2) | `useDiffJump()` pushes `?tab=diff&file=&line=`; `latestRoundSummary` in `src/lib/latest-round-findings.ts`; `stripImageEmbeds` in `src/lib/strip-image-embeds.ts` |
| G4 | 12 | client Files changed | G3 | — (last group: sets the spec to `implemented`) |

## Skills behind the steps
| Path glob (routing.json rule id) | Skills | Why they matter here |
|---|---|---|
| `server/src/{modules,platform}/**` (server-app) | onion-architecture, fastify-best-practices | new module, ports, container wiring, thin routes |
| `server/src/modules/**/repository.ts` (server-data) | drizzle-orm-patterns | `pr_brief` upsert, workspace-scoped read |
| `server/src/vendor/shared/**` (shared-contracts-server), `client/src/vendor/shared/**` (shared-contracts-client) | zod, onion-architecture | contract change + sync |
| `client/src/**` (client-src), `client/src/app/**` (client-app-router) | frontend-architecture, react-best-practices, next-best-practices | colocated components, hooks, derived state, navigation |
| `client/messages/**` (client-i18n) | frontend-architecture | one file per feature |
| all code paths (security-surface) | security | prompt fencing, LLM output handling, tenancy, rate limit, errors |
(The practices are in the steps. The implementer loads a skill only where a step says `load:`.)

## Steps

### Step 1 — Brief contract and the `risk_brief` default (server contracts, client copy)
- Files: modify `server/src/vendor/shared/contracts/brief.ts` · modify `server/src/vendor/shared/contracts/platform.ts` · modify `client/src/vendor/shared/contracts/brief.ts` · modify `client/src/vendor/shared/contracts/platform.ts` · modify `client/src/lib/feature-models.ts` · modify `server/test/settings-models.it.test.ts`
- Change: in `brief.ts` type `Risk.kind` as `RiskAreaKind`; add `ReviewFocusItem` (`file`, `line` positive int, `reason`), `BriefMissing` (enum of the 12 values in spec `:70`), and rewrite `PrBrief` as `summary`, `risks: z.array(Risk)`, `review_focus`, `head_sha`, `generated_at`, `provider`, `model`, `tokens_in`, `tokens_out`, `cost_usd` (nullable: the provider's own estimate, as Intent stores it), `missing`, plus optional `intent`, `blast`, `history` (spec `:71`; never written, see step 6). Add `PrBriefResponse` (`brief` nullable, `stale`, `current_head_sha`). In `platform.ts` set the `risk_brief` registry default to `openrouter` / `deepseek/deepseek-v4-flash`; mirror it in `client/src/lib/feature-models.ts:30-34`. Run `./scripts/shared-contracts.sh sync` (never hand-edit the client copy).
- Covers: AC-41, AC-43, AC-52, AC-54, NFR-12
- Rules / skills: zod, onion-architecture
- Practices: enums for fixed values, export schema and inferred type together; wire fields stay `snake_case` (root `AGENTS.md` Naming); a constant two packages need lives in `vendor/shared` (`server/INSIGHTS.md:227`).
- Tests (test-writer): `server/test/brief-contract.test.ts` — AC-43, AC-52, AC-54, NFR-12
- Existing tests to update: `server/test/settings-models.it.test.ts:54-56` asserts the old default.
- Done when: `./scripts/shared-contracts.sh check` passes; `pnpm typecheck` passes in `server/`, `client/` and `mcp/`.

### Step 2 — Shared hunk and issue-reference helpers (server)
- Files: create `server/src/modules/_shared/hunks.ts` · create `server/src/modules/_shared/issue-refs.ts` · modify `server/src/modules/intent/hunks.ts` · modify `server/src/modules/intent/links.ts`
- Change: move `extractHunkHeaders` (with its regex) to `_shared/hunks.ts`, keeping its two limits from `INTENT_LIMITS` — the first 5 headers of a patch, each cut to 120 characters (`intent/hunks.ts:21-29`) — and add pure `newSideRanges(patch): { start: number; end: number }[]`, one range per `@@` header: `newStart` to `newStart + newLines - 1`, no range when `newLines` is 0 (user decision 3: context lines count). Move `extractIssueRefs`, `IssueRefCandidate`, `RepoRefLike` and their three regexes to `_shared/issue-refs.ts`. The intent files import and re-export them, unchanged for their callers.
- Covers: AC-16, AC-25, AC-47, EC-6
- Rules / skills: onion-architecture
- Practices: `_shared` is exempt from the cross-module check, and the old file re-exports so callers and tests stay untouched (`server/INSIGHTS.md:357-367`). Read headers only: a bare `pr_files.patch` has no `diff --git` / `+++` line, so `parseUnifiedDiff` returns no files for it (`reviewer-core/src/diff.ts:62`). Keep regexes anchored and bounded.
- Tests (test-writer): `server/test/shared-hunks.test.ts` — AC-16, AC-47, EC-6
- Existing tests to update: none (`test/intent-hunks.test.ts`, `intent-links.test.ts`, `intent-prompt.test.ts` must pass unchanged).
- Done when: `pnpm vitest run test/intent-hunks.test.ts test/intent-links.test.ts test/intent-prompt.test.ts test/intent-service.test.ts` passes and `pnpm arch` reports no violations.

### Step 3 — Candidate documents (server, project-context)
- Files: modify `server/src/modules/project-context/service.ts`
- Change: add `candidateDocuments(workspaceId, repoId): Promise<{ path: string; text: string; tokens: number }[]>`: repo through `deps.repos.getById` (unknown repo or no `clonePath` → `[]`), paths from `deps.agents.contextUsedBy`, ordered by count descending then path ascending, each read with `deps.reader.read(root, path, MAX_DOCUMENT_BYTES)`; skip every result that is not `read`.
- Covers: AC-28, AC-30, EC-12
- Rules / skills: onion-architecture, security
- Practices: no new port and no new import; read only through the root-confined reader (security rule 2); the method never throws for a missing document.
- Tests (test-writer): `server/test/project-context-candidates.test.ts` — AC-28, AC-30, EC-12
- Existing tests to update: none.
- Done when: `pnpm typecheck` and `pnpm arch` pass in `server/`.

### Step 4 — Brief domain: limits, model-answer schema, answer validation (server)
- Files: create `server/src/modules/brief/constants.ts` · create `server/src/modules/brief/domain.ts`
- Change: `constants.ts` holds the limits (8,000 request tokens, 3,000 document tokens, description 6,000 chars, issue 3,000 chars, top 50 files, 5 risks, 7 focus items, 3 file refs, text lengths 400 / 80 / 400 / 160), the caps on inputs the budget cannot remove (title 300 chars; blast summary 400 chars; at most 30 changed symbols, 20 endpoints and 20 cron jobs; every path and name 200 chars; system text at most 1,500 tokens) and the call settings (`temperature 0`, `maxRetries 1`, `transportRetries 0`, timeout, `maxTokens`). `domain.ts` holds `BriefModelAnswer` (zod: `summary`, `risks[]`, `review_focus[]`, reusing `Risk` and `ReviewFocusItem`, no length or count limits) and pure `validateAnswer(answer, { prPaths, blastPaths, rangesByPath })` returning the cleaned parts and the two drop counts. Order: keep the first 5 risks and first 7 focus items; filter `file_refs` against `prPaths ∪ blastPaths`, then keep 3; drop a risk with none left; drop a focus item whose `file` is not in `prPaths` or whose `line` is in no range; cut texts.
- Covers: AC-42, AC-43, AC-44, AC-45, AC-46, AC-47, AC-48, AC-49, AC-50, AC-51, EC-3, EC-4, EC-5, EC-6, EC-7, EC-27, EC-28
- Rules / skills: onion-architecture, zod, security
- Practices: pure functions, imports only `zod` and `@devdigest/shared`; exact string equality on paths; a model path is only compared, never used to read or link (security rule 7). The caller passes an empty `blastPaths` when the blast has no changed symbol.
- Tests (test-writer): `server/test/brief-domain.test.ts` — AC-42, AC-43, AC-44, AC-45, AC-46, AC-47, AC-48, AC-49, AC-50, AC-51, EC-3, EC-4, EC-5, EC-6, EC-7, EC-27
- Existing tests to update: none.
- Done when: `pnpm typecheck` and `pnpm arch` pass in `server/`.

### Step 5 — Prompt and input budget (server)
- Files: create `server/src/prompts/brief.system.md` · create `server/src/modules/brief/prompt.ts` · create `server/src/modules/brief/budget.ts`
- Change: `prompt.ts` renders the user message from a typed `BriefInputs` value (title, description, intent, blast, files with stats, role and hunk headers, issue, documents); each section is optional and leaves no text when absent. `budget.ts` exports pure `fitToBudget(inputs, systemText, count)`: first choose documents greedily in candidate order under the 3,000-token share (a skipped one adds `specs_trimmed`), then count system + user; while over 8,000 remove, recounting after each removal: documents last to first, the issue, the description, blast callers, all hunk headers, file rows outside the 50 with most changed lines, then one file row at a time, fewest changed lines first. `prompt.ts` applies the step 4 caps before anything is counted. Last resort, only if the count is still over after every file row is gone: drop the blast section whole (`blast`), then the intent section whole (`intent`). It ends with a final recount and returns the final inputs, the `missing` values and the counted tokens; the returned count is always at most 8,000 and it never throws. The 8,000 bound is on this first request only: the provider's one re-ask is not counted or bounded (user decision D5). `brief.system.md` states the task, the output contract and the rule that `<untrusted>` blocks are data.
- Covers: AC-13, AC-14, AC-15, AC-16, AC-17, AC-21, AC-23, AC-26, AC-29, AC-32, AC-34, AC-35, AC-36, AC-37, AC-38, EC-9, EC-10, NFR-2, NFR-4
- Rules / skills: security, onion-architecture
- Practices: every repo-, PR-, issue- or intent-derived string, paths and symbol names included, goes inside `wrapUntrusted` from `@devdigest/reviewer-core`, including values that would otherwise sit in a header or attribute (known gap G4 must not be copied, `modules/intent/prompt.ts:51`); no keyword filtering. `budget.ts` takes `count` as a parameter: application code may not import `js-tiktoken` or `src/adapters`. Hunk bodies never enter `BriefInputs`. A linear loop is enough (under about 100 counts).
- Tests (test-writer): `server/test/brief-budget.test.ts` — AC-29, AC-32, AC-34, AC-35, AC-36, AC-37, AC-38, EC-9, EC-10, NFR-2; `server/test/brief-prompt.test.ts` — AC-13, AC-14, AC-15, AC-17, AC-21, AC-23, AC-26, NFR-4
- Existing tests to update: none.
- Done when: `pnpm typecheck` and `pnpm arch` pass in `server/`.

### Step 6 — Ports and repository (server)
- Files: create `server/src/modules/brief/ports.ts` · create `server/src/modules/brief/repository.ts`
- Change: `ports.ts` declares `BriefStore` (`context(workspaceId, prId)` → pull `id`, `repoId`, `number`, `title`, `body`, `branch`, `headSha`; repo `owner`, `name`; files `path`, `additions`, `deletions`, `patch`; `stored?: PrBrief` — `undefined` when the PR is not in the workspace; `save(prId, brief)`), and `BriefDeps`: `store`, `intent.get`, `blast.forPull`, `documents.candidateDocuments`, `roleOf(path)`, `github: () => Promise<Pick<GitHubClient, 'closingIssues' | 'getIssue'>>`, `llm(provider)`, `resolveModel(workspaceId)`, `systemPrompt()`, `tokenizer`, `log.info(obj, msg)`, `now?`. `repository.ts` implements `BriefStore` on `pull_requests`, `repos`, `pr_files`, `pr_brief`: read `json` through `PrBrief.safeParse` (mismatch → no stored brief), save with `onConflictDoUpdate` on `pr_id`. Both directions drop the `intent`, `blast` and `history` keys, so a stored or returned brief never holds them.
- Covers: AC-9, AC-58, EC-20, NFR-6, NFR-13
- Rules / skills: onion-architecture, drizzle-orm-patterns, security
- Practices: `ports.ts` is core: import only types from `@devdigest/shared`, never a file that imports `platform/errors` (`server/INSIGHTS.md:139`). Structural port types, not other modules' types. The pull query filters by `workspaceId` and `id` together, as `intent/repository.ts:55-58`. jsonb is read with `safeParse`, never returned raw (`server/INSIGHTS.md:247`). Query builder only, no `sql.raw`. Row types stay in the repository.
- Tests (test-writer): `server/test/brief.it.test.ts` — AC-9, AC-58, EC-20, NFR-6, NFR-13
- Existing tests to update: none.
- Done when: `pnpm typecheck` and `pnpm arch` pass in `server/`.

### Step 7 — Brief service (server)
- Files: create `server/src/modules/brief/service.ts`
- Change: `BriefService(deps)` with `get(workspaceId, prId)` (stored brief or null, `stale = brief.head_sha !== pull.headSha`, `current_head_sha`; no model call) and `generate(workspaceId, prId)`. `generate` loads the context first (`NotFoundError` when absent), then joins an in-flight promise from a `Map<prId, Promise<PrBrief>>` or starts one, removing it in `finally`. A generation: read intent (`intent`, `intent_stale`), blast (`blast` when no changed symbol; a thrown read counts the same), documents (`specs` when none is included), description (`description` when empty), the linked issue (first `closingIssues` result on any base branch, else the first same-repo ref from title + description + branch read with `getIssue`; any failure → `issue`); build file rows with `roleOf`, `extractHunkHeaders` and `newSideRanges`; `fitToBudget`; one `completeStructured` call with `BriefModelAnswer`, sent only when the returned count is at most 8,000; `validateAnswer`; `store.save`. Every generation that starts writes exactly one `log.info` line from a `finally` path, with `outcome: 'ok' | 'failed'` and, on failure, the error code and whatever fields are known by then. `cost_usd` is the provider result's `costUsd`, the same source Intent and review runs store (`intent/service.ts:234`); it stays null when the price is unknown.
- Covers: AC-5, AC-8, AC-11, AC-12, AC-18, AC-19, AC-20, AC-22, AC-24, AC-25, AC-27, AC-31, AC-33, AC-39, AC-40, AC-52, AC-55, AC-57, AC-87, AC-88, EC-1, EC-2, EC-11, EC-13, EC-14, EC-16, EC-17, EC-18, EC-19, EC-26, NFR-1, NFR-3, NFR-8, NFR-10
- Rules / skills: onion-architecture, security
- Practices: constructor takes `BriefDeps` only. The in-flight map is the whole answer to AC-8 / EC-14 because the API is one process (`server/AGENTS.md:53`); add no database lock. The workspace check runs before the in-flight lookup, so a caller never joins another workspace's promise. Call with `maxRetries: 1` and `transportRetries: 0` (`server/INSIGHTS.md:490`; user decisions 2 and 5: the budget bounds the first request only, one log line carries `attempts` and summed tokens). Errors: rethrow a `ConfigError` from `llm()` as `new ConfigError(message, { provider })`; map any other non-`AppError` to `ExternalServiceError` with a fixed text that names the provider and one of a small set of reasons — never forward the SDK's `err.message`. Save only after validation succeeds. Never call `intent.derive`. At most two GitHub requests. The log line holds ids, sha, provider, model, counted tokens, provider tokens, cost, `missing`, drop counts, `attempts` — no input or model text.
- Tests (test-writer): `server/test/brief-service.test.ts` — AC-5, AC-8, AC-11, AC-12, AC-18, AC-19, AC-20, AC-22, AC-24, AC-25, AC-27, AC-31, AC-33, AC-39, AC-40, AC-55, AC-57, AC-87, AC-88, EC-1, EC-2, EC-11, EC-14, EC-19, NFR-1, NFR-3, NFR-8, NFR-10
- Existing tests to update: none.
- Done when: `pnpm typecheck` and `pnpm arch` pass in `server/`.

### Step 8 — Routes and wiring (server)
- Files: create `server/src/modules/brief/routes.ts` · modify `server/src/platform/container.ts` · modify `server/src/modules/index.ts`
- Change: the container gets a lazy `briefRepo` getter and `briefDeps(log)`, which builds the ports: `intent: this.intentService`, `blast: new BlastService({ ...this.blastDeps, log })`, `documents: this.projectContextService`, `roleOf: classifyFile` from `modules/smart-diff/index.js`, `github`, `llm`, `resolveModel` with `'risk_brief'`, `systemPrompt: () => renderPrompt('brief.system.md', {})`, `tokenizer`, `log`. `routes.ts` builds one `BriefService` per app (`container.briefDeps(app.log)`) and registers `GET /pulls/:id/brief` (`PrBriefResponse`) and `POST /pulls/:id/brief` (`PrBrief`, `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }`). Register `brief` in `modules/index.ts`.
- Covers: AC-54, NFR-6, NFR-7
- Rules / skills: onion-architecture, fastify-best-practices, security
- Practices: handler = `getContext` → one service call, as `intent/routes.ts:16-37`; zod `params` (`IdParams`) and response schemas, no parse inside a handler; the service is created once because it holds the in-flight map. Only the container imports other modules' classes.
- Tests (test-writer): `server/test/brief.it.test.ts` — AC-54, NFR-6, NFR-7
- Existing tests to update: none expected; if a review `.it.test.ts` starts calling a provider, add `secrets: new MockSecretsProvider({})` (`server/INSIGHTS.md:562-570`).
- Done when: `./scripts/check-changed.sh` passes for `server/`; with the API running, `curl -s localhost:3001/pulls/<pr uuid>/brief` answers `{"brief":null,"stale":false,"current_head_sha":"…"}`.

### Step 9 — Client data hooks and strings (client)
- Files: create `client/src/lib/hooks/brief.ts` · modify `client/src/lib/hooks/index.ts` · modify `client/src/lib/query-keys.ts` · modify `client/src/lib/types.ts` · modify `client/messages/en/brief.json` · modify `client/messages/en/intent.json`
- Change: `keys.pr.brief(prId)`; `usePrBrief(prId, headSha)` (GET, key ends with `headSha`, as `usePrIntent`) and `useGenerateBrief(prId)` (POST, `meta: { silent: true }`, `onSuccess` returns the `invalidateQueries` promise so the mutation stays pending until the new brief is in the cache). Add every string of the feature to `brief.json` (keep the existing keys): block label, empty state, generate, refresh aria label, stale note, verdict hint, notice wording of spec OQ-8 with a name per `missing` value, footer, Risk areas, Review focus, "File not in this PR's diff", error texts. Set `intent.json` `card.riskAreas` to "Risk signals".
- Covers: AC-4, AC-10, AC-53, EC-15, NFR-9
- Rules / skills: frontend-architecture, react-best-practices
- Practices: hooks live in `src/lib/hooks/<domain>.ts`, keys only from `query-keys.ts`, calls through `api.*`; server state stays in the query cache. A mutation whose screen shows its error inline is `meta.silent`, or the global handler toasts it twice (`client/INSIGHTS.md:102`).
- Tests (test-writer): `client/src/lib/hooks/brief.test.tsx` — AC-10, AC-53, EC-15
- Existing tests to update: `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/IntentCard/IntentCard.test.tsx` only if it asserts the old "Risk areas" label.
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `client/`.

### Step 10 — PR Brief block on the Overview tab (client)
- Files: create `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBriefBlock/PrBriefBlock.tsx` · create `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBriefBlock/index.ts` · create `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBriefBlock/helpers.ts` · create `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBriefBlock/styles.ts` · modify `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` · modify `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` · modify `client/src/lib/latest-round-findings.ts`
- Change: `OverviewTab` calls the two brief hooks and renders, in order: `PrBriefBlock`, the Intent + Blast grid (always), then the Risk areas slot and the Review focus slot that Step 11 fills. While a generation is in flight (first or repeated) each of the three regions shows a `Skeleton`: the summary inside the block and one in each slot. `PrBriefBlock` states: read pending → skeleton; read error → `ErrorState` with Retry and no generate button (spec OQ-5); no brief → empty state with "Generate brief"; generation failed without a brief → `ErrorState` with Retry; brief → banner (summary as plain text, refresh button, and while a review exists the verdict, finding count, blocker count, PR score and the hint), stale note, missing notice, footer (the amount is left out when `cost_usd` is null; the other fields stay), and an inline error when a regeneration failed. While generating, both buttons are disabled. A `config_error` shows the provider from `error.details.provider` and a `Link` to `/settings`. `page.tsx` passes `reviews` and the PR's list `score` (from `usePulls`). Add pure `latestRoundSummary(reviews)` (most severe verdict in the order request changes, comment, approve; finding count; blockers) beside `latestRoundFindings`, sharing its round rule.
- Covers: AC-1, AC-2, AC-3, AC-6, AC-7, AC-56, AC-59, AC-60, AC-61, AC-62, AC-63, AC-64, AC-65, AC-66, AC-67, AC-83, AC-84, AC-85, AC-86, EC-21, EC-22, NFR-11
- Rules / skills: frontend-architecture, react-best-practices, security
- Practices: feature component folder with `index.ts`, styles in `styles.ts` using the design CSS variables (both themes); early returns per state; no derived state in `useState`; real `<button>` elements with `aria-label` on icon-only ones, `aria-live="polite"` on the block. Blocker = `CRITICAL` and not dismissed (`ReviewRunAccordion.tsx:60`); verdict labels and colours from `VerdictBanner/constants.ts`. Build from `client/docs/design/src/screen_pr_detail.jsx:66-133`; where it differs from the spec, the spec wins (no cost badge in the banner, no history). Model text is rendered as text, never as HTML. Check `client/src/vendor/ui/README.md` before writing a primitive.
- Tests (test-writer): `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/PrBriefBlock/PrBriefBlock.test.tsx` — AC-1, AC-2, AC-6, AC-7, AC-56, AC-59, AC-60, AC-61, AC-62, AC-64, AC-65, AC-66, AC-67, AC-83, AC-84, AC-85, AC-86, EC-21, EC-22
- Existing tests to update: none (`latestRoundFindings` keeps its signature).
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `client/`.

### Step 11 — Risk areas, Review focus and the jump (client)
- Files: create `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/RiskAreas/RiskAreas.tsx` · create `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/RiskAreas/index.ts` · create `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/RiskAreas/styles.ts` · create `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/ReviewFocus/ReviewFocus.tsx` · create `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/ReviewFocus/index.ts` · create `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/ReviewFocus/styles.ts` · create `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/helpers.ts` · create `client/src/app/repos/[repoId]/pulls/[number]/use-diff-jump.ts` · create `client/src/lib/strip-image-embeds.ts` · modify `client/src/app/repos/[repoId]/onboarding/_components/TourView/helpers.ts` · modify `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/IntentCard/helpers.ts` · modify `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx` · modify `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`
- Change: `RiskAreas` (below the grid, while a brief is shown; the Step 10 skeleton takes its place and Review focus's while generating): each risk with its kind icon in the severity colour, title, first file reference, and an expand button showing the explanation and all references; "No notable risks flagged." when empty. `ReviewFocus`: titled block with the count and `file:line — reason` buttons; not rendered when empty. `useDiffJump()` returns `(file, line?)` and calls `router.push` with `tab=diff`, `file` and `line` in one URL. A file reference that is in the PR's file list jumps; any other shows the toast "File not in this PR's diff". `page.tsx` passes the PR's file paths. Move `riskAreaIcon` and `shortSha` to `OverviewTab/helpers.ts` and `stripImageEmbeds` to `src/lib/strip-image-embeds.ts`; the old helper files re-export them.
- Covers: AC-68, AC-69, AC-70, AC-71, AC-72, AC-73, AC-74, AC-75, AC-76, AC-82, EC-8, NFR-5, NFR-11
- Rules / skills: frontend-architecture, react-best-practices, next-best-practices, security
- Practices: promote a helper on its second consumer and keep the old export for its tests. `router.push`, not the `replace` of `useSearchParamState`, so Back returns to Overview; one navigation for all three parameters (`client/INSIGHTS.md:169`). The explanation goes through the kit `Markdown` (`client/src/vendor/ui/primitives/Markdown.tsx`: react-markdown + remark-gfm, no `rehype-raw`, so raw HTML is not rendered, and the default `urlTransform` limits link schemes) — do not add plugins or a `urlTransform` to it — after `stripImageEmbeds`, because the primitive would fetch a remote image named by model text (`client/INSIGHTS.md:62-67`); every other model string is plain text. A model path is only compared with the file list and shown as text, never put into an `href`. Severity colours `var(--crit)`, `var(--warn)`, `var(--info)` (design `screen_pr_detail.jsx:21`). Stable keys, `aria-expanded` on the expand button.
- Tests (test-writer): `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/RiskAreas/RiskAreas.test.tsx` — AC-68, AC-69, AC-70, AC-71, AC-72, AC-73, EC-8, NFR-5; `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/ReviewFocus/ReviewFocus.test.tsx` — AC-74, AC-75, AC-76, AC-82
- Existing tests to update: none (re-exports keep `TourView/helpers.test.ts` and `IntentCard.test.tsx` importing as before).
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `client/`.

### Step 12 — Arrival on Files changed (client)
- Files: modify `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` · modify `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx` · modify `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/RoleGroup/RoleGroup.tsx` · modify `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx` · modify `client/src/components/diff-viewer/FileCard/FileCard.tsx` · modify `client/src/components/diff-viewer/CodeLine/CodeLine.tsx` · modify `client/src/components/diff-viewer/styles.ts` · modify `client/src/components/diff-viewer/index.ts` · modify `specs/12-pr-brief.md`
- Change: `page.tsx` reads `file` and `line` from the query string and passes `focus = { path, line | null }` to `DiffTab` only when `path` is one of `pr.files` (otherwise nothing changes, spec OQ-6); `line` counts only as a positive integer. `DiffTab` hands `focus` to `DiffViewer` and `RoleGroup`; a group that holds the file is open; the focused `FileCard` is open, carries the accent border, and after mount scrolls the line into view when one of its lines has that `newNo`, else its header; the line stays highlighted for about 2 seconds. `CodeLine` gets a `data-new-line` attribute and a `highlighted` prop. The order stays Smart (spec OQ-7). As the last action of the run, set the spec's `Status:` line to `implemented`.
- Covers: AC-77, AC-78, AC-79, AC-80, AC-81, EC-23, EC-24, EC-25
- Rules / skills: frontend-architecture, react-best-practices, security
- Practices: `components/diff-viewer` may not import `src/app`: `focus` is a plain prop exported as a type from its `index.ts` (`client/INSIGHTS.md:267`). Open state is derived, like `DiffTab.tsx:61-62`, not synced by an effect, and the URL focus wins over a remembered collapse: keep the manual toggle together with the focus value it was made under, and ignore it when the focus value differs (`open = toggleForThisFocus ?? (isFocused || default)`). So a new `file` / `line` always opens its group and file, and the user can still collapse them afterwards. Scrolling is the one real effect: call `scrollIntoView?.({ block: "center" })` (jsdom has none, `client/INSIGHTS.md:456`), clear the highlight timer in cleanup, and give the header `scroll-margin-top` from `var(--pr-header-h)`. URL values are only compared with the file list and shown as text.
- Tests (test-writer): `client/src/components/diff-viewer/FileCard/FileCard.test.tsx` — AC-77, AC-78, AC-79, AC-80, AC-81, EC-23, EC-24, EC-25
- Existing tests to update: `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.test.tsx` if it relies on the old open-state shape.
- Done when: `./scripts/check-changed.sh` passes for `client/`; opening `…/pulls/<n>?tab=diff&file=<a changed path>&line=<a shown line>` shows that file open with the accent border.

## Contracts & migrations
- Shared contracts sync: yes — `contracts/brief.ts`, `contracts/platform.ts`
- Schema change + `pnpm db:generate`: no — `pr_brief` exists (`server/src/db/schema/reviews.ts:116-120`)
- Spec `Status` update: yes — `implemented`, by the implementer of G4 (`specs/README.md:28`)

## Verification
| Package | Checks (from routing.json) |
|---|---|
| server | `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm arch` |
| client | `pnpm typecheck` · `pnpm lint` · `pnpm test` |
| mcp | `pnpm typecheck` (CI runs it on every `server/src/vendor/shared/**` change) |
Plus extra checks: `./scripts/shared-contracts.sh check`. Needs Postgres: yes, only for `settings-models.it.test.ts` (`pnpm vitest run test/settings-models.it.test.ts`).
All of the above in one command: `./scripts/check-changed.sh` (a group that is not the last runs `--quick`).

## Insights to record
- `server/INSIGHTS.md` · Tool & Library Notes — `parseUnifiedDiff` returns no files for a bare `pr_files.patch` (no `diff --git` / `+++` line); per-file ranges come from `newSideRanges` (Where: `reviewer-core/src/diff.ts:62`, `src/modules/_shared/hunks.ts`)
- `server/INSIGHTS.md` · Codebase Patterns — a service that needs another module's logging service gets it through `container.briefDeps(log)`; the brief service is one instance per app because it holds the in-flight map (Where: `src/platform/container.ts`, `src/modules/brief/routes.ts`)
- `client/INSIGHTS.md` · Codebase Patterns — a jump that must be undone by Back uses `router.push`; `useSearchParamState` replaces the entry (Where: `src/lib/use-search-param-state.ts:32`)

<!-- implementer-brief:end -->

## Context read
- `AGENTS.md` (root) — naming, contract sync, "Do not touch", `.it.test.ts` rule.
- `server/AGENTS.md:31-46` — module shape, zod route schemas, `AppError`, tests.
- `client/AGENTS.md:27-48` — component folders, hooks, i18n, vendor copy.
- `mcp/AGENTS.md:36-37` — shared contracts are type-only there; a contract change runs its typecheck.
- `specs/12-pr-brief.md` — SPEC-12, `Status: approved`; OQ-1 answered by the user, OQ-2..OQ-8 taken with their defaults.
- `docs/plans/08-pr-brief.brainstorm.md` — `Status: chosen: option 2`; common decisions S1–S7.
- `server/INSIGHTS.md:139` — a `ports.ts` is core for depcruise.
- `server/INSIGHTS.md:227` — shared constants go in `vendor/shared`.
- `server/INSIGHTS.md:247` — jsonb through `safeParse`.
- `server/INSIGHTS.md:357-367` — helper moved to `_shared`, old file re-exports.
- `server/INSIGHTS.md:369-378` — the latest-round rule is one shared helper.
- `server/INSIGHTS.md:490-491` — `maxRetries` vs `transportRetries`.
- `server/INSIGHTS.md:562-570` — an always-on model call needs `MockSecretsProvider` in `.it.test.ts`; the brief is on demand, so it does not apply unless a test calls the route.
- `client/INSIGHTS.md:62-67` — kit `Markdown` loads remote images; strip embeds from model text.
- `client/INSIGHTS.md:102` — global mutation toast, `meta.silent`.
- `client/INSIGHTS.md:169` — several query parameters in one navigation.
- `client/INSIGHTS.md:228-238` — the design's risk row has `severity`; the brief's `Risk` contract has it too, unlike `RiskArea`.
- `client/INSIGHTS.md:267` — diff-viewer takes route data through props.
- `client/INSIGHTS.md:456` — jsdom has no `scrollTo` / layout.
- `server/src/vendor/shared/contracts/brief.ts:36-47,200-215,268-275` — `RiskAreaKind`, `Risk`, old `PrBrief`.
- `server/src/vendor/shared/contracts/platform.ts:60-65` — `risk_brief` default is `openai` / `gpt-4.1` today.
- `server/src/vendor/shared/adapters.ts:55-86,176-182` — `StructuredRequest`, `attempts`, `getIssue`, `closingIssues`.
- `server/src/modules/intent/{service,ports,routes,repository,hunks,links}.ts` — call shape, `get`, rate limit, safe jsonb read, helpers to move.
- `server/src/modules/blast/{service,routes,ports}.ts` — `forPull`, the `log` dependency, built in the route today.
- `server/src/modules/smart-diff/index.ts:7` — `classifyFile` is the module's public surface.
- `server/src/modules/project-context/{service,ports,constants}.ts`, `server/src/modules/agents/repository.ts:491-519` — reader, `contextUsedBy`, the 65,536-byte cap.
- `server/src/platform/container.ts:237-290,355-456` — `blastDeps`, `intentDeps`, `projectContextService`, `tokenizer`, `llm` / `ConfigError`.
- `server/src/platform/errors.ts:7-41`, `server/src/app.ts:163-181` — `ConfigError(message, details)`; `details` reaches the client for an `AppError`.
- `reviewer-core/src/diff.ts:14-79`, `reviewer-core/src/prompt.ts:30-35`, `reviewer-core/src/llm/openrouter.ts:85-151` — parser behaviour, `wrapUntrusted`, re-ask loop and its errors.
- `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`, `OverviewTab.tsx`, `IntentCard.tsx`, `DiffTab.tsx`, `RoleGroup.tsx` — current composition and state.
- `client/src/components/diff-viewer/{DiffViewer,FileCard,CodeLine}`, `helpers.ts:21-54` — open state, `Line.newNo`.
- `client/src/lib/{use-search-param-state.ts,latest-round-findings.ts,toast.tsx,hooks/intent.ts,query-keys.ts:22-33,feature-models.ts:30-34}`.
- `client/docs/design/src/screen_pr_detail.jsx:20-133` — `RiskPillRow`, `ReviewFocusBlock`, `BriefEmpty`, `BriefSkeleton`, `BriefCard`.
- `.claude/skills/pr-self-review/assets/routing.json` — rules and checks; skills loaded: security (+ `references/devdigest.md`), fastify-best-practices, zod, drizzle-orm-patterns, react-best-practices, next-best-practices; onion-architecture and frontend-architecture with their `devdigest.md`.

## Requirements trace
The spec's own ids are used; every `AC-n`, `EC-n` and `NFR-n` is on a `Covers` line.

| R | Requirement (source `path:line` or "request") | Steps |
|---|---|---|
| AC-1..AC-4 | Block and empty state (`specs/12-pr-brief.md:78-81`) | 9, 10 |
| AC-5..AC-12 | Generation (`:84-91`) | 6, 7, 9, 10 |
| AC-13..AC-33 | Model inputs (`:94-114`) | 2, 3, 5, 7 |
| AC-34..AC-38 | Input budget (`:117-121`) | 5 |
| AC-39..AC-43 | Model call (`:124-128`) | 1, 4, 7 |
| AC-44..AC-52 | Answer validation (`:131-139`) | 1, 2, 4, 7 |
| AC-53..AC-58 | Reading, reload, stale (`:142-147`) | 1, 6, 7, 8, 9, 10 |
| AC-59..AC-67 | Banner, notice, footer (`:150-158`) | 10 |
| AC-68..AC-76 | Risk areas, Review focus (`:161-171`) | 11 |
| AC-77..AC-82 | Arrival on Files changed (`:174-179`) | 11, 12 |
| AC-83..AC-88 | Failures (`:182-187`) | 7, 10 |
| EC-1..EC-28 | Edge cases (`:213-240`) | 2, 3, 4, 5, 6, 7, 9, 10, 11, 12 |
| NFR-1..NFR-13 | Non-functional (`:243-255`) | 1, 5, 6, 7, 8, 9, 10, 11 |
| D1 | Brief lives in a new `brief` module composing intent, blast, smart-diff and project-context through container ports; helpers move to `_shared` with re-exports (request, user decision 1) | 2, 3, 6, 8 |
| D2 | Provider re-asks with `maxRetries: 1`; one log line with `attempts` and summed tokens; no per-attempt hook (request, user decision 2) | 4, 7 |
| D3 | Changed range = the hunk's new-side range, context lines included (request, user decision 3) | 2, 4 |
| D4 | Linked issue as AC-25 is written: closing issues on any base branch (request, user decision 4) | 7 |
| D5 | The 8,000-token budget bounds the first request only (request, user decision 5) | 5, 7 |
| D6 | Spec OQ-1 as written: one structured call, at most one re-ask (request) | 7 |
| D7 | Tests off: implementers only repair tests they break (request) | all `Existing tests to update` lines |
| D8 | AC-52 / AC-67: the cost is computed as Intent and review runs do (the provider result's `costUsd`); while the price is unknown `cost_usd` is null and the footer shows the other fields without an amount. The spec is not amended (user decision after the cross-model review) | 1, 7, 10 |
| D9 | AC-8 / EC-14: one API process is assumed; no database lease (user decision after the cross-model review) | 7 |

Recommendations: None were open. The brief's common decisions S1–S7 are planned as written (S1 step 6, S2 step 1, S3 step 7, S4 steps 4 and 7, S5 step 5, S6 step 3, S7 step 5).

## Affected modules
| Package | Path | Ring / layer | Change |
|---|---|---|---|
| server | `src/vendor/shared/contracts/{brief,platform}.ts` | core — domain | new brief shape, `risk_brief` default |
| server | `src/modules/_shared/{hunks,issue-refs}.ts` | application (pure helpers) | new, moved from intent |
| server | `src/modules/intent/{hunks,links}.ts` | application | re-export only |
| server | `src/modules/project-context/service.ts` | application | one additive method |
| server | `src/modules/brief/{constants,domain,prompt,budget,service}.ts` | core / application | new |
| server | `src/modules/brief/ports.ts` | core — ports | new |
| server | `src/modules/brief/{repository,routes}.ts` | outer ring | new |
| server | `src/platform/container.ts`, `src/modules/index.ts` | composition root | wiring, registration |
| server | `src/prompts/brief.system.md` | prompt template | new |
| client | `src/vendor/shared/**` | contracts copy | synced |
| client | `src/lib/hooks/brief.ts`, `query-keys.ts`, `latest-round-findings.ts`, `strip-image-embeds.ts`, `feature-models.ts` | shared lib | hooks, key, helpers |
| client | `src/app/repos/[repoId]/pulls/[number]/**` | route + feature components | Overview blocks, jump, arrival |
| client | `src/components/diff-viewer/**` | cross-cutting chrome | `focus` prop, highlight |
| client | `messages/en/{brief,intent}.json` | i18n | strings |

## Constraints honored
| Rule | Source (`path:line`) | How the plan respects it |
|---|---|---|
| Imports point inward; no cross-module internals | `.claude/skills/onion-architecture/SKILL.md` ("The one rule"), `server/INSIGHTS.md:357` | brief imports only `_shared`, `@devdigest/shared`, `@devdigest/reviewer-core`, `platform/errors`; every other module arrives as a port from the container |
| Services take narrow ports, not the Container | onion-architecture, principle 3 | `BriefDeps` in `ports.ts`; `container.briefDeps(log)` builds it |
| Contracts edited in the server copy, then synced | root `AGENTS.md` "Cross-package rules" | step 1 |
| No hand-written migration | root `AGENTS.md` "Do not touch" | no schema change at all |
| DB tests end in `.it.test.ts` | root `AGENTS.md` "Naming" | planned test names in steps 6 and 8 |
| i18n in `client/messages/en/<camelCase>.json` | `client/AGENTS.md:33` | step 9, `brief.json` |
| Components never fetch; hooks in `src/lib/hooks` | `client/AGENTS.md:32` | step 9 |
| Shared code never imports `src/app` | `client/eslint.config.mjs:39-49` | `focus` is a prop of diff-viewer; helpers promoted to `src/lib` |
| Untrusted text only inside `wrapUntrusted` | `.claude/skills/security/SKILL.md` rule 6 | step 5 |
| LLM output is data | security rule 7 | steps 4, 10, 11 |
| Workspace scoping and rate limit on a paid route | security rules 5 and 11 | steps 6, 7, 8 |
| Error responses do not leak internals | security rules 9 and 10 | step 7 |
| Specs belong to the user | planner instructions | the plan only changes the spec's `Status` line through the implementer, as `specs/README.md:28` says |

## Design notes
**Data flow.** `POST /pulls/:id/brief` → `BriefService.generate` → `store.context` (workspace check) → in-flight map → inputs (intent, blast, documents, issue, files) → `fitToBudget` → one `completeStructured` → `validateAnswer` → `store.save` → log line → `PrBrief`. `GET` reads `store.context` only.

**Why the brief has its own context read.** `IntentService.get` returns the stored intent, `stale` and the head SHA, but not the title, the description, the branch or the patches; `SmartDiffService.forPull` returns stats without patches and also queries findings the brief does not need. So `BriefRepository` reads `pull_requests`, `repos` and `pr_files` itself (every module does its own workspace-scoped pull read today), and the Smart Diff role comes from the pure `classifyFile`, wired by the container as `roleOf`. Intent, blast and documents stay with their owning services, so a "missing" notice cannot disagree with the card beside it.

**Blast service and the logger.** `BlastService` needs a `log`; the container has none. `briefDeps(log)` takes the route's `app.log` and builds the blast service there. `BlastService` keeps writing its own line per read; that is noise, not a second model call.

**`missing` rules that follow from the criteria as written.** When every candidate document is left out, both `specs` (AC-31) and `specs_trimmed` (AC-32 / AC-37) are present. Validation uses the full file list and the full blast set even when the request was trimmed: trimming changes what the model sees, not what exists.

**Range helper instead of `parseUnifiedDiff`.** The brief suggested `parseUnifiedDiff`; it needs a file header, which `pr_files.patch` does not have. A hunk's `newLineNumbers` are exactly `newStart … newStart + newLines − 1`, so reading the header gives the same ranges and touches no body line.

**Model-answer schema.** It lives in `brief/domain.ts`, not in the shared contract: the client never sees it. It has no length or count limits, so a long answer is cut (AC-48..AC-51) instead of failing the contract and spending the re-ask.

**Client composition.** `OverviewTab` owns the two hooks because three sibling blocks (the brief block, Risk areas, Review focus) share one loading state (AC-6). The banner's review data is derived from queries the page already runs (`usePrReviews`, `usePulls`).

## Risks & open questions
- `risk_brief` default: the registry says `openai` / `gpt-4.1` (`server/src/vendor/shared/contracts/platform.ts:60-65`), AC-41 says `openrouter` / `deepseek/deepseek-v4-flash`. The plan changes the registry (step 1), so the Settings screen shows the new default too. The brainstorm brief stated the default was already `openrouter`; that was wrong.
- `PrBrief.risks` changes from the object `{ risks: [] }` to an array, as the spec's wire description (`:69`) reads. No code outside the contract uses the old shape.
- Budget last resort (step 5): AC-35 / AC-36 end at file rows. The plan caps the inputs that cannot be removed and, if the count is still over 8,000 after every file row is gone, drops the blast section and then the intent section whole, reporting `blast` / `intent` in `missing`. With the caps this should not be reachable; it exists so that no call goes out over the limit and AC-38 still holds. The caps and this last step are not in the spec: if the user wants them specified, that is a spec amendment.
- The re-ask is outside the 8,000-token bound by user decision D5; NFR-2 is verified against the first request only.
- A thrown blast read is treated like "no changed symbol" (`missing: blast`). EC-3 covers a degraded index, not an exception; say so if a failed read should fail the generation instead.
- AC-86 needs the provider's name on the client: the plan sends it in the error's `details`. For any other failure the client shows the server's fixed text.
- NFR-3: a pull request without closing issues costs two GitHub requests (`closingIssues`, then `getIssue`).
- `file` and `line` stay in the URL when the user changes tabs by hand, so returning to Files changed repeats the scroll. The spec does not ask to clear them.
- When Smart Diff finishes loading, the file cards remount and the scroll runs a second time.
- The kit may have no tooltip primitive; the verdict hint then uses `title` plus an accessible name.
- New tests are off; every "Done when" relies on typecheck, lint, arch, existing tests and two manual checks.
- G3 has 13 files in step 11 alone; it is still one package and one screen.

## Handed off
- Architecture reviewer: `container.briefDeps(log)` building `BlastService` in the composition root; `brief/ports.ts` staying free of other modules' types; the `_shared` moves and re-exports; `OverviewTab/helpers.ts` and `src/lib/strip-image-embeds.ts` promotions; the `focus` prop crossing into `components/diff-viewer`.
- Security reviewer: `brief/prompt.ts` (every untrusted string fenced, paths and symbol names included); `validateAnswer` (model paths and lines); the in-flight map (workspace check before joining); error mapping in `brief/service.ts` (no SDK message, no key); the log line (no input or model text); the rate limit on `POST /pulls/:id/brief`; `RiskAreas` markdown rendering with image stripping; `file` / `line` from the URL in `page.tsx`.
