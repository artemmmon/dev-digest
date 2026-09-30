# Brainstorm: Blast Radius (HW4): Overview block and MCP `get_blast_radius`

Status: chosen: option 2
Spec: none (no blast spec in `specs/`; the highest existing one is `specs/09-smart-diff.md`)

**User answers (2026-09-30):** option 2 · Q1 link target = PR `head_sha` · Q2 demo PR touches `server/src/modules/_shared/context.ts` · Q3 callers count = unique `(file, name)` across all symbols · Q4 graph = selected symbol + chip-row switcher · Q5 MCP with empty `pr_files` = error telling the caller to open the PR in DevDigest (no GitHub network) · Q6 no spec, the plan is enough.

## Problem

Show the precomputed repo-intel blast radius of a PR in two places:

1. A "Blast radius" block on the PR Overview tab: a summary row, a collapsible tree per changed symbol with its callers as `file:line` GitHub links and its endpoint/cron chips, a Tree/Graph switcher, and a degraded marker with its reason plus a Resync button.
2. The MCP tool `get_blast_radius`, which must return the same map.

Both read one new server route, `GET /pulls/:id/blast`. It is validated by the `BlastRadius` contract, calls no LLM and does no re-parse. Scope chosen by the user: P1 + P2 + P3, with "Prior PRs touching these files" skipped. The design has no degraded / empty / Resync states; style them from existing tokens.

## Context found

**Server: facade behaviour (the main risks are here)**
- **Fact:** `getBlastRadius` goes to the persistent index only when `deps.enabled` is set and the changed-file list is not empty. Otherwise it falls back to `codeIndex.symbols` plus `readClone` and `parser.extractEndpoints` over the clone, always tagged `degraded:true, reason:'no_data'` (`server/src/modules/repo-intel/service.ts:248-259`, `:269`, `:316-318`, `:326-327`).
  - **Inference:** the fallback parses the clone on the hot path (a "no re-parse" P2 violation) and reports `no_data` when the real cause is that the flag is off.
- **Fact:** the persistent path runs for status `full` or `partial` (`service.ts:344-345`) and always returns `degraded:false` (`service.ts:363`, `:413`). `tryGetIndexState` marks only `degraded` and `failed` as degraded; a `partial` row gets no flag (`repository.ts:224-241`).
  - **Inference:** the facade never emits `index_partial`. The "incomplete index" marker has to come from `getIndexState`, not from `BlastResult.degraded`.
- **Fact:** `repo_too_large` appears only in the type union (`types.ts:27-32`). No code sets it.
- **Fact:** the persistent path sorts callers by rank and then applies `callers.slice(0, MAX_CALLERS_PER_SYMBOL)` to the whole flat list (`service.ts:396`, `:411`). `getResolvedCallers` has no ORDER BY or LIMIT (`repository.ts:524-552`). The fallback has no cap.
  - **Inference:** the "per symbol" cap of 20 is really a global cap of 20; later symbols can lose every caller.
- **Fact:** `BFS_DEPTH` is used only by `getCriticalPaths` (`service.ts:711`). Blast is one hop: endpoints and crons come from `file_facts` of the direct caller files only (`service.ts:401-406`, `repository.ts:555-570`).
- **Fact:** `references.decl_file` is resolved only through an import edge to an exported symbol, and only when that match is unique (`repository.ts:427-445`).
  - **Inference:** the declaring file is structurally excluded on the persistent path (the fallback excludes it explicitly, `service.ts:298`). Callers importing through a barrel (`export *`) stay unresolved.
- **Fact:** `getIndexState` always answers. With no row it returns `status:'degraded', degradedReason:'no_data'` (`service.ts:214-231`). The flag is `config.repoIntelEnabled` via `container.repoIntelDeps.enabled` (`server/src/platform/container.ts:268`).

