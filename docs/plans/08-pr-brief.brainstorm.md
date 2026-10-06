# Brainstorm: PR Brief (Why + Risk brief on the Overview tab)
Status: chosen: option 2
Spec: specs/12-pr-brief.md (SPEC-12, `Status: approved`)

## Problem
SPEC-12 adds an on-demand PR Brief block to the Overview tab: a summary, Risk areas (title + file), and a Review focus list (`file:line — reason`) that opens Files changed at that line. It costs exactly one bounded structured model call (at most 8,000 tokens, no diff hunk bodies), is stored per pull request with the head SHA, and is shown again after reload with no model call. The user has decided OQ-1: one generation is one structured call that may re-ask the model at most once, and each request is logged.

The spec fixes the behaviour and the wire contract. It does not fix **where the server-side brief lives and how it reads the facts that other modules already own** (stored intent, blast radius, role groups, project documents, hunk headers, the linked issue). That is the real choice below. The client side (PR Brief block, banner, Risk areas, Review focus, jump to Files changed) has one sensible shape under every option, so it is not scored.

Tags: **fact** = seen in the source in this run; **inference** = my conclusion.

## Context found

Architecture rules that bound the options
- **fact** `modules/<m>/` may import another module only through its `index.ts` / `types.ts`, or through a port wired in `platform/container.ts` (rule `no-cross-module-internals`); `modules/_shared/` is exempt (`.claude/skills/onion-architecture/assets/dependency-cruiser.cjs:121-131`). Application code may not import `src/db/`, `src/adapters/`, `js-tiktoken` or Fastify (`:84-110`).
- **fact** Precedent for sharing a pure helper: the glob matcher moved to `modules/_shared/glob.ts`, and the old file re-exports it so existing callers and tests keep working (`server/INSIGHTS.md:352-364`).
- **fact** `smart-diff/index.ts` publicly exports `classifyFile` (role group per path) and the role order (`server/src/modules/smart-diff/index.ts:7-8`).
- **fact** The server assumes a single API instance; the job queue and the run bus are in memory (`server/AGENTS.md:53`).
- **fact** The `pr_brief` table already exists: `pr_id` primary key (cascade on the pull request) plus `json jsonb` (`server/src/db/schema/reviews.ts:116-120`, `server/src/db/migrations/0000_init.sql:211`, FK at `:386`). Nothing in `server/src` or `mcp/src` reads it (rg over `src`, `mcp/src`, `reviewer-core/src` found no use outside the vendored contracts).
- **fact** `PrBrief` in the shared contract today is `{ intent, blast, risks, history }` (`server/src/vendor/shared/contracts/brief.ts:269`); `Risk.kind` is `z.string()` (`:203`) while the enum the spec requires already exists as `RiskAreaKind` (`:36`). The client exports `PrBrief` only as a type (`client/src/lib/types.ts:34`). **inference** changing the shape breaks no consumer in `server/src`, `mcp/src` or `reviewer-core/src`; both copies must be synced with `./scripts/shared-contracts.sh sync` (root `CLAUDE.md`, "Cross-package rules").

