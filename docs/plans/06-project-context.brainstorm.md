# Brainstorm: Project Context (attach repository markdown documents to agents and skills)
Status: chosen: option 2
Spec: specs/10-project-context.md (SPEC-10, `Status: approved`)

## Problem
SPEC-10 lets a developer browse a repository's markdown documents, attach them by hand to an agent or a skill (per repository, ordered, paths only), see the token cost, and have each review run carry the attached text as untrusted data and name the document a finding relies on. The trace must show which documents were read, skipped (and why), their tokens and the full text sent. No model call is added (NFR-1).

The real choice is structural: **who owns the attachment data and the discovery/read logic**, and therefore how many modules the feature crosses. The spec fixes the behaviour; it does not fix this.

Tags: **fact** = seen in the source; **inference** = my conclusion.

## Context found

Architecture and rules
- **fact** `server/src/modules/<m>/` is layered routes → service → repository; modules meet only through a port wired in the container; `platform/container.ts` is the composition root (`server/AGENTS.md:33-37`, `.claude/skills/onion-architecture/SKILL.md` "Principles" 3, 8).
- **fact** There is already a precedent for a cross-module read through a structural port: `SkillUsageReader` (`server/src/modules/skills/ports.ts:86`) is satisfied by `agentsRepo` (`server/INSIGHTS.md:172-177`); reviews reaches intent through `IntentPort` (`server/src/modules/reviews/deps.ts:20`).
- **fact** `agent_skills` is owned by the agents module (`server/src/db/schema/agents.ts:63-80`); `AgentsRepository.setSkillsLocked` locks the agent row, replaces the list, and bumps `agents.version` + writes an `agent_versions` snapshot only when the enabled ordered ids changed (`server/src/modules/agents/repository.ts:325`, `server/INSIGHTS.md:156-161`).
- **fact** `snapshotVersion` writes `config_json` with skill ids only (`server/src/modules/agents/repository.ts:241-263`). **inference** AC-35 (new agent version when the attachment list changes) fits the same locked-transaction pattern, and the snapshot is the place to record the lists if the planner wants reproducibility (`server/INSIGHTS.md:567-571` leaves that open for skills).
- **fact** Array fields compared with `!==` in `isConfigChange` bump the version on every save; use an element-wise compare (`server/INSIGHTS.md:281-292`, `server/src/modules/agents/helpers.ts:42`).
- **fact** A skill body edit bumps the skill version in `skills`/`skill_versions` (`server/src/modules/skills/ports.ts:55-56`, `SkillStore.update`); the skill editor remounts when the version changes, which resets the draft (`client/src/app/skills/_components/SkillDetail/SkillDetail.tsx:1-5, 70-72`). **inference** AC-45 (version unchanged on attachment-only save) is also what avoids that remount.
- **fact** No table for attachments exists. `db/schema/context.ts` holds `code_chunks`, `symbols`, `references`, `onboarding` only; `agents`/`skills` have no context columns (`server/src/db/schema/context.ts`, `agents.ts`, `skills.ts`). Migrations only through `pnpm db:generate` (`AGENTS.md` "Do not touch").