**Server: data sources and contracts**
- Changed-file source: `pr_files(path, additions, deletions, patch)`, no status column (`server/src/db/schema/pulls.ts:36-49`). Filled on the first `GET /pulls/:id` (`server/INSIGHTS.md:39-44`), which also refreshes `head_sha` (`server/INSIGHTS.md:346-350`).
- The index is built from the clone at the default branch (`lastIndexedSha`), not from the PR head (`repo-intel/README.md:3-7`, `service.ts:138-146`). Symbols added by the PR are not indexed and have no callers; caller line numbers are valid at `lastIndexedSha`.
- `BlastRadius` = `{changed_symbols, downstream[{symbol, callers[{name,file,line}], endpoints_affected, crons_affected}], summary}` (`server/src/vendor/shared/contracts/brief.ts:132-160`), embedded in `PrBrief` (`brief.ts:232-237`), unused by server code.
- Precedents: envelope `PrIntentResponse {intent, stale, current_head_sha}` (`brief.ts:99-104`); shared limits `INTENT_LIMITS` (`brief.ts:107`); `repo-intel/constants.ts` re-exports core constants (`:11,14`).
- `smart-diff` is the template for a PR-scoped read module (thin route, narrow `SmartDiffStore` port, `NotFoundError` from `pullInWorkspace`, repository reads `pr_files`). Cross-module table reads are accepted (`server/INSIGHTS.md:328-333`); a `ports.ts` must not import another module (`server/INSIGHTS.md:200-205`).
- New modules are registered statically (`server/src/modules/index.ts:28-41`); the container exposes `repoIntel` (`container.ts:246-249`).

**Test-PR suitability**
- `reviews/helpers.ts` is imported by `reviews/service.ts`, `findings.ts`, `run-executor.ts`, `experiments/api-contract-experiment.ts`; `diff-viewer/helpers.ts` by `FileCard.tsx`, `CodeLine.tsx`. None registers `app.get(...)`, so at one hop both show ≥2 callers but **0 endpoints** (fails P1 "≥1 endpoint").
- `getContext` in `server/src/modules/_shared/context.ts` is used in 13 files, including route files that register `app.get('/…')`. A PR touching `_shared/context.ts` meets "≥2 callers and ≥1 endpoint" at one hop (inference until the live index is checked).

**MCP**
- REST only, loopback-only URL, no secrets, `@devdigest/shared` types only (`mcp/AGENTS.md`; `mcp/src/config.ts:11,42`).
- Stub always returns `isError`, no `outputSchema`, `readOnlyHint:true` already set (`mcp/src/tools/get-blast-radius.ts:5-27`).
- `BlastRadiusOut` has an exact-equality drift check against `BlastRadius` (`mcp/src/tools/outputs.ts:89-103`, `:117`); plan 05 says to add `outputSchema: BlastRadiusOut.shape` (`docs/plans/05-devdigest-mcp.md:242`).
- Budgets: 2,800 chars per tool with output schema, 600 for instructions (`mcp/src/contract.test.ts:19-26`). `server.ts:19` instructions say "not implemented yet"; `index.test.ts:66` expects the stub `isError`.
- `resolvePull` with `syncOnMiss:false` gives a next-step error for an unknown PR (`mcp/src/resolve.ts:32-44`); `refreshPull` exists on the port (`mcp/src/api/port.ts:25-26`).

**Client**
- `OverviewTab` takes `{prId, prBody, headSha}`, renders `IntentCard` + description (`.../OverviewTab/OverviewTab.tsx:9-31`); `page.tsx` has `repoFullName` (`:64`) and passes `pr.head_sha` (`:145`).
- Hooks `useRepoIntelStatus` and `useResyncRepoIntel` exist (`client/src/lib/hooks/repo-intel.ts:32-50`); `usePrIntent` keys on `headSha` (`hooks/intent.ts:17-23`).
- `githubBlobUrl` encodes path segments (`client/src/lib/github-urls.ts`). `blast.json` lacks keys for degraded, reason, resync, loading, error.
- UI kit: `Badge`, `MonoLink`, `SectionLabel`, `EmptyState`, `Skeleton`, `ErrorState`, `Tabs`. No graph library in `client/package.json`.
- Design graph draws only `downstream[0]` (`blast.jsx:54-55`); tree opens the first symbol by default (`blast.jsx:27`). Design mock data is inconsistent (declaring-file caller in `data.jsx:78`; "14 callers" vs 6 listed) — layout only, not semantics.

## Options

**1: Thin mapper, facade as is (baseline).** New `modules/blast/` calls `repoIntel.getBlastRadius`, maps flat callers → grouped downstream. Extend `BlastRadius` with optional `degraded`/`reason`. Server builds English `summary`; client computes counts. One client component. MCP calls the route.
Pros: smallest change. Cons: `partial` shows as complete; flag-off shows as `no_data`; unindexed repo triggers clone parsing; global cap drops symbols; suggested demo PRs show 0 endpoints; extending `BlastRadius` changes `PrBrief` and `BlastRadiusOut`.