Facts the brief needs, and who owns them today
- **Stored intent + stale**: `IntentService.get` returns `{ intent, stale, current_head_sha }` (`server/src/modules/intent/service.ts:53-60`). `IntentRepository.context` returns pull, repo, files (`path`, `patch`) and the stored row (`intent/repository.ts:55-83`). The intent stores are workspace-scoped.
- **Blast radius**: `BlastService.forPull` returns the card's data, including the degraded reason and `changed_symbols` (`server/src/modules/blast/service.ts:15-71`). It logs one line per call (`:46-61`). It is built inside `blast/routes.ts` with `app.log`, not in the container; the container exposes only `blastDeps` (`server/src/platform/container.ts:237-249`, `blast/routes.ts:15`).
- **Role groups + per-file stats**: `SmartDiffService.forPull` returns groups of files with `additions` / `deletions` (`smart-diff/service.ts:31-42`, contract `brief.ts:237`); also built in its route (`smart-diff/routes.ts:15`). `pr_files` holds `path`, `additions`, `deletions`, `patch` (`server/src/db/schema/pulls.ts:36-49`).
- **Hunk headers**: `extractHunkHeaders` (5 per file, 120 chars) lives in `intent/hunks.ts:21`; its limits come from the shared `INTENT_LIMITS` (`brief.ts:107`, `maxHunkHeadersPerFile`, `hunkHeaderChars`). It is private to the intent module (no `index.ts` there; `ls server/src/modules/intent`).
- **New-side changed line ranges**: no server helper does this per file. `parseUnifiedDiff` in reviewer-core fills `newLineNumbers` per hunk and counts context lines as covered (`reviewer-core/src/diff.ts:62-74`); it is exported (`reviewer-core/src/index.ts:29`). **inference** AC-47 "changed range" will mean the hunk's new-side range (context included) unless the user says otherwise (open question 3).
- **Linked issue**: the intent rule uses GitHub closing issues only when `pull.base === repo.defaultBranch`, else regex refs from title/body/branch (`intent/service.ts:263-298`); `extractIssueRefs` is in `intent/links.ts:30-48`, private to intent. **inference** AC-25 as written reads closing issues regardless of the base branch (open question 4).
- **Candidate documents (AC-28)**: `AgentsRepository.contextUsedBy` already returns path → number of distinct receiving agents, counting direct rows and enabled skills (`agents/repository.ts:491-519`). `ProjectContextService` has `list`, `content`, `listPaths`, `resolveForRun` (`project-context/service.ts:26,52,66,86`) but nothing that returns the ordered candidate texts. **inference** a new additive method on `ProjectContextService` is needed; `list` reads every document and `content` re-runs discovery per call, so neither fits the 3,000-token loop.
- **Tokenizer, model, key errors**: the container exposes `tokenizer` (`container.ts:366`) and `resolveFeatureModel(settingsRepo, ws, 'risk_brief')` with the default `openrouter` / `deepseek/deepseek-v4-flash` (`settings/feature-models.ts:42-52`, id registered at `vendor/shared/contracts/platform.ts:17,60`). A missing key throws `ConfigError` (`container.ts:434-451`). The intent service shows the call shape and the untrusted wrapper (`intent/service.ts:185-203`, `intent/prompt.ts:3`, `wrapUntrusted` at `reviewer-core/src/prompt.ts:30-34`).
- **Re-ask**: all three providers re-prompt on a contract failure inside `completeStructured` and return `attempts`; `maxRetries` limits only those re-prompts and `transportRetries: 0` is needed to stop hidden HTTP retries (`server/src/vendor/shared/adapters.ts:52-86`, `server/INSIGHTS.md:490-491`, `server/src/adapters/llm/openai.ts:88-130`, `reviewer-core/src/llm/openrouter.ts:83-101`). `tokensIn` / `tokensOut` are summed across attempts. A per-request log hook does not exist; I found no logging calls in `openai.ts` or `anthropic.ts` (rg), and did not open the rest of `openrouter.ts`.
- **Rate limit and route shape**: `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }` is the precedent for the generate route (`intent/routes.ts:26-30`); the intent routes are `GET` (stored + stale, no model) and `POST` (derive) on `/pulls/:id/intent` (`intent/routes.ts:14-37`).
- **No in-flight dedup exists** for per-key work: the only in-flight handling found is the run list and the per-key job chain (`reviews/service.ts:84`, `platform/jobs.ts:57-59`). **inference** AC-8 needs a small in-memory single-flight map keyed by pull request, which the single-instance assumption allows.

Client facts (same under every option)
- **fact** The Overview tab renders `IntentCard` and `BlastRadiusCard` side by side (`client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx:23-34`). The tab lives in the query string and `useSearchParamState` replaces the history entry (`client/src/lib/use-search-param-state.ts:11-33`); AC-82 (back returns to Overview) therefore needs a navigation that adds an entry. **inference** this is a client detail for the planner.
- **fact** The PR list already carries `score` and `findings_by_severity` of the latest round (`server/src/vendor/shared/contracts/platform.ts:217-223`), and the "latest round" rule is one shared helper (`server/INSIGHTS.md:369-376`). **inference** the banner (AC-61..65) can reuse existing client queries.
- **fact** `DiffTab` keeps its own state (`order`, comment toggle) and no `file` / `line` handling (`DiffTab/DiffTab.tsx:57-61`).

Prior plans
- **fact** `docs/plans/06-project-context.brainstorm.md` and `docs/plans/02-intent-layer.md` chose a narrow port from the consuming module into a new module, fail-open reads, and the container as the only wiring point. No earlier plan covers a brief.