Documents on disk
- **fact** `GitClient.listFiles` returns tracked regular files, symlinks excluded, via `git ls-files -s -z`; `readFile` resolves symlinks and re-checks the path is inside the clone, but reads the whole file as `utf8` with no size cap and no binary or UTF-8 check (`server/src/adapters/git/simple-git.ts:190-210`, port `server/src/vendor/shared/adapters.ts:249-254`).
- **inference** AC-58/59 (65,536-byte cap, empty, binary, invalid UTF-8) cannot be met by calling `GitClient.readFile` as it is. A stat-before-read, strict-decode reader is needed: either a new method on the `GitClient` port (changes the canonical contract file, then sync, and `MockGitClient` at `server/src/adapters/mocks.ts:312-315`) or a new driven port and adapter owned by the new feature.
- **fact** `git ls-files -s` already prints each blob sha; the adapter drops it (`simple-git.ts:200-210`). **inference** a token count keyed by blob sha avoids re-reading and re-tokenising hundreds of files on every list request (EC-15); the list endpoint needs a token per document (AC-4, AC-8).
- **fact** The tokenizer is `Tokenizer.count` (js-tiktoken `cl100k_base`, heuristic fallback) wired in the container and already used for skill blocks (`server/src/adapters/tokenizer/index.ts`, `server/src/modules/reviews/run-executor.ts:467`).
- **fact** The glob matcher in `server/src/modules/_shared/glob.ts` supports `*`, `?`, `dir/**`, and a `**/` prefix only. It translates `{` and `}` as literals, and a mid-pattern `**` becomes `[^/]*[^/]*` (`glob.ts:1-14, 24-52`). **inference** it cannot express the spec's default pattern `**/{specs,docs,insights}/**/*.md` (AC-2). `server/package.json` has no picomatch, micromatch or minimatch entry (grep); `node_modules` is not installed in this worktree, so transitive availability is unchecked.
- **fact** picomatch supports comma brace lists and `**/x/**/*.md` matches `x/a.md` (https://github.com/micromatch/picomatch).
- **fact** `AppConfig` has no field for a document pattern (`server/src/platform/config.ts:15-78`). The spec calls it "server configuration" (spec Inputs table) without saying where.

Review run and prompt
- **fact** The prompt already has a `## Project context` slot: `PromptParts.specs?: string[]`, each item wrapped by `wrapUntrusted('spec-<i>', s)`, rendered only when non-empty, and returned as `assembly.specs` (`reviewer-core/src/prompt.ts:58, 112-115, 142, 161`). `reviewPullRequest` forwards `input.specs` (`reviewer-core/src/review/run.ts:61, 145`). The server never passes it today (`server/src/modules/reviews/run-executor.ts:264-290`).
- **fact** `wrapUntrusted` escapes `</untrusted>` in the content in any case/spacing, but the `source` label is fixed text (`reviewer-core/src/prompt.ts:30-34`). **inference** a path placed inside the content (as the first line `### <path>`) gets the same escape (AC-53/54, NFR-3).
- **fact** The AC-56 style trusted instruction has a precedent: `INTENT_SCOPE_RULE` is added outside the fence when the intent section renders (`reviewer-core/src/prompt.ts:45-48, 130-135`). **inference** AC-56 belongs in `assemblePrompt`, so the CI runner (which also calls `assemblePrompt`) gets it too.
- **fact** `RunTrace.specs_read` is `string[]` and `PromptAssembly.specs` is `string | null` (`server/src/vendor/shared/contracts/trace.ts:53, 99`); the executor writes `specs_read: []` in both the success trace and the failure/buffer trace (`run-executor.ts:365, 543`). New trace fields must be `nullish` (`server/INSIGHTS.md:61-66`, NFR-8).
- **fact** The failure path builds its trace only from the SSE buffer (`traceFromBuffer`, `run-executor.ts:522-546`). **inference** AC-71 (records survive a failed or cancelled run) forces the resolved document records to be kept outside the `try` that fails, or passed into `traceFromBuffer`.
- **fact** Skills are resolved per agent, filtered by `applies_to` (`partitionSkills`) in `buildSkillBlocks`, which logs and returns block + `skill_id` (`run-executor.ts:450-471`, `server/src/modules/reviews/applicability.ts`). **inference** the run resolver can take the agent id and the ordered ids of the applicable skills, which gives AC-48/49/50 without a second applicability pass.

Client
- **fact** The trace drawer already renders `prompt_assembly.specs` as a PromptBlock labelled "Project context (dynamic)", and "Specs read" lists `trace.specs_read` strings or "none" (`client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:40-50, 90-92`, `client/messages/en/runs.json:35, 50`). **inference** AC-62..68 are a small extension plus a label change (spec wants "Project context — attached specs (untrusted)").
- **fact** Agent editor tabs are a constant list `config`, `skills` (`client/src/app/agents/[id]/_components/AgentEditor/constants.ts:10-13`); the skill editor tabs are `TABS` in `SkillDetail/constants.ts` and the draft is a `changedFields` diff saved with one `useUpdateSkill` call (`SkillDetail.tsx:50-75`). The agent Skills tab already implements attach, drag reorder, ArrowUp/Down and a save that persists immediately (`client/INSIGHTS.md:183-190, 382-395`).
- **fact** The sidebar `NAV` has no Project Context entry; `activeKeyFor` and `shell.json` already know the key `context` (`client/src/vendor/ui/nav.ts:20-34`, `client/src/components/app-shell/helpers.ts:32`, `client/messages/en/shell.json:24`).
- **fact** Unwired legacy stubs exist: `useContextFiles` calls `GET /repos/:id/context` returning `SpecFile[]` (path/content/size/updated_at), `useReindexContext` posts `/context/reindex`, `keys.repoContext`, and `messages/en/context.json` still talks about `.devdigest/specs/`, "chunks", "Re-index" and an edit mode (`client/src/lib/hooks/core.ts:136-150`, `client/messages/en/context.json`, `server/src/vendor/shared/contracts/platform.ts:293-299`). No server route serves them (`rg` over `server/src/modules`). **inference** they conflict with the spec (view-only, no chunks) and should be replaced, not extended.
- **fact** The kit's `Markdown` is `react-markdown` + `remark-gfm` with no raw-HTML plugin (`client/src/vendor/ui/primitives/Markdown.tsx:1-42`). **inference** reusing it meets NFR-4; I did not check the installed react-markdown version's URL transform.
- **fact** Design files exist for the shared Context UI: `client/docs/design/src/context_docs.jsx` (row, preview drawer, 4,000-token cap), `screen_tour_context.jsx` (N6 page).

E2E
- **fact** e2e rules: flows "must never trigger a model call or mutate data" and use seeded `acme/payments-api` (`e2e/AGENTS.md:27-28`, `e2e/docs/authoring-a-flow.md:47`). The seed sets `clonePath: null` for the demo repo (`server/src/db/seed.ts:318`). No stub LLM provider exists in `server/src` (rg for stub/fake LLM found only test mocks, `TESTING.md:114`).
- **inference** NFR-11 ("one deterministic e2e flow, using the stub model … attaching, a review run, the trace") needs three things that do not exist: a cloned fixture repo with documents in the hermetic stack, a stub model reachable from the running API, and a flow that mutates data. This is independent of the option chosen (see question 1).

Prior plans
- **fact** `docs/plans/02-intent-layer.md` took the same shape for a comparable feature: a narrow port from reviews into a new module, fail-open, trace fields added, a Settings-free constant (D1, D9). No earlier plan covers attachments.

Open questions OQ-1..OQ-6 (defaults treated as decided)
- OQ-1 (type from the first matching segment), OQ-2 (refresh does not fetch), OQ-3 (no maximum), OQ-5 (last write wins) and OQ-6 (no grey-out) change no option. **inference** replace-the-whole-list semantics give OQ-5 for free in options 2 and 4.
- **OQ-4 (lists removed with their repository) is a dependency:** options 2 and 4 get it from `ON DELETE CASCADE` on `repo_id`; option 3 (jsonb) needs explicit cleanup code in the repos module.

## Options

**Option 1 — Baseline: do nothing extra.**
- How: no code. A developer who wants a rule enforced pastes the document into a skill body (existing import by file or URL) or into a system prompt.
- Pros: no effort, no risk.
- Cons: fails US-1..US-6 (no browsing, no per-repo attachment, no token view, no trace of use, a stale copy of the document instead of the file read at run start). A skill body is trusted-ish prompt text, so a repository document pasted there loses the untrusted fence (NFR-3) (`reviewer-core/src/prompt.ts:3-8, 36-42`, skills are not fenced).
- Risks: reviewers keep missing written rules.

**Option 2 — Dedicated `project-context` module for documents; each owner keeps its own attachment table (split ownership).**
- How:
  - New module `server/src/modules/project-context/` (routes → service → port-based driven adapter). It owns document discovery, type, tokens, content for preview, the AC-29 validation list, and the per-run resolver (read, skip statuses, tokens, records).
  - Attachment storage mirrors `agent_skills`: `agent_context_docs(agent_id, repo_id, path, position)` owned and written by the agents repository, `skill_context_docs(skill_id, repo_id, path, position)` owned by the skills repository, both with `ON DELETE CASCADE` on owner and repo (one migration via `pnpm db:generate`).
  - The agents repository replaces the list under its existing agent row lock and bumps the version (AC-35) in the same transaction, like `setSkillsLocked`. The skills repository replaces the list without touching `skills.version` (AC-45).
  - Agents and skills services receive a narrow `ProjectDocsPort.listPaths(workspaceId, repoId)` through the constructor to enforce AC-29. `used_by` is a read port the agents repository implements (same pattern as `SkillUsageReader`): direct rows UNION rows reached through enabled `agent_skills` and enabled skills, counted per distinct agent.
  - Reviews gets a `ProjectContextPort.resolveForRun({workspaceId, repo, agentId, skillIds in order})` in `reviews/deps.ts` (like `IntentPort`); the executor passes the documents to reviewer-core, merges the records into the trace, and logs one line per document.
- Pros: follows the codebase's own patterns; version bump is atomic; FK cascades handle OQ-4 and owner deletion; each module stays a vertical slice; easy to unit-test the resolver with fakes.
- Cons: two new tables, three modules touched plus reviews, reviewer-core, contracts, client: the largest diff of the real options.
- Risks: used-by SQL joins across agents/skills tables (precedent in `activeSkillCounts`, `agents/repository.ts:67-80`); the executor refactor for AC-71 touches the hot path of every run.

**Option 3 — Extend in place: jsonb columns on `agents` and `skills`, no new module.**
- How: add `context_paths jsonb` (`{ [repoId]: string[] }`) to `agents` and `skills`; document discovery and read as new methods on the repos module and `GitClient`; resolution inside `run-executor.ts`; validation (AC-29) inside the agents and skills services calling repos.
- Pros: no new tables or module folder; the agent version bump rides `updateLocked`.
- Cons: the agents and skills modules must know the repos module's git/document logic, which breaks "modules meet only through a port"; no FK on the repo ids inside jsonb, so OQ-4 needs hand-written cleanup in `RepoStore.remove`; used-by becomes a jsonb scan; two saves for different repos can overwrite each other's keys inside one jsonb value; the repos and reviews modules grow with unrelated logic.
- Risks: orphaned repo ids; the array-compare trap in `isConfigChange` now applies to a nested map (`server/INSIGHTS.md:281-292`).

**Option 4 — Dedicated `project-context` module that owns documents AND all attachments in one polymorphic table.**
- How: one table `context_attachments(owner_kind, owner_id, repo_id, paths jsonb ordered)` written only by the new module; agents and skills call it through ports; the agent version bump is requested from the new module through an agents port.
- Pros: one module holds the whole feature; one migration; one table to query for used-by.
- Cons: `owner_id` cannot carry an FK to both `agents` and `skills`, so deleting an agent or skill leaves orphan rows unless the service cleans up; the agent version bump has to cross modules and is not atomic with the list write unless a shared transaction or a unit-of-work port is added (onion Principle 6); the skills and agents modules lose ownership of data about themselves.
- Risks: orphans and a version bump that can diverge from the stored list.

## Rejected upfront
| Option | Rule broken | Source |
|---|---|---|
| Index the documents into `code_chunks` (`source = 'spec'`) through the repo-intel indexer and read them from the DB | Spec conflict (not a repo hard rule): AC-1, AC-16, AC-51, EC-10 require the list, preview and run to read the local checkout as it stands now; an index is stale until re-indexed and adds an indexing pass and embeddings | `specs/10-project-context.md:71, 89, 132, 169`; `server/src/db/schema/context.ts:29-41` |
| Read documents through the GitHub API (Octokit contents) | NFR-2: reading for a run makes 0 network requests; AC-51 default branch as held locally | `specs/10-project-context.md:183, 132` |
| Edit, create or upload documents from the page | Out of scope by the spec (needs a commit and push, a new write scope) | `specs/10-project-context.md:25-26` |
| Store document text in the attachment rows | NFR-13: lists hold paths only | `specs/10-project-context.md:194` |
| Put attached text in the system prompt or outside an untrusted fence | NFR-3 and the single-guard rule | `specs/10-project-context.md:184`; `reviewer-core/AGENTS.md:30-31` |

No option breaks the onion layers, the contracts-sync rule or the migrations rule as designed; options 2 and 4 must still go through `shared-contracts.sh sync` and `pnpm db:generate`.

## Criteria & weights
Fixed before scoring (1-5). Criterion 1 is a gate: an option that scores 2 or less on it does not deliver the spec and is kept only as a reference.
| # | Criterion | Weight | Why this weight |
|---|---|---|---|
| c1 | Spec coverage (AC, EC, NFR met without workarounds) | 5 | An approved spec with 72 criteria |
| c2 | Fit with architecture and conventions (onion, ports, module ownership) | 5 | Hard rules and the repo's own precedents |
| c3 | Scope and effort | 3 | Four packages are already involved in every option |
| c4 | Risk and reversibility (atomicity, orphans, migration) | 4 | Version bump and ordered lists must stay consistent |
| c5 | Testability | 3 | NFR-12: all but AC-72 must be checkable without a model |
| c6 | Security surface (paths, symlinks, workspace scoping, untrusted text) | 4 | The feature reads files and feeds a prompt |
| c7 | UX/product fit | 2 | The UI is the same in options 2-4 |

## Scoring matrix
| Option | c1 (5) | c2 (5) | c3 (3) | c4 (4) | c5 (3) | c6 (4) | c7 (2) | Weighted total |
|---|---|---|---|---|---|---|---|---|
| 1 Baseline | 1 | 5 | 5 | 5 | 4 | 2 | 1 | 87 (fails gate c1) |
| 2 Split ownership | 5 | 5 | 2 | 4 | 4 | 4 | 5 | **110** |
| 3 jsonb in place | 4 | 2 | 4 | 3 | 3 | 3 | 5 | 85 |
| 4 One polymorphic table | 5 | 3 | 3 | 3 | 4 | 4 | 5 | 99 |

Evidence per score (one line each)
- Option 1: c1 delivers none of US-1..6; c2/c3/c4 nothing changes; c5 nothing new to test; c6 pasting repo text into a skill body drops the untrusted fence; c7 no browsing or token view.
- Option 2: c1 every AC has a home (list, tabs, run, trace); c2 mirrors `agent_skills` ownership and the `SkillUsageReader`/`IntentPort` pattern; c3 two tables plus six touched areas; c4 version bump and list replace in one locked transaction, cascades give OQ-4; c5 resolver and services run on fakes, repositories on `.it.test.ts`; c6 one validation port (AC-29) and one bounded reader; c7 full design.
- Option 3: c1 all met but OQ-4 and used-by need extra code; c2 agents/skills reach into repos and git logic, reviews executor grows; c3 no new tables/module (fewer files, still two column migrations); c4 no FK on repo ids, cross-repo overwrite in one jsonb value; c5 cross-module logic is harder to fake; c6 AC-29 check duplicated in two services, easy to miss one; c7 same UI.
- Option 4: c1 all met; c2 one module owns data about agents and skills, polymorphic owner has no FK; c3 one table but extra ports for the version bump; c4 orphans on owner delete, bump not atomic with the list; c5 fakes are easy; c6 one place validates and one place reads; c7 same UI.

## Sensitivity
- c2 weight 4: totals 82 / 105 / 83 / 96. c2 weight 6: 92 / 115 / 87 / 102. Winner stays option 2.
- c1 weight 4: 86 / 105 / 81 / 94. c1 weight 6: 88 / 115 / 89 / 104. Winner stays option 2.
- Option 4 is the runner-up in every case. Option 1 would only beat option 3 when c2 is raised, and it fails the c1 gate regardless.
- **inference** The ranking changes only if the weight on c3 (effort) rises above about 9, where option 3's lower file count would start to matter, or if the group decides agents/skills must not own any new table.

## Recommendation
**Option 2.** It is the only option that keeps the agent version bump atomic with the list write, gets repo removal (OQ-4) and owner deletion from foreign keys, and follows two patterns the codebase already uses (`agent_skills` ownership and a read port like `SkillUsageReader`).

It flips if: the user decides the attachment rows must live outside the agents and skills modules (then option 4, with a unit-of-work port for the version bump), or the user wants the smallest possible schema change and accepts the repos/agents coupling (then option 3).

Sub-decisions that do not change the ranking (apply to options 2-4; my leaning in brackets)
- reviewer-core input: typed `projectContext: {path, text}[]` rendered by `assemblePrompt` (heading, escape, AC-56 instruction in one tested pure place) [preferred, matches the spec's "Run input" boundary at `specs/10-project-context.md:66`] versus the server pre-rendering `### path\ntext` strings into the existing `specs: string[]` and reviewer-core adding only the AC-56 instruction (smaller reviewer-core diff, format owned by the server). Either way `prompt_assembly.specs` already carries the full text for AC-67.
- Reader: new stat-first, strict-UTF-8 reader behind a port in the new module [preferred, leaves `GitClient` and its synced contract alone] versus new methods on `GitClient`.
- Token cache keyed by blob sha so a several-hundred-document list is not re-tokenised per request.
- Skill attachments save: one `PUT /skills/:id` carrying the context list for the active repo versus a separate `PUT /skills/:id/context` that Save calls after the body save (two requests, partial-failure handling).

## For the planner
Modules and files likely touched (Option 2)
- server new: `modules/project-context/` (routes, service, ports, helpers for type/pattern, reader adapter), registered in `modules/index.ts:14-31`; container wiring in `platform/container.ts` (`get reposRepo` at 178, `get tokenizer` at 292).
- server changed: `db/schema/agents.ts`, `db/schema/skills.ts` (+ barrel `db/schema.ts` if a new file), `modules/agents/{ports,repository,service,routes,helpers}.ts`, `modules/skills/{ports,repository,service,routes}.ts`, `modules/reviews/{deps,run-executor}.ts`, `platform/trace-builder.ts:15-52`, `adapters/mocks.ts`.
- contracts (edit server copy, then `./scripts/shared-contracts.sh sync`): new `contracts/project-context.ts` + barrel export, `contracts/trace.ts` (nullish per-document records), possibly `contracts/knowledge.ts` for agent/skill context DTOs; replace the stale `SpecFile` use (`contracts/platform.ts:293`).
- reviewer-core: `src/prompt.ts` (AC-56 instruction, section), `src/review/run.ts` (input), `src/index.ts` exports, `test/prompt.test.ts`; then `cd ../server && pnpm typecheck`.
- client: new route `app/repos/[repoId]/context/` (page + `_components/`), nav entry in `vendor/ui/nav.ts` (WORKSPACE) + `shell.json`, a shared Context tab component used by the agent and skill editors, tab constants in both editors, hooks in `lib/hooks/` and keys in `lib/query-keys.ts`, `RunTraceDrawer/TraceBody.tsx` + `runs.json`, rewrite `messages/en/context.json`, remove or replace `useContextFiles`/`useReindexContext`.
- e2e: one new `e2e/specs/NN-project-context.flow.json` (blocked by question 1).

Constraints
- Migrations only via `pnpm db:generate`; never hand-edit `server/src/db/migrations/` (`AGENTS.md` "Do not touch").
- Onion layers and `pnpm arch` (`server/AGENTS.md`); services take ports, never `Container`.
- Server test touching the DB ends in `.it.test.ts`; client tests use `renderWithIntl`; no hardcoded UI text (`AGENTS.md`, `client/AGENTS.md:33-41`).
- New trace fields `nullish` (`server/INSIGHTS.md:61-66`); compare ordered lists element-wise (`server/INSIGHTS.md:281-292`).
- Every route resolves the workspace via `getContext` and scopes agents, skills, repos by it (NFR-6; `server/src/modules/agents/routes.ts`).
- `listFiles` skips symlinks and `readFile` resolves links, but `insideDir` throws `ValidationError` on escape (`simple-git.ts:190-198, 243-248`); the reader must map that to status `unreadable`, not fail the run (AC-59, AC-60).
- Logs and live-log lines carry path, status, tokens, never text (NFR-7).
- The kit `Markdown` must render documents; no `dangerouslySetInnerHTML` (NFR-4).
- The skill editor draft must treat attachments as part of dirty state (AC-42/44) without a version bump (AC-45).

INSIGHTS entries to read
- `server/INSIGHTS.md:61-66` (nullish trace fields), `:156-161` (agent version only when the prompt's skill set changes), `:172-177` (read port pattern), `:232-241` (Refresh does not move HEAD; only `git.sync` does), `:281-292` (array compare), `:560-571` (skill versions and reproducibility), `:36-44` (a PR nobody opened reviews an empty diff).
- `client/INSIGHTS.md:183-195` and `:382-395` (Skills tab reorder helpers and DnD), `:368-376` (`Markdown` styles live under `.dd-md`), `:154-160` (read `chrome.jsx` for nav before building).
- `reviewer-core/INSIGHTS.md:34-40` (section order is deliberate; per-PR text before skills).

Open questions for the user (OQ-1..6 stay at their defaults)
1. NFR-11 asks for an e2e flow that attaches a document, runs a review with a stub model and reads the trace, but e2e rules forbid model calls and mutations, no stub provider exists, and the seeded repo has no checkout. Which way? (options: 1. add a stub LLM provider selected by an env var in the hermetic stack plus a seeded fixture checkout with documents, and amend `e2e/AGENTS.md` for this flow / 2. keep the e2e flow to browsing and attaching and cover the run and trace with a server `.it.test.ts` using `MockLLMProvider` / 3. do both in stages: e2e for the UI now, the stub provider as a follow-up)
2. Where does the document pattern live? AC-2 says "configured" but no setting exists. (options: 1. a constant in the module, no configuration surface now / 2. an env var in `AppConfig` / 3. a per-repository setting in the database)
3. How is `**/{specs,docs,insights}/**/*.md` matched, given `_shared/glob.ts` cannot express it? (options: 1. extend `_shared/glob.ts` with braces and mid `**`, which also changes diff-filter and smart-diff / 2. a matcher local to the new module / 3. add picomatch with `pnpm add`)
4. Which reviewer-core input shape? (options: 1. typed `{path, text}[]` rendered inside reviewer-core / 2. server-rendered strings in the existing `specs` slot)
5. How does the skill editor save its attachments with the skill? (options: 1. one `PUT /skills/:id` with a context list for the active repository / 2. a separate `PUT /skills/:id/context` after the body save)

## Sources
Spec and repo files opened in this run
- `specs/10-project-context.md`; `AGENTS.md`, `server/AGENTS.md`, `reviewer-core/AGENTS.md`, `client/AGENTS.md`, `e2e/AGENTS.md`, `e2e/docs/authoring-a-flow.md`
- `docs/plans/02-intent-layer.md` (head), `docs/plans/04-brainstorm-and-security-reviewer.md` (head); `ls docs/plans specs`
- `server/INSIGHTS.md`, `client/INSIGHTS.md`, `reviewer-core/INSIGHTS.md`, `INSIGHTS.md` (searched, relevant entries read)
- server: `modules/reviews/{run-executor,deps,applicability}.ts`, `modules/agents/{ports,types,service,routes,repository}.ts`, `modules/skills/{ports,service}.ts`, `modules/repos/ports.ts`, `modules/_shared/glob.ts`, `modules/index.ts`, `adapters/git/simple-git.ts`, `adapters/repo-files/fs.ts`, `adapters/tokenizer/index.ts`, `platform/{container,config,trace-builder}.ts`, `db/schema/{agents,skills,context,repos}.ts`, `db/schema.ts`, `db/seed.ts` (grep), `vendor/shared/{index,adapters}.ts`, `vendor/shared/contracts/{trace,knowledge,platform}.ts`
- reviewer-core: `src/prompt.ts`, `src/review/run.ts` (grep), `src/index.ts` (grep)
- client: `src/vendor/ui/{nav.ts,primitives/Markdown.tsx}`, `src/components/app-shell/helpers.ts`, `src/lib/{query-keys.ts,hooks/core.ts}`, `src/app/skills/_components/SkillDetail/SkillDetail.tsx`, `src/app/agents/[id]/_components/AgentEditor/constants.ts`, `.../RunTraceDrawer/_components/TraceBody/TraceBody.tsx`, `messages/en/{context,runs,shell}.json`, `docs/design/src/context_docs.jsx` (head)
- `scripts/e2e.sh` (grep and middle section)

External (fetched this run)
- https://github.com/micromatch/picomatch (comma brace lists supported; `**/x/**/*.md` matches `x/a.md`). Primary source: the library's own README. No conflict found.

## Not found
- Where a "configured" document pattern is meant to live: no setting or env field exists (question 2).
- A stub LLM provider or any e2e fixture checkout for the hermetic stack (question 1).
- Whether `picomatch` or `micromatch` is already a transitive dependency: `node_modules` is not installed in this worktree.
- The installed `react-markdown` version's link-scheme behaviour (NFR-4 "schemes the renderer already allows"): not checked.
- The skill editor `constants.ts` `TABS` list and `SkillDetail/helpers.ts` `changedFields`/`draftFromSkill` bodies: I saw their call sites only.
- Any earlier plan on attachments or on document discovery: none in `docs/plans/` or `specs/`.