**2: Blast service composes facade + index state + flag, behind a response envelope (recommended).** `modules/blast/` with ports `BlastStore` (pull in workspace: repo_id, head_sha, pr_files paths) and narrow `BlastIntel` (`getBlastRadius`, `getIndexState`) + `enabled` flag. Service checks index state first; if flag off or status not full/partial → empty map with reason, **no facade call** (no clone parse). Otherwise call the facade and group with a pure `toBlastRadius()` (per-symbol `MAX_CALLERS_PER_SYMBOL`, symbols sorted by best caller rank, endpoints/crons attributed per symbol from `factsByFile`, English `summary`). Reason mapping: no row → `no_data`; `failed` → `index_failed`; `degraded` → stored reason; `partial` → `index_partial`; flag off → `flag_off`. One facade fix: move the `slice` to per symbol (`service.ts:411`). New core contract `BlastRadiusResponse = { blast: BlastRadius, index: { status, degraded, reason|null, indexed_sha }, limits: { max_callers_per_symbol }, counts: { symbols, callers, endpoints, crons } }`; `BlastRadius` untouched. Client: `BlastRadiusCard/` with `BlastSummary`, `BlastTree`, `BlastGraph` (pure SVG), `BlastDegradedNotice` (reuses `useResyncRepoIntel`); hook `useBlastRadius(prId, headSha)`. MCP: `blast(prId)` port method, HTTP adapter with narrow schema, service returns map + `degraded`, `reason`, `next_step`.
Pros: all P1/P2 degraded rules met without guessing; additive contract; pure testable mapper; limits reach the UI as data. Cons: one small edit in repo-intel; two reads per request. Risk: one hop gives 0 endpoints on `reviews/helpers.ts`, so the demo PR must touch something like `_shared/context.ts`.

**3: Option 2 + two-hop endpoint/cron attribution with `BFS_DEPTH`.** Adds a facade read (`getImporterFacts(repoId, callerFiles, BFS_DEPTH)`) walking reverse `file_edges`; endpoints/crons become transitive with direct/indirect marking in the contract.
Pros: endpoints for deep helpers, actually uses `BFS_DEPTH`. Cons: bigger repo-intel change; an import edge is not a call, so indirect endpoints over-claim and need a marker the design lacks; `getEdges` loads every edge (`repository.ts:453-458`) or needs recursive SQL. Risk: fan-out on hub files; extra contract shape to sync to client and MCP.

**4: Move the view into the facade.** `RepoIntel.getBlastRadiusView(repoId, files)` returns `BlastRadius` + degraded/reason; fix reason and cap inside `tryPersistentBlast`; `modules/blast/` shrinks to route + `pr_files` lookup.
Pros: one owner of blast semantics. Cons: pulls a wire contract and presentation text into the indexer (`repo-intel/README.md:9-12`); mapping test lands in repo-intel; fallback still parses the clone. Risk: changes facade semantics other lessons reuse.

## Rejected upfront

| Option | Rule broken | Source |
|---|---|---|
| MCP reads Postgres or imports the server `blast` module directly | MCP drives the API over REST only, no secrets, types-only shared import | `mcp/AGENTS.md` |
| Edit `client/src/vendor/shared/contracts/brief.ts` directly | Server copy is canonical; client copy only via `./scripts/shared-contracts.sh sync` | root `AGENTS.md` |
| Route returns raw `BlastResult`, client groups it | P2: response validated by `BlastRadius`; mapping server-side and unit-tested | user brief |
| Route handler does the grouping inline | Routes stay thin | onion-architecture skill |

Sub-choice folded into options 2–4: **pure SVG graph** instead of a graph library (design is hand-positioned SVG; no graph dep today; ≤20 nodes per symbol).

## Criteria & weights

Acceptance fit 5 · Architecture/conventions fit 4 · Scope/effort 3 · Risk/reversibility 3 · Testability 3 · Security surface 2.

## Scoring matrix

| Option | Acceptance (5) | Arch (4) | Effort (3) | Risk (3) | Testability (3) | Security (2) | Weighted total |
|---|---|---|---|---|---|---|---|
| 1 Thin baseline | 2 | 3 | 5 | 3 | 4 | 4 | **66** |
| 2 Compose + envelope | 4 | 5 | 3 | 4 | 5 | 4 | **84** |
| 3 Plus two-hop | 5 | 4 | 2 | 3 | 4 | 4 | **76** |
| 4 View in facade | 4 | 3 | 3 | 3 | 4 | 4 | **70** |

## Sensitivity