## Options

All options 2–4 share these **common decisions** (each is a structural choice that does not separate the options; the alternative is given so the user can object):

- **S1 Storage**: reuse `pr_brief` (`pr_id` PK, `json`). The PK gives "one stored brief" (AC-9, NFR-13); read does `PrBrief.safeParse` and answers `null` on a mismatch (AC-58; same pattern as `intent/repository.ts:20-26`). Alternative: a typed table like `pr_intent` (columns, `numeric` cost) — needs `pnpm db:generate`, adds nothing the spec asks for.
- **S2 Contract**: extend `PrBrief` in `server/src/vendor/shared/contracts/brief.ts`, make `intent`/`blast`/`history` optional, type `Risk.kind` as `RiskAreaKind`, add `PrBriefResponse` (`brief`, `stale`, `current_head_sha`) and a separate model-answer schema with only `summary`, `risks[]`, `review_focus[]`; then sync to the client copy.
- **S3 Single flight**: an in-memory `Map<prId, Promise<PrBrief>>` in the service; a second generate request awaits the same promise (AC-8). Alternative: a DB pending row or a job with `serializeBy` — heavier, and the spec's sequence has the generate request return the finished brief.
- **S4 Re-ask**: pass `maxRetries: 1` and `transportRetries: 0` to `completeStructured` (at most two HTTP requests). See open question 2 for how "each request is logged" is met.
- **S5 Budget loop**: a pure helper builds the request from sections, counts it with the injected `Tokenizer`, and removes sections in the AC-35/36 order, recording the matching `*_trimmed` value. There is one sensible shape.
- **S6 Documents**: add one additive method to `ProjectContextService` that returns the ordered candidate documents with text (uses `contextUsedBy` and the existing bounded reader); the brief consumes it through a port.
- **S7 Untrusted data**: every repository- or author-controlled string goes through `wrapUntrusted`; the system text carries the "treat as data" rule (NFR-4).

### Option 1 — Baseline: do nothing extra
- How: no code. A reviewer reads the Intent card, the Blast radius card and Smart Diff separately.
- Pros: no effort, no risk, no new model spend.
- Cons: fails every goal of the spec: no joined summary, no risks with files, no reading list, no jump to a line (spec, "Problem and user").
- Risks: the reviewer keeps assembling the picture by hand. Reference point only: it cannot be chosen because it does not meet the done condition.

