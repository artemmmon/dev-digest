# Development Plan: Blast Radius: Overview block, `GET /pulls/:id/blast` and MCP `get_blast_radius` (HW4)

Status: implemented
Spec: none (user decision Q6)
Brainstorm: docs/plans/06-blast-radius.brainstorm.md (chosen: option 2)

## Goal

Show a PR's precomputed repo-intel blast radius on the PR Overview tab and through the MCP tool `get_blast_radius`. Both read one new route, `GET /pulls/:id/blast`. The route returns a `BlastRadiusResponse` envelope with the `BlastRadius` map plus index state, limits and counts. It never calls an LLM and never parses the clone.

In scope: P1 + P2 + P3 minus "Prior PRs touching these files": server module `modules/blast/`, the envelope contract + sync, the per-symbol caller cap fix in the repo-intel facade, client hook + `BlastRadiusCard` (Summary, Tree, Graph as plain SVG with a chip-row symbol switcher, DegradedNotice with Resync), OverviewTab wiring, the MCP tool with `outputSchema`, docs, tests, INSIGHTS.

Out of scope: prior-PR history, two-hop endpoint attribution (`BFS_DEPTH`), changes to `BlastRadius`/`PrBrief`, "new file, not indexed" markers (`pr_files` has no status column), e2e flows.

## Step groups

| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| A | 1–4 | contracts + server | — | New exports from `@devdigest/shared`: `BlastRadiusResponse`, `BlastDegradedReason`, `BlastIndexStatus`, `BLAST_LIMITS`. Route `GET /pulls/:id/blast`, response shape as in Step 1. Client copy synced. |
| B | 5–7 | client | A | none (last) |
| C | 8–10 | mcp | A (parallel with B: disjoint packages) | none (last) |

## Skills for implementer

| Path glob (routing.json rule id) | Skills | Why they matter here |
|---|---|---|
| `server/src/vendor/shared/**` (shared-contracts-server) | zod, onion-architecture | envelope contract is core; enums, `.nullable()` vs optional |
| `server/src/{modules,platform}/**` (server-app) | onion-architecture, fastify-best-practices | new module rings, narrow ports, container wiring, thin zod route |
| `server/src/modules/blast/repository.ts` (server-data) | drizzle-orm-patterns | workspace-scoped select, query builder only |
| `client/src/**` (client-src), `client/src/app/**` (client-app-router) | frontend-architecture, react-best-practices, next-best-practices | colocated `_components`, hooks in `src/lib/hooks`, derive-don't-store, `"use client"` |
| `client/messages/**` (client-i18n) | frontend-architecture | all text in `blast.json` |
| `client/**/*.test.tsx` (client-tests) | react-testing-library | `renderWithIntl`, mock `@/lib/api`, userEvent |
| `mcp/src/**` (mcp-src) | typescript-expert, zod | narrow schemas, exact-equality drift checks |
| all source above (security-surface) | security | workspace scoping, no clone reads, untrusted repo text clipped/escaped, safe links |

## Steps

### Step 1: Envelope contract + shared limit (contracts, server)
- Files: modify `server/src/vendor/shared/contracts/brief.ts` (add after `BlastRadius`, ~line 160) · modify `server/src/modules/repo-intel/constants.ts:18` · then run `./scripts/shared-contracts.sh sync` (writes `client/src/vendor/shared/**`).
- Change: add
  - `BLAST_LIMITS = { maxCallersPerSymbol: 20 } as const`
  - `BlastDegradedReason = z.enum(['flag_off','no_data','index_failed','index_partial','repo_too_large'])`
  - `BlastIndexStatus = z.enum(['full','partial','degraded','failed'])`
  - `BlastRadiusResponse = z.object({ blast: BlastRadius, head_sha: z.string(), index: z.object({ status: BlastIndexStatus, degraded: z.boolean(), reason: BlastDegradedReason.nullable(), indexed_sha: z.string().nullable() }), limits: z.object({ max_callers_per_symbol: z.number().int() }), counts: z.object({ changed_files, symbols, callers, endpoints, crons } all z.number().int()), truncated: z.boolean() })`
  - an exported type for each.

  Leave `BlastRadius` and `PrBrief` untouched. In repo-intel `constants.ts`, replace the literal with `export const MAX_CALLERS_PER_SYMBOL = BLAST_LIMITS.maxCallersPerSymbol;`, imported from `@devdigest/shared`, the same re-export pattern as `constants.ts:11,14`.
- Rules / skills: shared-contracts-server; root `AGENTS.md:60`; server `INSIGHTS.md:223`.
- Practices: snake_case wire fields. Use `.nullable()` for "known absent", not `.optional()`. Put the doc comment `/** GET /pulls/:id/blast response. */` on the schema, like `PrIntentResponse` (`brief.ts:99`). Never edit the client copy by hand.
- Tests: none new. The existing suite must stay green.
- Done when: `./scripts/shared-contracts.sh check` passes, and `pnpm typecheck` passes in `server/` and `client/`.