- Acceptance weight 5→4: option 2 = 80, 3 = 71, 4 = 66, 1 = 64. Option 2 still wins.
- Acceptance weight 5→6: option 2 = 88, 3 = 81. Option 2 still wins.
- Flip: if the demo PR *must* be `reviews/helpers.ts` or the diff-viewer helpers, option 2's acceptance drops to 3; at weight 6 it is 82 vs 81 (near tie); at weight ≥7 option 3 wins.
- Architecture weight 4→3: option 2 = 79, option 3 = 72. No change.

## Recommendation

**Option 2.** Flips: endpoints required for helpers ≥2 imports from a route → option 3; correct blast semantics for all future facade consumers → option 4; no edits inside `repo-intel/` allowed → option 2 without the facade fix, documenting the global cap of 20 as a known limit.

## For the planner

**Modules**
- New: `server/src/modules/blast/` (`routes.ts`, `service.ts`, `ports.ts`, `repository.ts`, pure `map.ts` + `map.test.ts`); register in `server/src/modules/index.ts:28-41`, wire in `container.ts` next to `smartDiffRepo` (`:190`).
- Edit: `repo-intel/service.ts:411` (per-symbol cap); `server/src/vendor/shared/contracts/brief.ts` (`BlastRadiusResponse`, optional `BLAST_LIMITS`), then `./scripts/shared-contracts.sh sync`.
- Client: `client/src/lib/hooks/blast.ts` + `keys.pr.blast` in `query-keys.ts:31-32`; `OverviewTab/_components/BlastRadiusCard/…`; `OverviewTab.tsx` needs `repoFullName` from `page.tsx:64`; new keys in `client/messages/en/blast.json` (degraded, reasons, resync, loading, error, summary, truncated, symbol picker).
- MCP: `api/port.ts`, `api/http.ts`, `api/schemas.ts` (narrow schema + drift check), `domain.ts`, `service.ts`, `tools/get-blast-radius.ts` (add `outputSchema`), `tools/outputs.ts:89-117`, `server.ts:19` instructions, `contract.test.ts` snapshot, `index.test.ts:66`, `docs/devdigest-mcp.md:48,92,105-106`.

**Constraints**
- Routes thin; `ports.ts` must not import `repo-intel` types (narrow shapes); run `pnpm arch`.
- Contracts: edit server copy then sync; if `BlastRadius` changes, `BlastRadiusOut` must change (exact-equality drift check).
- DB-touching tests end in `.it.test.ts`.
- MCP tool definition ≤ 2,800 chars with `outputSchema`; run `pnpm measure:tools`; descriptions must not name other tools; `clip()` symbol names, paths, endpoints (third-party repo text).
- Client hook keys on `headSha` like `usePrIntent` (`pr_files` filled only by the detail GET); after Resync invalidate blast query when `lastIndexedSha` advances (`hooks/repo-intel.ts:27-31`).
- No hardcoded UI text; interactive tree rows are real `<button>` (`client/AGENTS.md`).

**INSIGHTS to respect:** `server/INSIGHTS.md:39-44`, `:346-350`, `:328-333`; `mcp/INSIGHTS.md` (drift checks; `isError` skips `outputSchema` validation; output-schema budget); `repo-intel/INSIGHTS.md` is empty — record global-cap, partial-not-degraded, one-hop findings there.

**Open questions for the user**
1. Link target for callers: 1 = PR `head_sha` / 2 = index `lastIndexedSha` (exact lines) / 3 = head sha with indexed-sha fallback.
2. Demo PR: 1 = touch `server/src/modules/_shared/context.ts` (one hop, gives endpoints) / 2 = keep `reviews/helpers.ts` and accept option 3's two-hop work / 3 = both.
3. Callers count: 1 = unique caller `(file, name)` across all symbols / 2 = sum of per-symbol callers.
4. Graph view scope: 1 = selected symbol only (as design) / 2 = all symbols in one SVG / 3 = selected symbol + picker chip row.
5. MCP when `pr_files` is empty: 1 = call `refreshPull` first / 2 = error telling the caller to open the PR in DevDigest / 3 = empty map with `reason:no_data`.
6. Write `specs/10-blast-radius.md` before the plan: 1 = yes / 2 = no.

## Not found
- No code sets `repo_too_large` (`types.ts:27-32` only).
- Not verified against a live DB: whether this repo's index resolves `decl_file` for `getContext` callers; the one-hop endpoint claim for `_shared/context.ts` is inference.
- Exact char cost of `BlastRadiusOut` as `outputSchema` (plan 05 estimated ~940).
- Whether new files in a PR (not in the index) should be shown as "changed, not indexed" — `pr_files` has no status column.