### Option 2 — New `brief` module (vertical slice) that composes the existing read services through ports, with shared helpers promoted to `_shared/`
- How:
  - New `server/src/modules/brief/`: `routes.ts` (`GET` and `POST /pulls/:id/brief`, generate rate-limited 10/min), `service.ts`, `repository.ts` (only `pr_brief`), `ports.ts`, `domain.ts`, and pure helpers for the prompt, the budget loop and the answer validation.
  - Inputs come through narrow ports wired in the container: stored intent and stale (`IntentService.get`), blast (`BlastService.forPull`, so the "no changed symbol" and degraded rule is the card's own), files with role groups and stats (`SmartDiffService.forPull` or `classifyFile` from its `index.ts`), documents (S6), the linked issue (GitHub port), model (`risk_brief`), tokenizer.
  - Move `extractHunkHeaders` / `hunksFromFiles` and `extractIssueRefs` into `modules/_shared/`, leaving re-exports in the intent module as the glob move did, so the intent behaviour and its existing tests keep working.
  - Add the new-side range helper next to the hunk helper (built on the same patch text; `parseUnifiedDiff` from reviewer-core is the candidate).
- Pros: matches the layout every other feature uses (routes → service → repository); one source of truth per block, as the spec wants (blast, intent and groups behave exactly as their cards); no duplicated blast logic; small, mechanical refactor of intent.
- Cons: touches three existing modules lightly (intent re-exports, project-context new method, container getters for blast and smart-diff, which are built in their routes today); the most files of the three real options.
- Risks: container wiring for `BlastService` needs a logger (not found how the container gets one, see "Not found"); each composed read repeats a `pullInWorkspace` query and `BlastService` logs its own line (noise, not a defect).

### Option 3 — New `brief` module that reads tables and the repo-intel facade directly and copies the small helpers
- How: same new module and routes as option 2, but the brief repository reads `pull_requests`, `pr_files`, `pr_intent`, and the service calls the repo-intel facade itself; hunk-header, issue-ref and blast-degraded logic are copied into the module. No existing module changes.
- Pros: nothing existing is edited; no cross-module wiring beyond the repo-intel and GitHub ports.
- Cons: re-implements `blastReason` / `shouldQueryFacade` / `toBlastRadius` (`blast/map.ts`, not opened) and the intent stale and issue rules, so the brief can disagree with the cards (the spec's "one source of truth per block"); the glob precedent in `server/INSIGHTS.md:352` is the opposite approach; largest effort.
- Risks: silent drift whenever the blast or intent rule changes; two places to fix for each bug.

### Option 4 — Extend the `intent` module with a second service (`BriefService`) in the same folder
- How: add the brief service, store and routes inside `modules/intent/`, reusing `IntentStore.context` (pull, repo, files with patch, stored intent), `hunks.ts` and `links.ts` directly. Blast, documents and smart-diff come through ports exactly as in option 2.
- Pros: least new code; hunk and issue helpers need no move; stored intent and stale are one query away.
- Cons: the intent module grows into two features (its service is already 427 lines, `intent/service.ts`); `IntentDeps` and the intent container getter gain brief-only collaborators; the spec and the course name a separate `brief` module (spec sequence diagram, "server (brief)").
- Risks: a change to the brief can regress the intent derive path that reviews also use (`reviews/deps.ts`, per `docs/plans/06-project-context.brainstorm.md`); harder to delete the feature later.

## Rejected upfront
| Option | Reason | Source |
|---|---|---|
| Send diff hunk bodies to the model for better line choices | Spec forbids any added, removed or context line in the request | specs/12-pr-brief.md AC-14 |
| Generate in a background job with a status endpoint | The spec's sequence has the generate request return the validated brief; a status endpoint is a new wire contract the spec does not list. Not a hard architecture rule, so recorded here rather than scored | specs/12-pr-brief.md "Workflow" (sequence diagram) |
| Put the brief logic in `reviewer-core` | reviewer-core is the pure review engine (prompt → LLM → grounding); the brief is a server feature that reads the database and GitHub; any change there also triggers `server-unit` | root `CLAUDE.md` (Packages, Cross-package rules) |
| Derive or re-derive the intent inside the brief | A second model call; spec non-goal | specs/12-pr-brief.md Non-goals, AC-19 |
| Import `intent/hunks.ts` or `intent/links.ts` from a new `brief` module | Cross-module internals | dependency-cruiser.cjs `no-cross-module-internals` (`:121`) |
| Hand-edit or add a migration by hand | Only `pnpm db:generate`; also not needed because `pr_brief` exists | root `CLAUDE.md` "Do not touch" |

## Criteria & weights
Fixed before scoring (1–5):
- c1 Spec coverage: meets the goals and the ACs, without a known gap · weight 5
- c2 Fit with architecture and conventions (onion layers, vertical slice, `_shared` precedent) · weight 4
- c3 Scope and effort · weight 3
- c4 Risk and reversibility (regressions in existing modules, drift between cards and brief) · weight 3
- c5 Testability (ports and fakes; new tests are off for this run, so low weight) · weight 2
- c6 Security surface (untrusted data, workspace scoping, no path from the model reaches the filesystem) · weight 3
- c7 UX and product fit (the brief agrees with the Intent and Blast cards beside it) · weight 3

## Scoring matrix
Maximum total is 115.

| option | c1 (5) | c2 (4) | c3 (3) | c4 (3) | c5 (2) | c6 (3) | c7 (3) | weighted total |
|---|---|---|---|---|---|---|---|---|
| 1 Baseline | 1 | 5 | 5 | 5 | 3 | 5 | 1 | 79 |
| 2 New module, compose services, promote helpers | 5 | 5 | 3 | 3 | 4 | 4 | 5 | 98 |
| 3 New module, direct reads, copied helpers | 4 | 3 | 2 | 3 | 4 | 4 | 3 | 76 |
| 4 Extend `intent` | 5 | 2 | 4 | 3 | 4 | 4 | 4 | 86 |

Evidence per cell (one line each):
- Option 1: c1 delivers nothing of the spec; c2/c3/c4/c6 are 5 only because nothing changes; c5 3 = nothing to test; c7 1 = the three blocks stay unjoined. The total is high only because "do nothing" is free; it is a reference and is excluded from the recommendation because c1 = 1.
- Option 2: c1 every input has an owner (intent `get`, blast `forPull`, groups, documents method, GitHub); c2 follows routes → service → repository and the `_shared` precedent (`server/INSIGHTS.md:352`); c3 new module plus three light edits and container getters; c4 intent edit is re-export only, but blast/smart-diff are not in the container today (`container.ts:237`); c5 narrow ports, fakes for every input; c6 same untrusted-data handling as intent, ids resolved through workspace-scoped stores; c7 blast and intent behave as their cards, so a "missing" notice never disagrees with the card.
- Option 3: c1 can meet the ACs but re-derives blast and stale rules; c2 passes depcruise but duplicates; c3 biggest (rebuild blast mapping and intent read); c4 no edits to existing modules but drift risk; c5 ports and fakes fine; c6 same; c7 the brief can contradict the card beside it.
- Option 4: c1 all ACs reachable; c2 blurs the intent slice and the spec names a `brief` module; c3 least new code (helpers and `context()` reused); c4 couples to the intent path reviews use; c5 fine; c6 same; c7 same data as the cards.

## Sensitivity
- c1 (top weight 5) at 4: option 2 = 93, option 4 = 81, option 1 = 78, option 3 = 72. At 6: 103 / 91 / 80 / 80. The winner does not change.
- c2 (weight 4) at 3 or 5: option 2 = 93 or 103; option 4 = 84 or 90. The winner does not change.
- A combined stress case: c2 weight 1 and c3 weight 5 gives option 2 = 89 and option 4 = 88. That is the only tested setting where the margin nearly closes, and it still does not flip.

## Recommendation
**Option 2.** It is the only option that keeps one source of truth per block without growing the intent module, and it follows the repo's own precedent for a shared helper. Common decisions S1–S7 apply as written.

It would flip to **option 4** if the user prefers the smallest diff and accepts the intent module holding two features, or if the container cannot give the brief a blast reader without a logger (see "Not found") and that proves costly. It would flip to **option 3** only if the user wants zero edits to existing modules and accepts the divergence risk.

## For the planner
Affected modules
- `server/src/modules/brief/` (new); `server/src/modules/index.ts` (one import, one entry); `server/src/platform/container.ts` (brief deps: intent, blast, smart-diff, documents, GitHub, llm, `risk_brief` resolver, tokenizer, a store for `pr_brief`).
- `server/src/vendor/shared/contracts/brief.ts` then `./scripts/shared-contracts.sh sync` (client copy; `mcp` type-drift checks run on shared changes).
- `server/src/modules/_shared/` (hunk-header, issue-ref and range helpers), `server/src/modules/intent/hunks.ts` and `links.ts` (re-export), `server/src/modules/project-context/service.ts` (additive method), `server/src/modules/smart-diff` and `blast` only through their public surface or a container-built port.
- `server/src/modules/settings`: no change; `risk_brief` is registered already.
- Client: Overview tab (PR Brief block, banner, Risk areas, Review focus), Files changed tab (file/line arrival, accent border, scroll and highlight), brief hooks, `client/messages/en/` file for the feature strings (NFR-9), the contract copy.

Constraints
- Onion rules and `pnpm arch`; no cross-module internals; routes call one service method (`.claude/skills/onion-architecture/SKILL.md`).
- New tests and the e2e flow are off for this run (user decision); existing tests that import `intent/hunks` or `intent/links` (rg matched `server/test/intent-hunks.test.ts`, `intent-links.test.ts`, `intent-prompt.test.ts`; not opened) must keep passing, so the re-export is required.
- Workspace-scoped routes and the 10/min limit on generate (NFR-6, NFR-7); error messages carry no key or internal detail (NFR-8); one log line per generation without input or model text (NFR-10).
- `stale` is the head SHA comparison only; the `missing` values are the twelve in the spec; `Risk.kind` becomes the enum (AC-43).
- No migration: `pr_brief` exists.

INSIGHTS entries to read
- `server/INSIGHTS.md:352-364` (glob move to `_shared`, re-export), `:369-376` (latest round rule), `:490-491` (`maxRetries` vs `transportRetries`), the 2026-10-04 project-context entry about local matcher and structural reader ports (after `:393`, heading "project-context has its own matcher").
- `client/INSIGHTS.md:236` (risk severity colours in the design) and `:254` (card grid), per rg hits; not opened in full.

Open questions for the user
1. Where does the brief live? (options: 1. Option 2, new `brief` module composing the existing services, recommended / 2. Option 4, extend the `intent` module / 3. Option 3, new module with direct reads and copied helpers)
2. How is "each request is logged" met when the model is re-asked? (options: 1. Provider re-ask via `maxRetries: 1`, one log line per generation carrying `attempts` and summed tokens, no change to adapters, recommended for simplicity / 2. The service sends the re-ask itself with `maxRetries: 0` and logs each request, which needs a fragile check that a failure was a contract failure rather than a transport error / 3. Add a per-attempt hook to the shared `StructuredRequest` and all three providers, which edits the canonical adapter contract and reviewer-core)
3. What is a "changed range" for AC-47? (options: 1. The hunk's new-side range, context lines included, as the review grounding gate treats it (`reviewer-core/src/diff.ts:62-74`), recommended / 2. Only added lines)
4. Which linked-issue rule? (options: 1. AC-25 as written: closing issues first on any base branch / 2. Mirror intent: closing issues only when the base is the default branch, otherwise regex references)
5. Does the 8,000-token cap (AC-34) apply to the first request only? A re-ask request also carries the first answer and the repair text, so it will be larger. (options: 1. First request only, recommended / 2. Also bound the re-ask, for example by capping the first answer's `maxTokens` / 3. Disable the re-ask when the first request is above a threshold)

Spec: `specs/12-pr-brief.md` (SPEC-12). The spec's own OQ-2..OQ-8 are taken with their stated defaults; none changes an option.

## Sources
- specs/12-pr-brief.md, specs/README.md (not opened beyond the spec), CLAUDE.md, server/AGENTS.md, server/INSIGHTS.md (lines cited), client/INSIGHTS.md (rg hits only), docs/plans/06-project-context.brainstorm.md (first 80 lines), docs/plans/ listing.
- Server: `src/vendor/shared/contracts/brief.ts`, `src/vendor/shared/adapters.ts`, `src/db/schema/reviews.ts`, `src/db/schema/pulls.ts`, `src/db/migrations/0000_init.sql` (rg), `src/modules/intent/{service,ports,prompt,hunks,links,constants,routes,repository}.ts`, `src/modules/blast/{service,ports,routes}.ts`, `src/modules/smart-diff/{service,ports,routes,index,classify}.ts`, `src/modules/project-context/{service,ports,routes}.ts`, `src/modules/agents/repository.ts:489-520`, `src/modules/pulls/{ports,routes}.ts`, `src/modules/settings/feature-models.ts`, `src/modules/_shared/{context-docs,latest-round}.ts`, `src/platform/container.ts` (excerpts), `src/adapters/llm/{openai,anthropic}.ts`, `src/adapters/tokenizer/index.ts`, `src/modules/index.ts`.
- reviewer-core: `src/prompt.ts`, `src/diff.ts`, `src/llm/structured.ts`, `src/llm/openrouter.ts`.
- Client: `OverviewTab.tsx`, `page.tsx`, `DiffTab.tsx`, `use-search-param-state.ts`.
- Skill: `.claude/skills/onion-architecture/SKILL.md` and `assets/dependency-cruiser.cjs`. No web sources were fetched: Step 2 found a real choice, but it is internal to this codebase (module ownership), so external prior art would not change the options.

## Not found
- How the container obtains a logger to build `BlastService` (its `log` dep) outside a route; I did not search `container.ts` for a logger.
- `blast/map.ts` internals (opened by name only through its imports); the claim that Option 3 would re-implement them is an inference from the imports in `blast/service.ts`.
- Whether the tokenizer is fast enough for AC-36 (removing one file at a time with a full recount, up to several hundred counts): not measured. A pure helper can search for the cut point instead and stay within AC-36's outcome; the planner should decide.
- The contents of the existing tests `intent-hunks.test.ts`, `intent-links.test.ts`, `intent-prompt.test.ts`, and the client `DiffViewer` line anchors: not opened, so the scroll-to-line mechanism is unassessed.
- Whether `docs/blast-radius.md`, `specs/08-intent-layer.md` or `specs/09-smart-diff.md` add constraints: not opened.
