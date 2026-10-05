# Development Plan: Project Context
Status: implemented
Spec: specs/10-project-context.md
Brainstorm: docs/plans/06-project-context.brainstorm.md
Execution mode: multi-agent (chosen by the user)

## Goal
Implement SPEC-10 as brainstorm option 2: a new server module `project-context` discovers and reads repository markdown documents; agents and skills each own an attachment table; review runs carry the attached text as untrusted data and the trace records what was read.
In scope: server, reviewer-core, client, shared contracts, one migration.
Out of scope: the NFR-11 e2e flow, stub model provider and fixture checkout (**deferred to a follow-up plan by the user's decision; NFR-11 is NOT met by this plan**); a token cache; any change to `server/src/modules/_shared/glob.ts` or `GitClient`; new tests (tests are off).

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | 1–2 | contracts, reviewer-core, client stub removal | — | New contract names (Step 1); `projectContext` replaces `specs` on `PromptParts` and the review input; `PROJECT_CONTEXT_RULE` exported |
| G2 | 3–5 | server: schema, repositories, `project-context` module | G1 | New `AgentStore` / `SkillStore` methods; `container.projectContextService` with `listPaths`, `resolveForRun`; migration file name |
| G3 | 6–7 | server: agents/skills services and routes, reviews | G2 | Final route list and response shapes, if any differ from Step 6 |
| G4 | 8–9 | client: hooks, shared components, page, nav | G1 (parallel with G2, G3) | Exports of `@/components/context-docs`; hook names; message keys in `context.json` |
| G5 | 10–12 | client: agent tab, skill tab, trace drawer | G4 | — |
| G6 | 13 | client: no-active-repository state of the two Context tabs | G5 | — |

G1–G5 (Steps 1–12) are implemented and their checks passed. Only G6 is left to run; it must not rework Steps 1–12.

G2→G3 (server) and G4→G5 (client) may run in parallel: they touch disjoint packages once G1 is in.

## Skills behind the steps
| Path glob (routing.json rule id) | Skills | Why they matter here |
|---|---|---|
| `server/src/{modules,platform,adapters}/**` (server-app) | onion-architecture, fastify-best-practices | new module, ports, container wiring, thin routes |
| `server/src/modules/**/repository.ts`, `server/src/db/**` (server-data) | drizzle-orm-patterns | locked replace-list transactions, joins |
| `server/src/db/schema/**` (server-schema) | postgresql-table-design | two junction tables, FK indexes |
| `server/src/vendor/shared/**` (shared-contracts-server) | zod, onion-architecture | wire contracts, nullish trace fields |
| `client/src/vendor/shared/**` (shared-contracts-client) | zod | synced copy only |
| `reviewer-core/src/**` (reviewer-core) | typescript-expert, zod | prompt slot, purity |
| `client/src/**` (client-src), `client/src/app/**` (client-app-router) | frontend-architecture, react-best-practices, next-best-practices | placement, derive-don't-store, client pages |
| `client/messages/**` (client-i18n) | frontend-architecture | one file per feature |
| all code (security-surface) | security | file reads, prompt fencing, workspace scoping |
(The practices are in the steps. The implementer loads a skill only where a step says `load:`.)

## Steps

### Step 1 — Contracts and removal of the legacy stubs (contracts, client)
- Files: create `server/src/vendor/shared/contracts/project-context.ts` · modify `server/src/vendor/shared/index.ts` · modify `server/src/vendor/shared/contracts/trace.ts` · modify `server/src/vendor/shared/contracts/platform.ts` · modify `client/src/lib/hooks/core.ts` · modify `client/src/lib/types.ts` · modify `client/src/lib/query-keys.ts` (the client copy under `client/src/vendor/shared/` is produced by the sync script, never by hand)
- Change: add the zod schemas and `z.infer` types listed in Design notes → Contracts. In `trace.ts` add `context_docs: z.array(ContextDocRecord).nullish()` to `RunTrace`. Delete `SpecFile` (`platform.ts:293-299`) and its mention in `index.ts:10`; delete `useContextFiles`, `useReindexContext` (`core.ts:136-150`), the `SpecFile` re-export (`types.ts:30`) and `keys.repoContext` (`query-keys.ts:20`). Run `./scripts/shared-contracts.sh sync`.
- Covers: NFR-8, NFR-13
- Rules / skills: shared-contracts-server, shared-contracts-client, client-src
- Practices: wire fields stay `snake_case` (`AGENTS.md:50`). Every new trace field is `.nullish()` because stored traces are returned unparsed (`server/INSIGHTS.md:61`). Export schema and inferred type under one name; enums via `z.enum`. Edit only the server copy (`AGENTS.md:56-60`).
- Tests (test-writer): `server/test/contracts.test.ts` — NFR-8 (a trace without `context_docs` parses)
- Existing tests to update: none expected; `server/test/contracts.test.ts:169` keeps passing.
- Done when: `./scripts/shared-contracts.sh check` passes; `rg -n "SpecFile|useContextFiles|useReindexContext|repoContext" client/src server/src mcp/src` prints nothing; `pnpm typecheck` passes in `server/`, `client/` and `mcp/`.

### Step 2 — Project-context prompt slot (reviewer-core)
- Files: modify `reviewer-core/src/prompt.ts` · modify `reviewer-core/src/review/run.ts` · modify `reviewer-core/src/index.ts` · modify `reviewer-core/README.md` · modify `server/test/prompt-callers.test.ts` · modify `server/test/prompt-structured.test.ts`
- Change: replace `specs?: string[]` (`prompt.ts:58`, `run.ts:61,145`) with `projectContext?: { path: string; text: string }[]`. `assemblePrompt` renders one block per document, in order: `wrapUntrusted('project-context', '### ' + path + '\n' + text)`, joined by blank lines, under the single existing heading `## Project context`, in its current position (`prompt.ts:142`). After the blocks and outside them, append a new exported constant `PROJECT_CONTEXT_RULE`: one sentence telling the model that a finding relying on a project-context document must name that document's path. An empty or absent list renders no section and no rule. `assembly.specs` holds the joined blocks, or `null`.
- Covers: AC-52, AC-53, AC-54, AC-55, AC-56, AC-72, EC-5, NFR-3, NFR-12
- Rules / skills: reviewer-core, security-surface
- Practices: the path goes inside the wrapped content, never into the `source` label, so the existing `</untrusted>` escape covers it (`prompt.ts:30-34`). Mirror `INTENT_SCOPE_RULE` for the trusted rule (`prompt.ts:45,134`). No keyword filtering; the single `INJECTION_GUARD` stays (`reviewer-core/AGENTS.md:30-31`). Omitted slot leaves no section (`reviewer-core/AGENTS.md:33-34`). Section order is pinned by a test; do not move it (`reviewer-core/INSIGHTS.md:34`). No fs, fetch or server import.
- Tests (test-writer): `reviewer-core/test/prompt.test.ts` — AC-52, AC-53, AC-54, AC-55, AC-56, EC-5. AC-72 is checked by hand against a real model (NFR-12).
- Existing tests to update: `server/test/prompt-callers.test.ts:20` and `server/test/prompt-structured.test.ts:24` pass `specs: [...]`; switch them to `projectContext`.
- Done when: `npm run typecheck && npm test` pass in `reviewer-core/`; `pnpm typecheck && pnpm test:unit` pass in `server/`; `rg -n "specs\?:" reviewer-core/src` prints nothing.

### Step 3 — Attachment tables (server schema)
- Files: modify `server/src/db/schema/agents.ts` · modify `server/src/db/schema/skills.ts` · modify `server/src/db/schema.ts` (the migration under `server/src/db/migrations/` is generated)
- Change: add `agentContextDocs` (`agent_context_docs`: `agent_id` → `agents.id`, `repo_id` → `repos.id`, `path text not null`, `position integer not null`) and `skillContextDocs` (`skill_context_docs`, same with `skill_id` → `skills.id`). Both FKs `onDelete: 'cascade'`; primary key `(owner id, repo_id, path)`; an index on `repo_id`. Add both tables to the `schema` object (`schema.ts:49`). Run `pnpm db:generate`, then `pnpm db:migrate`.
- Covers: AC-21, NFR-13
- Rules / skills: server-schema, server-data
- Practices: copy the shape of `agentSkills` (`agents.ts:63-80`). FK references as arrow functions. Postgres does not index FKs: the PK leads with the owner id, so add the `repo_id` index by hand. `text` for the path; no document text column. Import `repos` from `./repos` (it imports only `./core`, so no cycle). Never hand-edit a migration (`AGENTS.md:70`). The cascade on `repo_id` is what removes lists with their repository (spec OQ-4).
- Tests (test-writer): `server/test/project-context-attachments.it.test.ts` — AC-21 (cascade on agent, skill and repo delete)
- Existing tests to update: none
- Done when: one new migration file exists containing both `CREATE TABLE` statements and nothing unrelated; `pnpm typecheck` passes in `server/`.

### Step 4 — Attachment persistence in the agents and skills repositories (server)
- Files: modify `server/src/modules/agents/ports.ts` · modify `server/src/modules/agents/repository.ts` · modify `server/src/modules/skills/ports.ts` · modify `server/src/modules/skills/repository.ts` · modify `server/test/agents-service.test.ts` · modify `server/test/skills-service.test.ts` · modify `server/test/reviews-service.test.ts`
- Change: `AgentStore` gains `contextPaths`, `setContextDocs`, `inheritedContextDocs` and `contextUsedBy` (signatures and semantics: Design notes → Store methods). `setContextDocs` copies `setSkillsLocked` (`repository.ts:325`): lock the agent row, read the list before, delete and insert with `position = index`, and bump `agents.version` plus `snapshotVersion` only when the ordered list differs. `SkillStore` gains `contextPaths(skillId, repoId)` and `contextPathsFor(skillIds, repoId): Promise<Map<string, string[]>>`; `UpdateSkill` gains `context?: { repoId: string; paths: string[] }`, applied inside the existing `update` transaction (`skills/repository.ts:84`) without touching `version` or `skill_versions`.
- Covers: AC-6, AC-21, AC-35, AC-45, EC-8, EC-18
- Rules / skills: server-app, server-data
- Practices: compare ordered lists element by element, never with `!==` (`server/INSIGHTS.md:281`). The agent version moves only when what reaches the prompt moves (`server/INSIGHTS.md:157`). Repositories return plain records, no Drizzle row type past the port. Query builder and `sql` template only, no `sql.raw`. Id-only reads are safe only because the services check the workspace first (Step 6). The agents repository may read `skill_context_docs` for joins; it never writes it (`server/INSIGHTS.md:329` is the precedent for reading another module's table).
- Tests (test-writer): `server/test/agents-context.it.test.ts` — AC-35, AC-6; `server/test/skills-context.it.test.ts` — AC-45, EC-18
- Existing tests to update: in-memory `AgentStore` / `SkillStore` fakes in the three listed test files gain the new methods.
- Done when: `pnpm typecheck`, `pnpm test:unit` and `pnpm arch` pass in `server/`.

### Step 5 — `project-context` module: discovery, reader, run resolver (server)
- Files: create `server/src/modules/project-context/constants.ts` · create `server/src/modules/project-context/helpers.ts` · create `server/src/modules/project-context/ports.ts` · create `server/src/modules/project-context/service.ts` · create `server/src/modules/project-context/routes.ts` · create `server/src/modules/project-context/types.ts` · create `server/src/adapters/project-docs/fs.ts` · modify `server/src/modules/index.ts` · modify `server/src/platform/container.ts`
- Change: build the module exactly as specified in Design notes → `project-context` module: the pattern and size constants, the pure matcher and type helpers, the ports, the bounded `FsProjectDocReader`, `ProjectContextService` (`list`, `content`, `listPaths`, `resolveForRun`), two GET routes, two lazy container getters, and the plugin registration in `modules/index.ts`.
- Covers: AC-1, AC-2, AC-3, AC-4, AC-6, AC-14, AC-16, AC-49, AC-51, AC-57, AC-58, AC-59, AC-60, EC-3, EC-9, EC-10, EC-16, EC-17, EC-20, NFR-1, NFR-2, NFR-5, NFR-6
- Rules / skills: server-app, security-surface
- Practices: service takes ports through the constructor, never the `Container`; the adapter is the only file touching `node:fs`. Routes are schema → `getContext` → one service call; zod on params, querystring and response; never `Schema.parse` in a handler (`server/AGENTS.md:39-40`). Throw `AppError` subclasses only. Paths stay inside the clone after `realpath` (security rule 2; the gap in `adapters/repo-files/fs.ts` must not be copied). `git.listFiles` already drops tracked symlinks (`adapters/git/simple-git.ts:199-210`). No network, no LLM call. Log path, status and tokens only, never text.
- Tests (test-writer): `server/src/modules/project-context/helpers.test.ts` — AC-2, AC-3, EC-20; `server/test/project-docs-reader.test.ts` — AC-57, AC-58, AC-59, EC-3, NFR-5; `server/test/project-context-service.test.ts` — AC-1, AC-4, AC-49, AC-60
- Existing tests to update: none expected; `server/test/routes-smoke.test.ts` must still pass.
- Done when: `pnpm typecheck`, `pnpm test:unit` and `pnpm arch` (`no dependency violations found`) pass in `server/`.

### Step 6 — Attachment endpoints in the agents and skills modules (server)
- Files: modify `server/src/modules/agents/ports.ts` · modify `server/src/modules/agents/service.ts` · modify `server/src/modules/agents/routes.ts` · modify `server/src/modules/skills/ports.ts` · modify `server/src/modules/skills/service.ts` · modify `server/src/modules/skills/routes.ts`
- Change: both `*ServiceDeps` gain `docs: { listPaths(workspaceId, repoId): Promise<string[] | undefined> }`, passed in `routes.ts` as `app.container.projectContextService`. Agents: `GET /agents/:id/context?repo_id=` → `AgentContext` (inherited rows exclude directly attached paths and keep the first skill per path); `PUT /agents/:id/context` body `ContextAttachmentInput` → `AgentContext`. Skills: `GET /skills/:id/context?repo_id=` → `SkillContext`; `UpdateSkillBody` (`skills/routes.ts:33`) gains `context: ContextAttachmentInput.optional()`, forwarded to `store.update`. One shared rule in each service before any write: the owner exists in the workspace (else 404), `listPaths` is defined (else 404), no duplicate path (else `ValidationError`), and every path that is NOT already in the stored list for that owner and repo is in `listPaths` (else `ValidationError` naming the paths).
- Covers: AC-29, AC-31, AC-32, AC-36, AC-43, EC-1, EC-4, EC-6, EC-21, NFR-6
- Rules / skills: server-app, security-surface
- Practices: copy `setBindings` (`agents/service.ts:171-190`) for the check-then-store shape. The modules meet only through the structural `docs` port; neither imports `modules/project-context` (`server/INSIGHTS.md:173`). `getContext` in every route; validation errors render as 422 through the shared handler. A stored path that is no longer a document is accepted and kept (amended AC-29).
- Tests (test-writer): `server/test/agents-service.test.ts` — AC-29, EC-4, EC-21, AC-36, EC-6; `server/test/skills-service.test.ts` — AC-29, AC-43, EC-21
- Existing tests to update: `server/test/agents-service.test.ts`, `server/test/skills-service.test.ts` and `server/test/agents-versions.it.test.ts` construct the services; add a `docs` fake.
- Done when: `pnpm typecheck`, `pnpm test:unit` and `pnpm arch` pass in `server/`.

### Step 7 — Documents in the review run and its trace (server)
- Files: modify `server/src/modules/reviews/deps.ts` · modify `server/src/modules/reviews/run-executor.ts` · modify `server/src/platform/container.ts` · modify `server/src/platform/trace-builder.ts` · modify `server/test/reviews-service.test.ts`
- Change: `deps.ts` declares `ProjectContextPort.resolveForRun(...)` beside `IntentPort` and adds `projectContext` to `ReviewDeps`; `reviewDeps` (`container.ts:195`) passes `projectContextService`. In `runOneAgent`, declare the record list BEFORE the `try` (`run-executor.ts:207`); after `buildSkillBlocks` call `resolveForRun({repo, agentId: agent.id, skillIds: skillBlocks.map(b => b.skill_id)})`; log one line per record (`read`: path and tokens; skipped: path and status); pass `projectContext: documents` to `reviewPullRequest` only when non-empty. Success trace (`run-executor.ts:365`): `specs_read` = read paths in order, `context_docs` = records. `traceFromBuffer` (`run-executor.ts:522`) takes the records as an optional argument and the `catch` passes them. `BuildTraceInput` gains optional `contextDocs`.
- Covers: AC-48, AC-50, AC-61, AC-69, AC-70, AC-71, EC-2, EC-7, EC-11, EC-12, EC-14, NFR-7
- Rules / skills: server-app, security-surface
- Practices: reviews reaches the module only through the port in `deps.ts` (`reviews/deps.ts:14-26`). Skipped skills are already absent from `skillBlocks`, which gives AC-50 with no second applicability pass (`run-executor.ts:450-471`). Log lines and `runLog` data never contain document text. No size limit on the total (EC-14).
- Tests (test-writer): `server/test/reviews.it.test.ts` — AC-48, AC-50, AC-61, AC-69, AC-70, AC-71, EC-11 (mock every LLM provider, `server/INSIGHTS.md:30`)
- Existing tests to update: the `ReviewDeps` fake in `server/test/reviews-service.test.ts` gains `projectContext`.
- Done when: `pnpm typecheck`, `pnpm test:unit` and `pnpm arch` pass in `server/`; `rg -n "specs_read: \[\]" server/src/modules/reviews` prints nothing.

### Step 8 — Hooks, keys and the shared document list (client)
- Files: create `client/src/lib/hooks/project-context.ts` · modify `client/src/lib/hooks/index.ts` · modify `client/src/lib/query-keys.ts` · modify `client/messages/en/context.json` · create `client/src/components/context-docs/ContextDocList.tsx` · create `client/src/components/context-docs/DocPreviewDrawer.tsx` · create `client/src/components/context-docs/DocTypeBadge.tsx` · create `client/src/components/context-docs/helpers.ts` · create `client/src/components/context-docs/constants.ts` · create `client/src/components/context-docs/styles.ts` · create `client/src/components/context-docs/index.ts`
- Change: add the query keys, the five hooks, the pure list helpers, the soft-cap constant, `ContextDocList` and `DocPreviewDrawer` as specified in Design notes → Client shared pieces. Rewrite `context.json` for this feature (drop the chunks, re-index and edit keys).
- Covers: AC-5, AC-19, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27, AC-28, EC-15, NFR-4, NFR-9, NFR-10
- Rules / skills: client-src, client-i18n, security-surface
- Practices: build from `client/docs/design/src/context_docs.jsx` (row, drawer, filter), not from screenshots. Copy `useSetAgentSkills` for the optimistic mutation (`client/src/lib/hooks/skills.ts:160`) and `SkillPreviewDrawer` for the drawer and Escape handling. Reorder guards live in `helpers.ts`; native drag needs `dataTransfer.setData` and `preventDefault` on `dragover`; indexes are positions in the full list; re-focus the grip after a keyboard move (`client/INSIGHTS.md:183`, `:382`, `:391`). Document text only through the kit `Markdown`, never `dangerouslySetInnerHTML`; new markdown styles go under `.dd-md` (`client/INSIGHTS.md:370`). No `fetch` in components; keys only from `query-keys.ts`; no hardcoded text; real `<button>`s with accessible names; stable keys (the path), never the index. Token numbers always come from the server list, never recomputed.
- Tests (test-writer): `client/src/components/context-docs/helpers.test.ts` — AC-22, AC-23, AC-25, AC-26; `client/src/components/context-docs/ContextDocList.test.tsx` — AC-19, AC-27, AC-28, NFR-9
- Existing tests to update: none
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `client/`.

### Step 9 — Project Context page and sidebar entry (client)
- Files: create `client/src/app/repos/[repoId]/context/page.tsx` · create `client/src/app/repos/[repoId]/context/layout.tsx` · create `client/src/app/repos/[repoId]/context/_components/ProjectContextView/ProjectContextView.tsx` · create `client/src/app/repos/[repoId]/context/_components/ProjectContextView/index.ts` · create `client/src/app/repos/[repoId]/context/_components/ProjectContextView/styles.ts` · modify `client/src/vendor/ui/nav.ts` · modify `client/messages/en/meta.json`
- Change: add `{ key: "context", label: "Project Context", icon: "Folder", href: "/repos/:repoId/context" }` to the WORKSPACE group (`nav.ts:22-26`), no `gKey`. The view lists every document (path, type badge, "≈ N tokens", "Used by N agents"), shows the pattern in the header, renders the selected document's content as markdown, and has a refresh control that refetches the list and the open document. States: `Skeleton` while pending, `ErrorState` with retry, a not-cloned state when `cloned` is false, an `EmptyState` titled "No documents found" whose body names the pattern. No create, edit, upload or delete control.
- Covers: AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, EC-16, EC-17, EC-20, NFR-9, NFR-10
- Rules / skills: client-src, client-app-router, client-i18n
- Practices: build from `ScreenContext` in `client/docs/design/src/screen_tour_context.jsx:220`, minus the coverage ring, chunks footer and edit mode (spec non-goals). Copy the Conventions route: thin `"use client"` page reading `useParams`, `layout.tsx` with `generateMetadata` from the `meta` namespace. Read `chrome.jsx` for the nav group (`client/INSIGHTS.md:154`). Use `isPending` for "no data yet" (`client/INSIGHTS.md:476`). Early returns for loading, error, not-cloned, empty. `shell.json:24` already has the label; `activeKeyFor` already maps `/context` (`client/src/components/app-shell/helpers.ts:32`).
- Tests (test-writer): `client/src/app/repos/[repoId]/context/_components/ProjectContextView/ProjectContextView.test.tsx` — AC-8, AC-9, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16
- Existing tests to update: `client/src/components/app-shell/nav.test.ts` if an assertion on the WORKSPACE items no longer holds.
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `client/`.

### Step 10 — Agent editor Context tab (client)
- Files: create `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.tsx` · create `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/index.ts` · create `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/styles.ts` · modify `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` · modify `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` · modify `client/messages/en/agents.json`
- Change: add the tab `context` (icon `Folder`) right after `skills` in `TABS`. The tab reads the active repo from `useActiveRepo()`, names it, and renders `ContextDocList` with the agent's attached paths and inherited rows. Every attach, detach and reorder calls `useSetAgentContext` with the whole list at once (no save button). Badges: "N of M attached", total "≈ N tokens" over attached plus inherited (each path once), and "over 4K soft cap" while the total exceeds `CONTEXT_TOKEN_SOFT_CAP`; attaching stays enabled.
- Covers: AC-17, AC-20, AC-30, AC-31, AC-32, AC-33, AC-34, AC-36, AC-37, AC-38, AC-39, EC-1, EC-6, EC-14, EC-19
- Rules / skills: client-src, client-app-router, client-i18n
- Practices: follow `SkillsTab.tsx` for the loading, error and save flow. Never copy query data into `useState`; counts and totals are computed during render. Rollback and the error toast come from the hook (Step 8). Design: `client/docs/design/src/screen_agents.jsx` and `ProjectContextList` in `context_docs.jsx:77`.
- Tests (test-writer): `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.test.tsx` — AC-30, AC-31, AC-32, AC-33, AC-34, AC-36, AC-37, AC-38, AC-39
- Existing tests to update: `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx` if it asserts the tab list.
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `client/`.

### Step 11 — Skill editor Context tab (client)
- Files: create `client/src/app/skills/_components/SkillDetail/_components/ContextTab/ContextTab.tsx` · create `client/src/app/skills/_components/SkillDetail/_components/ContextTab/index.ts` · create `client/src/app/skills/_components/SkillDetail/_components/ContextTab/styles.ts` · modify `client/src/app/skills/_components/SkillDetail/SkillDetail.tsx` · modify `client/src/app/skills/_components/SkillDetail/constants.ts` · modify `client/src/lib/hooks/skills.ts` · modify `client/messages/en/skills.json`
- Change: `TABS` becomes `config, context, preview, stats, versions`. `SkillDetail` holds `contextDraft: string[] | null` (`null` = untouched, show the saved list from `useSkillContext`). `dirty` is true when the field patch is non-empty OR the draft differs from the saved list. Save sends the field patch plus `context: { repo_id, paths }` when the list changed, in the one `useUpdateSkill` call; on success reset the draft to `null`; `useUpdateSkill` also invalidates `skillContext` and `projectDocs`. Discard resets the draft to `null`. The tab shows the heading "Project context to use", the repo name, "N attached", the inherit sentence of AC-41, total "≈ N tokens", and, while at least one document is attached, a "Serializes as" block: `## Project context` then one `- <path>` line per document. Save and Discard must be reachable from this tab: reuse the controls the Config tab already has.
- Covers: AC-18, AC-20, AC-40, AC-41, AC-42, AC-43, AC-44, AC-45, AC-46, AC-47, EC-18
- Rules / skills: client-src, client-i18n
- Practices: an attachment-only save does not change the skill version, so the page does not remount `SkillDetail`; the draft must be reset by hand (`SkillDetail.tsx:1-5,62-76`). The skill Config tab sends only dirty fields (`client/INSIGHTS.md:231`). Compare lists element by element. Design: `SkillContextSection` in `client/docs/design/src/context_docs.jsx:115` and `screen_skills.jsx`.
- Tests (test-writer): `client/src/app/skills/_components/SkillDetail/_components/ContextTab/ContextTab.test.tsx` — AC-40, AC-41, AC-46, AC-47; `client/src/app/skills/_components/SkillDetail/SkillDetail.test.tsx` — AC-42, AC-43, AC-44
- Existing tests to update: `client/src/app/skills/_components/SkillDetail/SkillDetail.test.tsx` (new hook, new tab); mock hooks with `importOriginal` (`client/INSIGHTS.md:191`).
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `client/`.

### Step 12 — Run trace drawer (client)
- Files: modify `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx` · modify `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/styles.ts` · modify `client/messages/en/runs.json`
- Change: the "Specs read" row (`TraceBody.tsx:40-52`) renders `trace.context_docs` when present: read documents with path and token badge, skipped ones with path and status; without records it falls back to `trace.specs_read` paths; with neither it shows "none". While at least one record is `read`, show "Project context adds N tokens to the prompt" (sum of read tokens). Rename `trace.prompt.specs` (`runs.json:50`) to "Project context — attached specs (untrusted)"; the row stays the existing `PromptBlock`.
- Covers: AC-62, AC-63, AC-64, AC-65, AC-66, AC-67, AC-68, EC-2, EC-13, NFR-8
- Rules / skills: client-src, client-i18n
- Practices: treat `undefined` like `null` on every new trace field. Copy `SkillBlockRows` for the row and total line. Paths and text are plain text. `{count > 0 && …}`, never `{count && …}`.
- Tests (test-writer): `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx` — AC-62, AC-63, AC-64, AC-65, AC-66, EC-13. `e2e/specs/12-project-context.flow.json` — NFR-11, **DEFERRED**: not written in this plan; it needs a stub model provider and a fixture checkout from a follow-up plan.
- Existing tests to update: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx` only if it asserts the old label.
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `client/`.

### Step 13 — Context tabs with no active repository (client)
- Files: modify `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.tsx` · modify `client/src/app/skills/_components/SkillDetail/_components/ContextTab/ContextTab.tsx` · modify `client/src/app/skills/_components/SkillDetail/SkillDetail.tsx` · modify `client/messages/en/agents.json` · modify `client/messages/en/skills.json`
- Change: "no repository is active" means `useActiveRepo()` has `reposLoaded === true` and `activeRepo === null`. While `reposLoaded` is false both tabs keep their skeleton, as today.
  1. Agent tab (`ContextTab.tsx:19-20`): replace the `return null` and its `OPEN:` comment with the kit `EmptyState` and nothing else: `title` = "Select a repository to attach project context", `icon="Folder"` (the tab's own icon, `AgentEditor/constants.ts:14`), no `body`, no `cta`, no `onCta`. `RepoContext` is not mounted, so there is no heading, badge, repository name, list, filter, token total or inherited row, and no document or attachment request is sent.
  2. Skill tab (`ContextTab.tsx:23-24`): replace the `return null` and its `OPEN:` comment with a branch that is checked BEFORE the `form.loadFailed || docsQ.isError` branch and renders only the heading `t("contextTab.title")` ("Project context to use", the existing `s.h2`) and the same `EmptyState`. No badge, repository name, inheritance sentence, `ContextDocList`, "Serializes as" block, and no footer (`s.footer`: required hint, Discard, Save) in this state. The footer stays in every other state.
  3. `SkillDetail.tsx:55-66`: take the repository id of the context from the active repository, not from the raw id: read `activeRepo` from `useActiveRepo()` and use `activeRepo?.id ?? null` wherever `repoId` is used today (`useSkillContext`, `draftPaths`, `contextChanged`, the `context` key of the save patch at `:88`, `form.repoId`, `onPaths`). Reason: `repoId` can be a stale `localStorage` id that matches no repository, and today that id still fires `useSkillContext` and could reach the save patch. With `null`, `contextChanged` is always false, so the tab cannot change `dirty` and Save sends no `context` key; the server then leaves every attachment list alone.
  4. Messages: add `context.noRepo` to `agents.json` and `contextTab.noRepo` to `skills.json`, both "Select a repository to attach project context".
- Covers: AC-73, AC-74, AC-75, AC-76, AC-77, AC-78, EC-22, EC-23, EC-24
- Rules / skills: client-src, client-app-router, client-i18n
- Practices: use `EmptyState` from `@devdigest/ui` (`client/src/vendor/ui/primitives/EmptyState.tsx:5`); do not build a new one and do not reuse `RepoNotFound`, which has a button (`client/src/components/repo-not-found/RepoNotFound.tsx:15-21`). The text is the `title` prop: the kit renders a button only when `cta` is set. No hardcoded text; one message key per feature file (`client/AGENTS.md:31`). Derive the state during render from `useActiveRepo()`: no `useState`, no effect. Hooks stay above every early return in the skill tab (`useProjectDocs(form.repoId)` is already disabled for a `null` id, `client/src/lib/hooks/project-context.ts:26`). The active repo resolves as URL path > `localStorage["dd-repo"]` > first repo, so `repoId` may be non-null while `activeRepo` is null (`client/src/lib/repo-context.tsx:48-49`, `client/INSIGHTS.md:204`). Do not touch `ContextDocList`, the hooks, the server or any other tab.
- Tests (test-writer): `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.test.tsx` — AC-73, AC-74, AC-75, EC-22; `client/src/app/skills/_components/SkillDetail/_components/ContextTab/ContextTab.test.tsx` — AC-73, AC-74, AC-76, EC-23; `client/src/app/skills/_components/SkillDetail/SkillDetail.test.tsx` — AC-77, AC-78, EC-24
- Existing tests to update: none expected (`SkillDetail.test.tsx` and `AgentEditor.test.tsx` do not render this state); repair either one only if it fails.
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `client/`; `rg -n "OPEN:" client/src/app/agents client/src/app/skills` prints nothing; `rg -n "noRepo" client/messages/en/agents.json client/messages/en/skills.json` prints one line per file.

## Contracts & migrations
- Shared contracts sync: yes — new `contracts/project-context.ts`, `contracts/trace.ts`, `contracts/platform.ts`, `index.ts` (Step 1)
- Schema change + `pnpm db:generate`: yes — `agent_context_docs`, `skill_context_docs` (Step 3)
- Spec `Status` update: yes — the last group sets `specs/10-project-context.md` per `specs/README.md`; NFR-11 stays open, so it is not fully implemented.

## Verification
| Package | Checks (from routing.json) |
|---|---|
| server | `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm arch` |
| client | `pnpm typecheck` · `pnpm lint` · `pnpm test` |
| reviewer-core | `npm run typecheck` · `npm run lint` · `npm test` |
| mcp | `pnpm typecheck` · `pnpm lint` · `pnpm test` (triggered by `server/src/vendor/shared/**`) |
Plus extra checks: `./scripts/shared-contracts.sh check`. Needs Postgres: yes (`pnpm db:migrate` in Step 3; `pnpm test:integration` for the existing `.it.test.ts` files).
All of the above in one command: `./scripts/check-changed.sh` (a group that is not the last runs `--quick`).

## Insights to record
- `server/INSIGHTS.md` · Codebase Patterns — `_shared/glob.ts` escapes `{`/`}` and cannot match a mid-pattern `**`, so `project-context` has its own matcher for its one constant pattern. (Where: `server/src/modules/_shared/glob.ts:17`)
- `server/INSIGHTS.md` · Codebase Patterns — the run's document records are declared before the `try` in `runOneAgent` so a failed or cancelled run still stores them. (Where: `server/src/modules/reviews/run-executor.ts:207`)
- `e2e/INSIGHTS.md` · Open Questions — SPEC-10 NFR-11 is deferred: no stub model provider is reachable from a running API and the seeded repo has no checkout. (Where: `server/src/db/seed.ts:318`)
- `client/INSIGHTS.md` · Open Questions — new entry titled `Supersedes "Context tabs with no active repository are undefined"`: decided in SPEC-10 AC-73 to AC-78; both tabs show the kit `EmptyState` without a button, and `SkillDetail` keys the attachment draft by `activeRepo?.id`, because `repoId` can be a stale stored id. Do not edit the old entry at `client/INSIGHTS.md:494`. (Where: `src/app/skills/_components/SkillDetail/SkillDetail.tsx:55`)

<!-- implementer-brief:end -->

## Context read
- `AGENTS.md:35-65` — naming, contract sync, path aliases, CI lanes; `AGENTS.md:67-77` — do-not-touch list.
- `server/AGENTS.md:33-46` — module shape, zod route schemas, `AppError`, `.it.test.ts`.
- `client/AGENTS.md:28-41` — component folders, hooks only, no hardcoded text, `renderWithIntl`.
- `reviewer-core/AGENTS.md:26-34` — purity, single injection guard, omitted slots leave no section.
- `e2e/AGENTS.md:27-28` — flows never call a model or mutate data (why NFR-11 is deferred).
- `specs/10-project-context.md:7` — amended and re-approved; `:105` AC-29, `:164` EC-4, `:181` EC-21, `:219` untrusted-input row.
- `docs/plans/06-project-context.brainstorm.md:67-76` — option 2; `:144-167` — planner context (each `path:line` re-checked).
- `server/INSIGHTS.md:30` (mock every provider in review tests), `:61` (nullish trace fields), `:157` (agent version rule), `:173` (read port implemented by `agentsRepo`), `:232` (Refresh does not move HEAD), `:281` (array compare), `:329` (a repository reading another module's table), `:521` (pre-work added to every run reaches un-mocked tests).
- `client/INSIGHTS.md:154`, `:183`, `:191`, `:231`, `:370`, `:382`, `:391`, `:476`.
- Correction (Step 13): `specs/10-project-context.md:7` (amendment), `:107-112` (AC-73 to AC-78), `:189-191` (EC-22 to EC-24); `client/INSIGHTS.md:204` (active repo resolution), `:494` (the open question this step closes); `client/src/lib/repo-context.tsx:48-49`; `client/src/vendor/ui/primitives/EmptyState.tsx:5-19`; both `ContextTab.tsx` files and `SkillDetail.tsx:55-98` as built.
- `reviewer-core/INSIGHTS.md:34` — prompt section order is pinned.
- `.claude/skills/pr-self-review/assets/routing.json` — rules and checks used above.
- `.claude/skills/security/references/devdigest.md` — existing guards; gap G2 (`FsRepoFiles.read` without `realpath`) must not be copied.
- `server/src/modules/agents/repository.ts:241-263, 325-360`; `server/src/modules/skills/repository.ts:84-125`; `server/src/modules/reviews/run-executor.ts:187-290, 330-400, 450-471, 522-546`; `server/src/platform/container.ts:139-210, 292`; `reviewer-core/src/prompt.ts:30-34, 45, 103-165`.

## Requirements trace
| R | Requirement (source `path:line` or "request") | Steps |
|---|---|---|
| AC-1 … AC-6 | Discovery (`specs/10-project-context.md:73-78`) | 4, 5, 8 |
| AC-7 … AC-16 | Project Context page (`:81-90`) | 5, 9 |
| AC-17 … AC-29 | Context tabs (`:93-105`) | 3, 4, 6, 8, 10, 11 |
| AC-30 … AC-39 | Agent tab (`:108-117`) | 4, 6, 10 |
| AC-40 … AC-47 | Skill tab (`:120-127`) | 4, 6, 11 |
| AC-48 … AC-60 | Review run (`:130-142`) | 2, 5, 7 |
| AC-61 … AC-71 | Run trace (`:145-155`) | 7, 12 |
| AC-72 | Verification scenario (`:158`) | 2 (manual check) |
| EC-1 … EC-21 | Edge cases (`:161-181`) | 2, 4, 5, 6, 7, 9, 10, 11, 12 |
| AC-73, AC-74 | Both Context tabs, no active repository: empty state only (`specs/10-project-context.md:107-108`, amended `:7`) | 13 |
| AC-75 | Agent tab hides badge, repository name, inherited rows (`:109`) | 13 |
| AC-76 | Skill tab keeps only its heading (`:110`) | 13 |
| AC-77, AC-78 | Skill unsaved mark and stored lists untouched (`:111-112`) | 13 |
| EC-22, EC-23, EC-24 | No-active-repository edge cases (`:189-191`) | 13 |
| R3 | Correction: add Step 13 / G6 only, Steps 1–12 stay as built, map "standard empty state" to the kit `EmptyState` (request) | 13 |
| NFR-1 … NFR-10, NFR-12, NFR-13 | Non-functional (`:184-196`) | 1, 2, 3, 5, 6, 7, 8, 9, 12 |
| NFR-11 | e2e flow | deferred (Step 12 `Tests` line only) |
| R1 | Brainstorm option 2 (request) | 3–7 |
| R2 | Tests off (request) | every step's "Done when" avoids new tests |

Decisions from the Requirements review: Q1 option 3 (NFR-11 staged) · Q2 option 1 (spec amended, Step 6) · Q3 option 1 (constant, Step 5) · Q4 option 2 (local matcher, Step 5) · Q5 option 1 (typed input, Step 2) · Q6 option 1 (one `PUT /skills/:id`, Steps 4, 6, 11) · Q7 option 1 (applies-to ignored for `used_by` and inherited rows, Step 4).
Recommendations: 1 delete legacy stubs — accepted (Step 1) · 2 bounded reader behind a new port — accepted (Step 5) · 3 token cache — declined.

## Affected modules
| Package | Path | Ring / layer | Change |
|---|---|---|---|
| server | `src/vendor/shared/contracts/` | core — domain | new contracts, trace field, `SpecFile` removed |
| server | `src/db/schema/` | outer | two tables |
| server | `src/modules/agents/`, `src/modules/skills/` | ports, application, outer | attachment store methods, validation, routes |
| server | `src/modules/project-context/` | new module, all rings | discovery, content, run resolver |
| server | `src/adapters/project-docs/` | outer (driven adapter) | bounded reader |
| server | `src/modules/reviews/`, `src/platform/` | application, composition root | port, executor, trace, wiring |
| reviewer-core | `src/prompt.ts`, `src/review/run.ts` | application | typed slot, cite rule |
| client | `src/components/context-docs/`, `src/lib/hooks/` | shared | list, drawer, hooks |
| client | `src/app/repos/[repoId]/context/`, agent and skill editors, trace drawer | routes | page, two tabs, trace rows |

## Constraints honored
| Rule | Source (`path:line`) | How the plan respects it |
|---|---|---|
| Onion layering, modules meet through ports | `server/AGENTS.md:33-37` | structural ports in each consumer's `ports.ts` / `deps.ts`; only `container.ts` knows all modules |
| Contracts edited in the server copy, then synced | `AGENTS.md:56-60` | Step 1 |
| Migrations only via `pnpm db:generate` | `AGENTS.md:70` | Step 3 |
| DB tests end in `.it.test.ts` | `AGENTS.md:42-43` | test names on the `Tests` lines |
| i18n in `client/messages/en/<camelCase>.json` | `AGENTS.md:44-45` | `context.json`, `agents.json`, `skills.json`, `runs.json`, `meta.json` |
| `server/clones/` never searched or touched | `AGENTS.md:68-69` | no step names it |
| reviewer-core stays pure | `reviewer-core/AGENTS.md:26-29` | Step 2 adds text assembly only |
| Lock files not hand-edited | `AGENTS.md:72-74` | no new dependency |

## Design notes
Steps 1, 4, 5 and 8 point here; the implementer of those steps reads the matching heading.

### Contracts
In `server/src/vendor/shared/contracts/project-context.ts`, each as a zod schema plus a `z.infer` type of the same name:
- `ProjectDocType` — `z.enum(['specs','docs','insights'])`
- `ProjectDocument` — `{ path, type: ProjectDocType, tokens: int, used_by: int }`
- `ProjectDocumentList` — `{ pattern: string, cloned: boolean, documents: ProjectDocument[] }`
- `ContextDocStatus` — `z.enum(['read','missing','too_large','unreadable'])`
- `ProjectDocumentContent` — `{ path, status: ContextDocStatus, content: string | null }`
- `ContextDocRecord` — `{ path, status: ContextDocStatus, tokens: int }`
- `ContextAttachmentInput` — `{ repo_id: uuid, paths: string[] }`; each path `min(1).max(4096)`; no cap on the count (spec OQ-3)
- `AgentContext` — `{ paths: string[], inherited: { path, skill_id, skill_name }[] }`
- `SkillContext` — `{ paths: string[] }`

### Store methods
`AgentStore` (implemented by `AgentsRepository`):
- `contextPaths(agentId, repoId): Promise<string[]>` — ordered by `position`.
- `setContextDocs(workspaceId, agentId, repoId, paths): Promise<boolean>` — false when the agent is not in the workspace.
- `inheritedContextDocs(agentId, repoId): Promise<{ path; skillId; skillName }[]>` — binding enabled AND skill enabled, ordered by binding `order`, then `position`; applies-to patterns ignored.
- `contextUsedBy(workspaceId, repoId): Promise<Map<string, number>>` — distinct agents of the workspace per path: direct rows plus rows reached through enabled bindings to enabled skills. Two selects merged in memory are fine.

`SkillStore` (implemented by `SkillsRepository`): `contextPaths(skillId, repoId)`, `contextPathsFor(skillIds, repoId): Promise<Map<string, string[]>>`, and `UpdateSkill.context?: { repoId: string; paths: string[] }`.

### `project-context` module
- `constants.ts`: `DOCUMENT_PATTERN = '**/{specs,docs,insights}/**/*.md'`, `MAX_DOCUMENT_BYTES = 65_536`.
- `helpers.ts` (pure): `isProjectDocument(path)` — true when a directory segment equals `specs`, `docs` or `insights` and the file name ends in `.md` (case-sensitive; this is the local matcher for the one constant pattern, not a general glob engine). `documentType(path)` — the first such segment from the left.
- `ports.ts`: `ProjectDocReader.read(root, relPath, maxBytes): Promise<{ status: 'read'; text: string } | { status: 'missing' | 'too_large' | 'unreadable' }>` (never throws); `AgentAttachmentReader` (`contextPaths`, `contextUsedBy`); `SkillAttachmentReader` (`contextPathsFor`); `ProjectContextDeps { repos: Pick<RepoStore, 'getById'>; git: Pick<GitClient, 'listFiles' | 'clonePathFor'>; reader; tokenizer; agents; skills }`. `types.ts` re-exports what other modules may name.
- `server/src/adapters/project-docs/fs.ts` (`FsProjectDocReader`), in this order: an absolute path or one that leaves `root` lexically → `unreadable`; `realpath` the target (`ENOENT` → `missing`) and the root, target outside the real root → `unreadable`; `stat`: not a regular file → `unreadable`, `size > maxBytes` → `too_large`, `size === 0` → `unreadable`; read as a Buffer; a NUL byte, or a throw from `new TextDecoder('utf-8', { fatal: true })`, → `unreadable`. Any other error → `unreadable`.
- `service.ts` (`ProjectContextService`):
  - `list(workspaceId, repoId)` → `undefined` for a repo not in the workspace; `{ pattern, cloned: false, documents: [] }` when `clonePath` is null; else `git.listFiles` filtered by `isProjectDocument`, sorted by path, each with `type`, `tokens` (tokenizer over the reader's text with `MAX_DOCUMENT_BYTES`; `0` when the reader returns no text) and `used_by`. Nothing is cached.
  - `content(workspaceId, repoId, path)` → only for a path in the current list, else `undefined`.
  - `listPaths(workspaceId, repoId)` → `string[] | undefined`.
  - `resolveForRun({ repo, agentId, skillIds })` → the agent's paths, then each skill's paths in `skillIds` order, first occurrence kept; each read with `MAX_DOCUMENT_BYTES`; returns `{ documents: { path; text }[]; records: ContextDocRecord[] }`, `tokens` 0 for skipped documents.
- `routes.ts`: `GET /repos/:id/context` → `ProjectDocumentList`; `GET /repos/:id/context/content` with querystring `{ path }` → `ProjectDocumentContent`. `NotFoundError` when the service returns `undefined`.
- `container.ts`: lazy getters `projectDocReader` and `projectContextService` (agents: `agentsRepo`, skills: `skillsRepo`, `git`, `reposRepo`, `tokenizer`).

### Client shared pieces
- Keys: `projectDocs(repoId)`, `projectDoc(repoId, path)`, `agentContext(agentId, repoId)`, `skillContext(skillId, repoId)`.
- Hooks in `client/src/lib/hooks/project-context.ts`: `useProjectDocs`, `useProjectDoc`, `useAgentContext`, `useSkillContext`, and `useSetAgentContext` (optimistic; on error restore the previous cache value and show an error toast; on success invalidate `agents`, `agent(id)` and `projectDocs`).
- `helpers.ts` (pure): row ordering (attached in stored order, missing paths included; then inherited; then unattached by ascending path), case-insensitive path filter, move inside the attached block, toggle (attach appends last), token total over distinct paths.
- `constants.ts`: `CONTEXT_TOKEN_SOFT_CAP = 4000`.
- `ContextDocList`: rows with checkbox, path, type badge and a Preview button; a grip button only on attached rows (drag, ArrowUp/ArrowDown); a "missing" row whose only control detaches; inherited rows read-only with a "via skill <name>" label; the "Filter documents…" field.
- `DocPreviewDrawer`: path, type badge, used-by count, token count, content through `Markdown`, attach toggle.

### Decisions
**Why the agents repository answers `used_by` and inherited rows.** Both need `agent_skills`, which the agents module owns; the same reason made `SkillUsageReader` an agents-repository port. The skills repository stays the only writer of `skill_context_docs`.

**Agent version snapshot.** AC-35 asks for a new version; the plan reuses `snapshotVersion` unchanged, so `config_json` does not record the attachment lists. Two consecutive versions can therefore hold the same snapshot.

**One size limit for every read.** The reader has a single cap (65,536 bytes). A larger or unreadable document is listed with `tokens: 0`, and its preview returns `content: null` with its status. See the first risk.

**Row order with inherited rows.** AC-22 orders attached then unattached; inherited rows are placed between them so the prompt order reads top to bottom.

## Risks & open questions
- **Spec gap — documents the reader refuses.** AC-4 and AC-10 assume every listed document has a token count and a preview; a 70 KB or binary `.md` has neither under the bounded reader. The plan lists it with `tokens: 0` and a preview status instead of content. If the list and preview must read larger files, that needs a spec amendment and a second, larger cap.
- **NFR-11 is not delivered.** `implementation-verifier` should report it as deferred, not as a defect of this plan.
- **Save and Discard on the skill Context tab.** They live inside the Config tab today (`SkillDetail.tsx:108-123`); I did not read `ConfigTab`, so Step 11 may need to extract them. The design file `screen_skills.jsx` decides the placement.
- **AC-76 and the skill tab's Save / Discard footer.** AC-76 says the skill tab shows "only its heading" beside the empty state; Step 13 reads that literally and hides the footer in this state. Edits made on other tabs are then saved from the Config tab (EC-24 does not say from which tab). If the user wants the footer kept, it is a one-line change in Step 13 item 2 and a wording question for the spec.
- **Line numbers of older trace rows.** The spec gained lines in today's amendment, so the `:NN` references in the Requirements trace rows for Steps 1–12 are shifted; they were left as written because those steps are built.
- **Repos request failure.** `reposLoaded` stays false when the repos request fails, so both tabs keep the skeleton; the spec's new criteria cover only "no repository is active", so Step 13 leaves that as it is.
- **Design files may be older than the screenshots** (`client/INSIGHTS.md:154`); I read only their symbol list, not their bodies.
- **Agent snapshot content** (see Design notes): confirm that an unchanged `config_json` across versions is acceptable.
- **`node_modules` is not installed in this worktree**: each group must install (`pnpm install` in `server/`, `client/`, `mcp/`; `npm install` in `reviewer-core/`) before its checks, and Step 3 needs Docker Postgres.
- **List cost.** With the token cache declined, every list request reads and tokenises every document; not measured for several hundred documents (EC-15).
- **`context.json` rewrite** removes keys; `rg` found no consumer in `client/src`, but the implementer should re-check before deleting.
- **TOCTOU in the reader** between `realpath`/`stat` and the read is accepted for a local single-user tool; flagged for the security reviewer.

## Handed off
- Architecture reviewer: the three structural ports into `projectContextService` (agents, skills, reviews) and the agents repository reading `skill_context_docs`; `SkillDetail` draft state versus derive-don't-store; placement of `components/context-docs/`; Step 13: `SkillDetail` keying the attachment draft by `activeRepo?.id` instead of `repoId`, and the branch order in the skill `ContextTab` (empty state before the error branch).
- Security reviewer: `server/src/adapters/project-docs/fs.ts` (symlinks, size, encoding, TOCTOU); the AC-29 rule that lets an already stored path stay; workspace checks before id-only repository calls in Steps 4 and 6; `wrapUntrusted` content and `PROJECT_CONTEXT_RULE` in `reviewer-core/src/prompt.ts`; log lines in `run-executor.ts`; `Markdown` rendering of repository text in the drawer and the page.