### Step 2: Per-symbol caller cap in the facade (server, repo-intel)
- Files: modify `server/src/modules/repo-intel/service.ts` (`tryPersistentBlast`, the `callers.slice(0, MAX_CALLERS_PER_SYMBOL)` at ~line 411) · create `server/test/repo-intel-blast-cap.test.ts`.
- Change: after `callers.sort((a,b) => b.rank - a.rank)`, keep at most `MAX_CALLERS_PER_SYMBOL` callers **per `viaSymbol`**, counting per key while iterating, instead of a global slice. Change nothing else in the facade: no fallback, reason or state changes.
- Rules / skills: server-app, onion-architecture (edit stays inside repo-intel).
- Practices: pure in-place change. Update the JSDoc at `constants.ts` "Caller fan-out cap per changed symbol" only if its wording no longer matches.
- Tests: `repo-intel-blast-cap.test.ts` builds `new RepoIntelService(stubRepo, repoIntelDeps({}, { enabled: true }))`, the pattern of `test/repo-intel-facade-degraded.test.ts:19-32`. The stub repo has `tryGetIndexState` → `{status:'full',…}`, `getSymbolRows`, `getResolvedCallers` (25 callers of symbol `a`, 3 of `b`, all ranked above `b`'s) and `getFileFacts` → `[]`. Assert that `a` keeps 20, `b` keeps 3, and callers stay rank-sorted.
- Done when: the new test passes, and so does the existing `repo-intel-facade-degraded.test.ts`.

### Step 3: `modules/blast/` core: ports, pure mapper, repository, service (server)
- Files: create `server/src/modules/blast/ports.ts`, `map.ts`, `repository.ts`, `service.ts` · create `server/test/blast-map.test.ts`, `server/test/blast-service.test.ts`.
- Change:
  - **ports.ts** holds narrow structural types only, with no import from `repo-intel` (server `INSIGHTS.md:204`):
    - `BlastPullRef {id; repoId; headSha}`
    - `BlastStore { pullInWorkspace(ws, prId): Promise<BlastPullRef|undefined>; changedPaths(prId): Promise<string[]> }`
    - `BlastIndexSnapshot { status: 'full'|'partial'|'degraded'|'failed'; lastIndexedSha: string; degradedReason?: string }`
    - `BlastFacadeResult { changedSymbols: {file,name,kind}[]; callers: {file,symbol,viaSymbol,line,rank}[]; factsByFile?: Record<string,{endpoints:string[];crons:string[]}>; degraded?: boolean; reason?: string }`
    - `BlastIntel { enabled: boolean; indexState(repoId): Promise<BlastIndexSnapshot>; blastRadius(repoId, files): Promise<BlastFacadeResult> }`
    - `BlastDeps { store: BlastStore; intel: BlastIntel }`

    The facade's `IndexState`/`BlastResult` must satisfy these shapes structurally.
  - **map.ts** is pure and imports only `@devdigest/shared`:
    - `blastReason(enabled, state)`: returns `'flag_off'` if `!enabled`. Otherwise `full` → `null`, `partial` → `'index_partial'`, `failed` → `'index_failed'`, `degraded` → `degradedReason` if it is a valid `BlastDegradedReason`, else `'no_data'`.
    - `shouldQueryFacade(reason, fileCount)` = `fileCount > 0 && (reason === null || reason === 'index_partial')`.
    - `toBlastRadius(result, maxPerSymbol)` returns `{ blast, counts: {symbols,callers,endpoints,crons}, truncated }`:
      - `changed_symbols`: deduplicated by `name+file`.
      - Group callers by `viaSymbol`, deduplicate by `(file, symbol)`, sort by rank desc, then file asc, then line asc, cap at `maxPerSymbol`, set `truncated` if any group was cut.
      - Per symbol, `endpoints_affected`/`crons_affected` = sorted unique union of `factsByFile[caller.file]` over that symbol's callers, or `[]` when `factsByFile` is absent.
      - `downstream` holds only symbols that have callers. Order: best caller rank desc, then caller count desc, then name asc.
      - `counts.callers` = unique `(file, name)` across all symbols (Q3). `endpoints`/`crons` = unique across all symbols.
      - `summary` is English: `"{s} changed symbol(s) reach {c} caller(s), {e} endpoint(s) and {k} cron job(s)."`, or `"{s} changed symbol(s), no downstream callers found."`, or `"No indexed symbols in the changed files."`
    - `emptyBlast()` for the skip path.
  - **repository.ts**: `BlastRepository implements BlastStore`, copying `smart-diff/repository.ts:19-40`. `pullInWorkspace` selects `id, repoId, headSha` from `pullRequests` where the workspace **and** the id match. `changedPaths` selects `prFiles.path` where `prId`, ordered by path.
  - **service.ts**: `BlastService(deps: BlastDeps).forPull(workspaceId, prId): Promise<BlastRadiusResponse>`:
    1. Look up the pull, or `throw new NotFoundError('Pull request not found')`.
    2. `Promise.all([changedPaths, intel.indexState(repoId)])`.
    3. `reason = blastReason(...)`.
    4. Call `intel.blastRadius` **only** when `shouldQueryFacade`. This keeps the facade's clone-parsing fallback off the hot path.
    5. If the facade result still has `degraded === true`, set `reason` from `result.reason` (mapped through the same validity check, default `'no_data'`).
    6. Assemble the envelope: `index.degraded = reason !== null`, `indexed_sha = lastIndexedSha || null`, `limits.max_callers_per_symbol = BLAST_LIMITS.maxCallersPerSymbol`, `counts.changed_files = paths.length`.
- Rules / skills: onion-architecture (ports core, service application, repository outer); drizzle-orm-patterns; security rule 5.
- Practices: the service gets ports through its constructor and never sees `Container`. No Drizzle in service or map. The repository returns domain types. The workspace check comes before every id-only read. See Design notes → "Why skip the facade" and "Reason mapping".
- Tests: `blast-map.test.ts` (pure) covers grouping; the per-symbol cap and `truncated`; ordering; per-symbol endpoint/cron attribution; unique-caller count across symbols; the three summary forms; every `blastReason` branch, including an unknown `degradedReason` → `'no_data'`. `blast-service.test.ts` uses an in-memory `BlastStore` + fake `BlastIntel`, following the pattern of `test/smart-diff-service.test.ts:21-40`. It covers: unknown PR → `NotFoundError`; flag off → `flag_off`, facade **not called**; status `degraded` with no row → `no_data`, facade not called; `partial` → facade called, `index_partial`, degraded true; `full` → degraded false, grouped map; empty `pr_files` → `changed_files: 0`, facade not called.
- Done when: both test files pass under `pnpm test:unit`, and `pnpm arch` reports no violations.

### Step 4: Route, container, registration, integration test, server docs (server)
- Files: create `server/src/modules/blast/routes.ts` · modify `server/src/platform/container.ts` (next to `smartDiffRepo`, ~line 190) · modify `server/src/modules/index.ts:28-41` · create `server/test/blast.it.test.ts` · modify `server/README.md:79` (module map: add `blast` `/pulls/:id/blast (GET)`).
- Change:
  - Container: add a lazy `blastRepo` getter and a `blastDeps` getter: `{ store: this.blastRepo, intel: { enabled: this.config.repoIntelEnabled, indexState: (id) => this.repoIntel.getIndexState(id), blastRadius: (id, files) => this.repoIntel.getBlastRadius(id, files) } }`. This is the precedent of `conventionsDeps.samples` at `container.ts:159`. Going through `this.repoIntel` keeps `ContainerOverrides.repoIntel` working in tests.
  - Route: `app.get('/pulls/:id/blast', { schema: { params: IdParams, response: { 200: BlastRadiusResponse } } }, async (req) => { const { workspaceId } = await getContext(container, req); return service.forPull(workspaceId, req.params.id); })`, the shape of `smart-diff/routes.ts:14-27`.
  - Register `blast` in `modules/index.ts`.
- Rules / skills: fastify-best-practices (zod params + response schema, no `.parse` in the handler, `server/AGENTS.md:39`), onion-architecture (routes thin), security rules 5 and 10.
- Practices: the route does schema → `getContext` → one service call. Errors surface as `AppError` only.
- Tests: `blast.it.test.ts` follows the pattern of `test/smart-diff.it.test.ts`: `startPg`, `seed`, repo + PR + `pr_files` rows, and `buildApp({ config, db, overrides: { repoIntel: fake } })` with a fake whose `getIndexState`/`getBlastRadius` are scripted and counted. It covers: 200 with a grouped map; `partial` → `index.reason === 'index_partial'`; no index → `no_data`, `getBlastRadius` call count 0; `REPO_INTEL_ENABLED: 'false'` in the config env → `flag_off`; PR from another workspace → 404; random uuid → 404; `not-a-uuid` → 422; PR with no `pr_files` → `counts.changed_files === 0`.
- Done when: `pnpm test:integration -- blast` passes with Docker running, and `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm arch` pass in `server/`. Run the it-test even if typecheck passes: server `INSIGHTS.md:316`.

### Step 5: Query key + hooks (client)
- Files: modify `client/src/lib/query-keys.ts` (add `blast: (prId) => ["pr", prId, "blast"] as const` under `pr`) · create `client/src/lib/hooks/blast.ts` · modify `client/src/lib/hooks/index.ts` (add `export * from "./blast"`) · create `client/src/lib/hooks/blast.test.tsx`.
- Change:
  - `useBlastRadius(prId, headSha)`: query key `[...keys.pr.blast(prId), headSha ?? null]`, `api.get<BlastRadiusResponse>(\`/pulls/${prId}/blast\`)`, `enabled: !!prId && headSha !== undefined`. This mirrors `hooks/intent.ts:17-23`, because `pr_files` is filled only by the detail GET.
  - `useBlastResync(prId, repoId)`: wraps `useResyncRepoIntel(repoId)`. On click it records the baseline `updatedAt` from `useRepoIntelStatus(repoId)`, then polls `useRepoIntelStatus(repoId, pending)`. When `updatedAt` differs from the baseline, it invalidates `keys.pr.blast(prId)` and stops polling. It gives up after 120 s and reports `timedOut`. It returns `{ start, pending, timedOut, failed }`.
- Rules / skills: client-src; `client/AGENTS.md:32` (no `fetch` in components); frontend-architecture (hooks central, keys from the factory).
- Practices: `import type` only from `@devdigest/shared` (client `INSIGHTS.md:12,40`). Never copy query data into state; only the baseline/pending flags are local state. The effect that invalidates on `updatedAt` change syncs with the query cache, so it is a legitimate effect. Invalidate through `keys`.
- Tests: `blast.test.tsx` mocks `../api` (pattern `hooks/reviews.test.tsx`; guard `path?.` per client `INSIGHTS.md:482`). It checks that the query waits for `headSha` and that resync → index-state `updatedAt` advances → blast is refetched.
- Done when: the tests pass and `pnpm typecheck` passes.

### Step 6: `BlastRadiusCard` and sub-components + i18n (client)
- Files: create under `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/BlastRadiusCard/`:
  - `BlastRadiusCard.tsx`, `index.ts`, `helpers.ts`, `helpers.test.ts`, `styles.ts`, `BlastRadiusCard.test.tsx`
  - nested `_components/BlastSummary/`, `BlastTree/`, `BlastGraph/`, `BlastDegradedNotice/`, each with `<Name>.tsx` + `index.ts`

  Modify `client/messages/en/blast.json`.
- Change: layout from `client/docs/design/src/blast.jsx` only; its mock numbers are wrong.
  - **Card**: `<section>` with `SectionLabel icon="Workflow"` + a bordered box styled like IntentCard's `s.card`.
    - `isPending` → `Skeleton` (client `INSIGHTS.md:476`).
    - `isError` → `ErrorState` with retry.
    - `changed_files === 0` → `EmptyState` "no files".
    - no `changed_symbols` and not degraded → `EmptyState` "no indexed symbols".
    - Otherwise: `DegradedNotice` (when `index.degraded`), then Summary + the view switcher (`tree`/`graph` buttons with `aria-pressed`), then Tree or Graph, then the truncated note.
  - **Summary**: four stats (`Code`, `CornerDownRight`, `Globe`, `Clock` icons) from `counts`, not recomputed.
  - **Tree**: one row per `downstream` item. The header is a real `<button aria-expanded>` holding the chevron, the symbol name in mono, and `callerCount`. The first item is open by default. Callers are `MonoLink` to `githubBlobUrl(repoFullName, headSha, file, line)` labelled `file:line`. If `repoFullName` or `headSha` is missing, render plain mono text. Endpoint chips are `Badge mono icon="Globe"` (accent); cron chips are `Badge mono icon="Clock"` (warn). When `downstream` is empty but symbols exist, show `noDownstream`.
  - **Graph**: pure SVG, no new dependency. A chip row of `<button aria-pressed>`, one per downstream symbol, selects which symbol is drawn (Q4). Layout comes from `helpers.ts` `graphLayout(item)`: root x=70, callers x=290, endpoints+crons x=500, row pitch 28, height grows with node count, labels cut to 16 chars with `…` and the full text in `<title>`. `<svg role="img" aria-label>` plus a legend.
  - **DegradedNotice**: warn-coloured box (`--warn`/`--warn-bg`, `AlertTriangle`) with a title, the reason text `degraded.reason.<reason>`, and a Resync `Button` using `useBlastResync`. Hide the button for `flag_off`. Show `resyncing`, `resyncTimeout` and `resyncFailed` states.
  - **i18n**: keep the existing keys. Add `card.label`, `card.errorTitle`, `card.errorBody`, `card.noFiles`, `card.noSymbols`, `view.ariaLabel`, `symbolPicker.ariaLabel`, `tree.endpoints`, `tree.crons`, `graph.legend.{symbol,callers,endpoints}`, `truncated` ("Showing the top {max} callers per symbol."), `degraded.title`, `degraded.reason.{flag_off,no_data,index_failed,index_partial,repo_too_large}`, `degraded.{resync,resyncing,resyncTimeout,resyncFailed}`, `linesAtIndex` (a note that lines come from the indexed default branch). `callerCount` may become ICU plural.
- Rules / skills: frontend-architecture (nested `_components`, `helpers.ts`, `styles.ts`), react-best-practices (derive in render, no render factories, stable keys `file:line:name`, `count > 0 &&`), client `AGENTS.md:33-35`, security rule 7.
- Practices: repo-derived text (symbol names, paths, endpoints) renders as JSX text only, never HTML. Links only via `githubBlobUrl` + `MonoLink` (already `rel="noopener noreferrer"`). Keep each component under ~200 lines. Styles go in `styles.ts` with design tokens. If `Badge` needs an accessible name, wrap it in a `<span aria-label>` (client `INSIGHTS.md:330`).
- Tests: `helpers.test.ts` for `graphLayout` (node counts, y spacing, truncation). `BlastRadiusCard.test.tsx` mocks `@/lib/api` (pattern `IntentCard.test.tsx:13-18`) and walks three flows:
  1. Full map: summary counts, the first symbol is open, a caller link `href` contains `/blob/<headSha>/`, toggling a second symbol, switching to graph, a chip changes the drawn symbol.
  2. Degraded `no_data`: the notice appears, clicking Resync POSTs `/repos/:id/resync`, and `flag_off` shows no Resync.
  3. GET error → `ErrorState`.
- Done when: the tests pass, and `pnpm lint` passes with no jsx-a11y errors.

### Step 7: Wire into OverviewTab + client README (client)
- Files: modify `.../OverviewTab/OverviewTab.tsx` · `.../OverviewTab/styles.ts` (comment only) · `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:145` · `client/README.md:34`.
- Change:
  - `OverviewTabProps` gains `repoId: string` and `repoFullName: string | null`.
  - Render `<BlastRadiusCard prId repoId repoFullName headSha />` as the second child of `s.grid`, after IntentCard. The `auto-fit` grid makes it two columns (client `INSIGHTS.md:244`); update the "reserved for L04" comment in `styles.ts`.
  - `page.tsx` passes `repoId` (route param) and `repoFullName` (`page.tsx:64`).
  - In the README, add `/pulls/:id/blast` and `/repos/:id/resync` to the PR row.
- Rules / skills: client-app-router; next-best-practices (the page stays a client component, no server fetching).
- Tests: existing Overview/page tests still pass. Where a test renders OverviewTab, update its props.
- Done when: `pnpm typecheck && pnpm lint && pnpm test` pass in `client/`.

### Step 8: API port, narrow schema, HTTP adapter, fake (mcp)
- Files: modify `mcp/src/api/schemas.ts`, `mcp/src/api/port.ts`, `mcp/src/api/http.ts`, `mcp/src/test-support/fake-api.ts`, `mcp/src/api/http.test.ts`.
- Change:
  - `schemas.ts`: add `BLAST_REASONS` (the same five strings) and `BlastResponseLite`, covering only the fields read: `blast{changed_symbols, downstream, summary}`, `head_sha`, `index{degraded, reason: z.enum(BLAST_REASONS).nullable()}`, `counts{changed_files, symbols, callers, endpoints, crons}`, `truncated`. Add the drift check `Assignable<BlastRadiusResponse, z.input<typeof BlastResponseLite>>` and export `BlastInfo`.
  - Port: `blast(prId, signal?): Promise<BlastInfo>` (`GET /pulls/:id/blast`, DB-only).
  - HTTP: `blast(prId, signal) { return this.get(\`/pulls/${seg(prId)}/blast\`, BlastResponseLite, signal) }`.
  - Fake: a `blastResponse: BlastInfo` field with a realistic default and `async blast()` calling `this.hit('blast')`.
- Rules / skills: mcp-src; `mcp/AGENTS.md` rules (types-only `@devdigest/shared`, rings).
- Tests: `http.test.ts`: the path is `/pulls/<encoded id>/blast`; a malformed body → `ApiError('server')`; 404 → `not_found`.
- Done when: `pnpm typecheck` passes in `mcp/`, and the drift check fails if a server field is renamed. Verify once by hand, then revert the test rename.

### Step 9: Domain, output schema, shaping, service (mcp)
- Files: modify `mcp/src/domain.ts`, `mcp/src/tools/outputs.ts`, `mcp/src/format.ts`, `mcp/src/service.ts`, `mcp/src/service.test.ts`, `mcp/src/format.test.ts`.
- Change:
  - `domain.ts`: `BlastReason` union and `BlastRadiusResult = { repo; pr; changed_symbols; downstream; summary; counts:{symbols,callers,endpoints,crons}; degraded; reason: BlastReason|null; truncated; next_step: string|null }`, written out in full. The file has no imports.
  - `outputs.ts`: keep `BlastRadiusOut` and its check against `BlastRadius`. Add `BlastRadiusResultOut = BlastRadiusOut.extend({...})` plus `Check<Equal<z.output<typeof BlastRadiusResultOut>, BlastRadiusResult>>`, and update the header comment.
  - `format.ts`: `toBlastResult(info, repo, pr)` clips every repo-derived string: name/symbol 120, file 200, kind 40, endpoint/cron 160, summary 300. Add `capBlastResponse` like `capResponse` (`format.ts:119-133`): drop trailing `downstream` entries until the result fits `DEFAULT_RESPONSE_CAP`, then set `truncated` and append a note.
  - `service.ts`: `getBlastRadius({repo, pr}, signal)`:
    1. `resolveRepo`.
    2. `resolvePull(..., { syncOnMiss: false })`.
    3. `api.blast(pull.id)`.
    4. If `counts.changed_files === 0`, throw `NextStepError` saying the PR has no changed files in DevDigest yet: open the PR in DevDigest, then call get_blast_radius again (Q5, no GitHub call).
    5. Build `next_step` from the reason (see Design notes → "MCP next_step").
    6. `truncated = server truncated || capped`.
- Rules / skills: mcp-src; `mcp/AGENTS.md` "LLM/PR text is data: clip()"; security rule 7.
- Tests: `service.test.ts` covers a happy path (same map, clipped), empty files → `NextStepError` text, `no_data` → non-error with `degraded:true` and `next_step`, and an unknown PR → the `resolvePull` error. `format.test.ts` covers that `capBlastResponse` drops the tail and sets `truncated`.
- Done when: `pnpm typecheck && pnpm test` pass in `mcp/`.

### Step 10: Register the real tool, instructions, contract, docs (mcp)
- Files: modify `mcp/src/tools/get-blast-radius.ts`, `mcp/src/server.ts:16-20`, `mcp/src/server.test.ts:11,187-200`, `mcp/src/contract.test.ts:52-55`, `mcp/src/__snapshots__/contract.test.ts.snap` (regenerate), `mcp/src/index.test.ts:66` (comment only if it mentions the stub), `mcp/AGENTS.md:5,47`, `docs/devdigest-mcp.md:48,64-78,92-94,103-111`.
- Change:
  - Tool: title `Get PR blast radius`. The description (≤ ~350 chars) names no other tool and says it is read-only, precomputed from the repo index, has no LLM, that callers' lines are at the indexed default branch, that `degraded`/`reason` flag a missing or partial index, and that repo text is returned as data. Add `outputSchema: BlastRadiusResultOut.shape`; the handler is `guard(ctx, () => ctx.service.getBlastRadius({repo, pr}, extra.signal))`. Delete `BLAST_RADIUS_NOT_IMPLEMENTED`.
  - `INSTRUCTIONS`: replace "a blast-radius tool that is not implemented yet" with a short phrase such as "map a PR's blast radius (changed symbols, callers, endpoints, crons)". Keep it ≤ 600 chars.
  - `contract.test.ts`: the advertised-schema list becomes `['run_agent_on_pr','get_findings','get_blast_radius']`. Update the budget comment.
  - Snapshot: regenerate with `pnpm test -- -u` on purpose and review the diff.
  - Docs: tools table row, a behaviour bullet (empty files → open the PR in DevDigest), paste the new `pnpm measure:tools` table, rewrite "The stub" as "Blast radius" (the envelope, degraded reasons, cap). In `mcp/AGENTS.md`, drop "stub" and list the three tools with an `outputSchema`.
- Rules / skills: mcp-src; `mcp/AGENTS.md` rules (descriptions never name tools; the budget is tested).
- Practices: run `pnpm measure:tools` **before** finalising the description. Limits: per tool ≤ 2,800 chars with an output schema, all tools ≤ 10,000 (current total is 7,537).
- Tests: `server.test.ts` replaces the stub block with: a success whose `structuredContent` parses with `BlastRadiusResultOut`, empty files → `isError` containing "open the PR", and bad `repo` → `isError`.
- Done when: `pnpm typecheck && pnpm lint && pnpm test` pass in `mcp/`, and the `measure:tools` output is pasted in the guide.

## Contracts & migrations
- Shared contracts sync: yes. `server/src/vendor/shared/contracts/brief.ts` → `./scripts/shared-contracts.sh sync`.
- Schema change + `pnpm db:generate`: no. Reads only: `pull_requests`, `pr_files`, and repo-intel tables through the facade.
- Spec `Status` update: no (no spec).

## Verification

| Package | Checks (from routing.json) |
|---|---|
| server | `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm arch` |
| client | `pnpm typecheck` · `pnpm lint` · `pnpm test` |
| mcp | `pnpm typecheck` · `pnpm lint` · `pnpm test` |

Extra checks: `./scripts/shared-contracts.sh check`, `cd mcp && pnpm measure:tools` (paste the output into `docs/devdigest-mcp.md`), and `cd server && pnpm test:integration` (at least `blast.it.test.ts`). Needs Postgres: yes (Docker) for the integration test. Use Node 22: `PATH=/opt/homebrew/opt/node@22/bin:$PATH`.
All of the above except integration: `./scripts/check-changed.sh`.

## Insights to record
- `server/src/modules/repo-intel/INSIGHTS.md` · What Doesn't Work: the persistent blast cap of 20 was global, not per symbol, so low-rank symbols lost every caller. Now counted per `viaSymbol`. (Where: `service.ts`, the new per-symbol loop in `tryPersistentBlast`.)
- `server/src/modules/repo-intel/INSIGHTS.md` · Codebase Patterns: `tryGetIndexState` never marks `partial` as degraded, and the facade never emits `index_partial`/`flag_off` from `getBlastRadius`. Consumers derive the reason from `getIndexState` + the flag (see `modules/blast/map.ts` `blastReason`). (Where: `repository.ts:227`.)
- `server/src/modules/repo-intel/INSIGHTS.md` · Codebase Patterns: blast is one hop. Endpoints/crons come from `file_facts` of the direct caller files only, and `BFS_DEPTH` is unused by blast. A helper imported only by services shows 0 endpoints. (Where: `service.ts:401`.)
- `server/src/modules/repo-intel/INSIGHTS.md` · Open Questions: callers importing through a barrel (`export *`) stay unresolved, because `decl_file` needs a unique import edge to an exported symbol. (Where: `repository.ts:427`.)
- `server/INSIGHTS.md` · Codebase Patterns: `modules/blast` calls `repoIntel.getBlastRadius` only for index `full`/`partial` with the flag on. The facade's fallback parses the clone (`readClone`, security gap G2) and always says `no_data`. (Where: `src/modules/blast/service.ts`, the `shouldQueryFacade` line.) Race closed with `persistentOnly` (see Design notes, "Why skip the facade").
- `server/INSIGHTS.md` · Codebase Patterns: `MAX_CALLERS_PER_SYMBOL` now lives in `@devdigest/shared` as `BLAST_LIMITS` so that `blast` and `repo-intel` share it without importing each other. (Where: `src/vendor/shared/contracts/brief.ts`, the `BLAST_LIMITS` line.)
- `client/INSIGHTS.md` · Codebase Patterns: blast caller links use the PR `head_sha` (user decision), while caller lines come from the index at `lastIndexedSha`, so a line can drift in files the PR itself edits. (Where: `BlastTree.tsx`, the `githubBlobUrl` call.)
- `mcp/INSIGHTS.md` · Codebase Patterns: supersedes "Only `run_agent_on_pr` and `get_blast_radius` advertise an `outputSchema`". Three tools now advertise one. `BlastRadiusResultOut` extends `BlastRadiusOut` with envelope fields, both drift-checked; record the measured chars. (Where: `src/tools/get-blast-radius.ts`, `src/contract.test.ts`.)

<!-- implementer-brief:end -->

## Affected modules

| Package | Path | Ring / layer | Change |
|---|---|---|---|
| server | `src/vendor/shared/contracts/brief.ts` | core | new envelope, enums, limit |
| server | `src/modules/repo-intel/{service,constants}.ts` | application / core | per-symbol cap; constant re-export |
| server | `src/modules/blast/{ports,map}.ts` | core / application | new |
| server | `src/modules/blast/service.ts` | application | new |
| server | `src/modules/blast/{repository,routes}.ts` | outer | new |
| server | `src/platform/container.ts`, `src/modules/index.ts` | composition root | wiring |
| client | `src/vendor/shared/**` | contracts copy | synced |
| client | `src/lib/{query-keys.ts,hooks/blast.ts}` | query layer | new key + hooks |
| client | `.../OverviewTab/**`, `page.tsx`, `messages/en/blast.json` | route components | new card + wiring |
| mcp | `src/api/*`, `src/test-support/fake-api.ts` | core / driven adapter | port method, schema, adapter |
| mcp | `src/{domain,format,service}.ts`, `src/tools/*`, `src/server.ts` | core / application / driving | tool implementation |
| docs | `docs/devdigest-mcp.md`, `mcp/AGENTS.md`, `server/README.md`, `client/README.md` | docs | update |

## Constraints honored

| Rule | Source | How the plan respects it |
|---|---|---|
| Imports point inward; ports narrow | onion-architecture; `server/INSIGHTS.md:204` | `blast/ports.ts` declares its own shapes; the container adapts the facade |
| Modules meet via port/shared only | onion-architecture P8; `server/INSIGHTS.md:223` | cap constant moved to `@devdigest/shared` |
| Contract edited server-side then synced | `AGENTS.md:60` | Step 1 sync + `check` |
| DB test suffix | `AGENTS.md:43`, `server/AGENTS.md:44` | `blast.it.test.ts` |
| No migration by hand | `AGENTS.md:67-70` | no schema change |
| Zod route schemas, no in-handler parse | `server/AGENTS.md:39` | Step 4 route |
| Workspace scoping | security rule 5 | `pullInWorkspace` + `getContext` |
| i18n, a11y buttons, no fetch in components | `client/AGENTS.md:32-35` | Steps 5–6 |
| MCP REST-only, clip, no tool names, budget | `mcp/AGENTS.md` | Steps 8–10 |
| `BlastRadius`/`PrBrief` unchanged | brainstorm option 2 | the envelope wraps it |

## Design notes

### Why skip the facade
`getBlastRadius` falls back to `codeIndex` + `readClone` + `extractEndpoints` whenever the persistent path returns null (`service.ts:248-327`). That parses the clone at request time, which violates P2 "no re-parse", touches security gap G2, and always labels the result `no_data`. The blast service therefore reads `getIndexState` first and calls the facade only for `full`/`partial` with the flag on. A race (the index row changes between the two reads) used to be able to reach the fallback; it is now closed: the facade's `getBlastRadius` takes `opts.persistentOnly`, `container.blastDeps` always passes it, and the facade then returns the empty degraded `no_data` instead of the clone path. The service still honours `result.degraded`.

### Reason mapping

| Condition | `index.reason` | `degraded` |
|---|---|---|
| `REPO_INTEL_ENABLED=false` | `flag_off` | true |
| no index row (synth `degraded`/`no_data`) | `no_data` | true |
| `failed` | `index_failed` | true |
| `degraded` with stored reason | stored reason (valid enum), else `no_data` | true |
| `partial` | `index_partial` | true (map still shown) |
| `full` | null | false |

`repo_too_large` stays in the enum for forward compatibility; nothing sets it today.

### Envelope instead of extending `BlastRadius`
Extending `BlastRadius` would change `PrBrief` and break the exact `BlastRadiusOut` drift check. The envelope is additive. `counts` are computed server-side, so the UI, the MCP tool and the tests agree on Q3 (unique `(file, name)`). `limits` carries the cap to the UI as data. `head_sha` is included so the MCP result and links agree with Q1.

### MCP result shape
`BlastRadiusResultOut` = the `BlastRadius` fields + `repo`, `pr`, `counts`, `degraded`, `reason`, `truncated`, `next_step`. The map is the same as the route's. The only difference is clipping of repo text and, for oversized responses, dropping trailing (lowest-ranked) symbols, flagged via `truncated`. Estimated definition size is ~1.9k chars, total ≈ 8.7k of the 10k budget. Unmeasured; run `measure:tools`.

### MCP next_step
- `flag_off`: repo intelligence is disabled on this DevDigest server (`REPO_INTEL_ENABLED=false`); enable it and resync the repo.
- `no_data` / `index_failed` / `repo_too_large`: the repo index is missing or failed; press Resync in the PR's Blast radius block in DevDigest, then call get_blast_radius again.
- `index_partial`: the index is partial and callers may be missing; resync the repo in DevDigest for a full map.
- Server `truncated`: only the top callers per symbol are listed.
- Otherwise null.

### Tests location
The brief suggested `map.test.ts` beside the module. Server tests live in `server/test/` (smart-diff and intent precedent), so the plan uses `server/test/blast-*.test.ts`.

### Demo PR (filming note)
The demo PR touches `server/src/modules/_shared/context.ts`. Keep `getContext` exported under the same name, and make a harmless edit such as a comment or an internal tweak. At one hop this should give ≥2 callers and ≥1 endpoint. Before filming, verify on the live instance, not in tests:
1. `GET /repos/<repoId>/index-state` → `status: "full"` (not `partial`/`degraded`), and `lastIndexedSha` = the fork's current default-branch head. `REPO_INTEL_ENABLED` is not `false` in `server/.env`. If needed, press Resync and wait until `updatedAt` advances.
2. Open the demo PR page once, so `pr_files` is filled and `head_sha` is refreshed.
3. `GET /pulls/<prId>/blast`:
   - `blast.changed_symbols` contains `getContext`.
   - The `downstream` entry for `getContext` has ≥2 callers. Callers resolve only if `references.decl_file` was resolved through the `../_shared/context.js` import edge (the `.js` → `.ts` mapping) to a unique exported symbol. Unverified.
   - That entry's `endpoints_affected` has ≥1 value. This requires `file_facts.endpoints` to be populated for the route files, i.e. `extractEndpoints` must match the multi-line `app.get(\n '/…'` form used in `routes.ts`. Unverified.
   - `index.degraded === false`.
4. A caller link opens the right file at the PR head (caller files are not moved by the PR).
5. For the MCP part of the demo, the PR must have been opened in DevDigest first. Otherwise the tool correctly answers with the "open the PR" error.
6. Keep `SEED_DEMO=false`; do not show the demo repo.

If step 3 yields 0 endpoints, pick another exported symbol imported directly by a `routes.ts` file (a helper imported only by services shows 0 endpoints at one hop, by design).

## Risks & open questions
- The live-index claims for `_shared/context.ts` (resolved callers, endpoints from multi-line `app.get`) are inference; see the Demo PR checklist.
- Caller line numbers are valid at `lastIndexedSha`, but links pin `head_sha` (Q1). In files the PR edits, lines can drift. Documented in INSIGHTS, not fixed.
- Symbols added by the PR are not in the index (built from the default branch), so they show no callers. The UI copy `card.noSymbols` / `linesAtIndex` explains it; no per-file "not indexed" marker.
- The facade groups by `viaSymbol` name only. Two changed symbols with the same name in different files merge into one downstream entry (current facade semantics).
- The resync completion signal uses `updatedAt` advancing. If a resync job fails before writing a row, the UI times out after 120 s and shows `resyncTimeout`.
- The MCP output-schema size is estimated, not measured; `measure:tools` numbers in docs must be pasted from a real run.

## Handed off
- Architecture reviewer: `blast/ports.ts` structural types vs the facade types (structural satisfaction in `container.ts`); moving `MAX_CALLERS_PER_SYMBOL` into `@devdigest/shared`; the `blastDeps` function-port wiring; the client `useBlastResync` effect that invalidates on `updatedAt`; the MCP `BlastRadiusResultOut` extending `BlastRadiusOut`.
- Security reviewer: `GET /pulls/:id/blast` workspace scoping (`pullInWorkspace` + `getContext`); no path to `readClone` from the new route when the index is not `full`/`partial` (gap G2); rendering of repo-derived symbol names, paths and endpoints in the client (JSX text only, links via `githubBlobUrl`); MCP `clip()` on every repo-derived string and the response cap; error text from the new route leaks nothing beyond `AppError`.
