# Insights — server

Non-obvious findings about the API. Indexer findings go to `src/modules/repo-intel/INSIGHTS.md`,
cross-package ones to `../INSIGHTS.md`.
Written via the `engineering-insights` skill: append-only, one entry per finding.

---

## What Works

### 2026-09-22 — A control PR separates skills from no-skills only through a policy rule the model lacks
deepseek-v4-flash finds field removals, renames, retypes, nullability and enum widening with or without skills
(35 of 36 checks across both fixtures and modes). What it never flags on its own is a breaking change shipped as a minor bump (`package.json`
1.4.0 → 1.5.0): 0/3 without skills, 3/3 with `semver-discipline`. Plant a policy-level change when designing a control PR.
Where: `src/experiments/fixtures/api-contract/ts-route-contract/expected.json:34` (`minor-bump`).

## What Doesn't Work

### 2026-09-15 — Refactoring leftovers
- `src/platform/{grounding,prompt,structured}.ts` only re-export `reviewer-core`.
- `src/platform/model-router.ts` is unused: `Provider` lacks `openrouter`, and
  `PromptCache`'s default clock `() => 0` means entries never expire.
- `ReviewService` builds its own `ReviewRepository` instead of `container.reviewRepo`.
- `polling` writes to the DB directly from the route (no service/repository).
- A comment in `modules/repos/service.ts` mentions `POST /repos/:id/reindex`; the route is `/resync`.
Where: `src/platform/grounding.ts:6`, `src/platform/model-router.ts:15` (`Provider` has
no `openrouter`), `src/modules/reviews/service.ts:35`, `src/modules/polling/routes.ts:22`,
`src/modules/repos/service.ts:76`.

### 2026-09-16 — `review {all:true}` in tests runs seeded openrouter agents for real
`POST /pulls/:id/review {all:true}` also runs the seeded openrouter agents and any agent
created by earlier tests in the file. Without `overrides.llm.openrouter` they use the
real key from `~/.devdigest/secrets.json`; those runs stayed `running` for more than 10s
(real network, **unverified**). `waitForPrRuns` returns silently on timeout instead of failing.
Fix: mock every provider used in the file. The existing test "run all enabled agents" is affected.
Where: `test/reviews.it.test.ts:372` ("run all enabled agents"), `test/helpers/runs.ts:14`
(`waitForPrRuns`).

### 2026-09-21 — A review of a PR nobody has opened yet reviews an EMPTY diff and reports "approve"
`loadDiff` tries `git diff base...head` on the clone, then falls back to `pr_files` patches. A freshly imported repo has
neither: the clone holds only `main` (the PR head commit is missing) and `pr_files` is filled the first time
`GET /pulls/:id` runs (the PR page). `POST /pulls/:id/review` straight after import therefore logs "0 changed file(s)" and
the model answers "approve, no changes". Open the PR (or `GET /pulls/:id`) once before reviewing it from a script.
Where: `src/modules/reviews/diff-loader.ts:11` (`loadDiff`).

### 2026-09-22 — Scoring a control PR by exact cited line fails: grounded lines drift by up to 6
On `ts-route-contract` deepseek-v4-flash cited `author` anywhere from line 5 to 12 (real: 11) and the version at
`package.json:5–6` (real: 3); grounding kept all of them because they fall inside the hunk. An exact-line check marks real catches as misses.
`scoreRun` counts a change as caught by file + a keyword the finding must name + a ±5 line slack.
Where: `src/experiments/score.ts:29` (`LINE_SLACK`).

## Codebase Patterns

### 2026-09-15 — Queue state is in-memory only
The `jobs` table mirrors status but nothing re-enqueues `queued` jobs after a
restart. Reviews run fire-and-forget in-process; `reapStaleRuns()` cleans up
orphaned `running` runs on boot. Assumes a single API instance.
Where: `src/platform/jobs.ts:49` (`enqueue`), `src/modules/reviews/service.ts:94`
(`reapStaleRuns`, called from `src/app.ts:81`).

### 2026-09-16 — New fields on the `run_traces` jsonb contract must be `nullish`
`getRunTrace` returns the stored jsonb as-is, with no migration and no parse, so traces
saved before a field existed don't have its key. Declare added `RunStats`/`RunTrace`
fields `.nullish()` and have the UI treat `undefined` like `null` (e.g. `cost_usd` → "—").
Where: `src/vendor/shared/contracts/trace.ts:66` (`RunStats.cost_usd`),
`src/modules/reviews/repository/run.repo.ts:190` (`getRunTrace`).

### 2026-09-16 — `rollupSeverities` was written for the PR list and left unwired
`modules/pulls/status.ts` has shipped a tested `rollupSeverities()` since the list was
built, but `pulls/routes.ts` carried a comment saying the severity breakdown was
"intentionally not surfaced", so nothing imported it. It is now the core of
`modules/pulls/findings.ts` (latest review per PR → tally → `PrMeta.findings_by_severity`).
Before writing a new list rollup, check `status.ts` / `cost.ts` for one that already exists.
Where: `src/modules/pulls/status.ts:23` (`rollupSeverities`),
`src/modules/pulls/findings.ts:70` (`severityByPr`), `src/modules/pulls/routes.ts:116`.

### 2026-09-16 — "The PR's latest review" means a batch, never the newest review row
One click on Run Review starts every enabled agent, so `reviews ORDER BY created_at
DESC LIMIT 1` returns an arbitrary agent of that round — whichever finished last. On
PR #1 that was a clean Performance pass (0 findings, score 100) sitting next to a
General run with 1 CRITICAL + 2 WARNING + 1 SUGGESTION and score 38, so the list
showed "—" and 100 while the Agent-runs tab showed five findings. Anything the list
summarises must group by `agent_runs.batch_id` (what COST already did) and take the
worst/sum across the round: `latestBatchByPr` in `pulls/cost.ts` +
`latestRoundReviewIds` in `pulls/findings.ts`. The client needs the same rule, so
`ReviewRecord.batch_id` is now served by `GET /pulls/:id/reviews`.
Where: `src/modules/pulls/findings.ts:39` (`latestRoundReviewIds`),
`src/modules/pulls/routes.ts:151`, `src/modules/reviews/repository/review.repo.ts:75`.

### 2026-09-18 — A repo URL is a filesystem boundary, not just input
`parseRepoUrl` output becomes `<cloneDir>/<owner>/<name>`, and `SimpleGitClient.clone()` deletes a
destination that has no `.git`. The old unanchored regex let `https://github.com/../x` through, i.e.
an `rm -rf` of a sibling of the clone dir, and cloned the raw user URL (any host). Now three layers:
`RepoInput` regex (both contract copies), the anchored `GITHUB_URL_REGEX`, and `insideDir()` in the
adapter. The clone job rebuilds the URL with `githubCloneUrl(owner, name)` and ignores `payload.url`.
Where: `src/adapters/git/simple-git.ts:140`, `src/modules/repos/constants.ts:21`.

### 2026-09-18 — Transactions: build the repository on `tx`
A repository typed on `DbOrTx` (pool or open transaction) runs unchanged inside `db.transaction`:
`this.db.transaction((tx) => work(new AgentsRepository(tx)))`. Not hypothetical: before the row lock,
three concurrent `PUT /agents/:id` produced versions `[2, 2, 3]` and dropped a snapshot
(`onConflictDoNothing`). Read-then-write paths lock with `.for('update')` inside the transaction.
Where: `src/db/client.ts:15`, `src/modules/agents/repository.ts:162`.

### 2026-09-18 — GitHub auth for git: a per-command header, never the remote URL
`SimpleGitClient` sends the PAT as `-c http.https://github.com/.extraheader=AUTHORIZATION: basic …`
(the same form `actions/checkout` uses) on clone/fetch only. Clones made before this kept the token
in `origin`; `scrubOrigin()` strips it on the next clone/fetch/sync, so an old clone is clean after
one Refresh. Private-repo fetches depend on the token being in Settings, not in the clone.
Where: `src/adapters/git/simple-git.ts:90`.

### 2026-09-18 — Jobs on one repo are serialised by `repoJobKey`
Clone, index, refresh and resync all register with `{ serializeBy: repoJobKey }` (`repo:<repoId>`),
so a Refresh can't re-clone a directory the indexer is reading. A timed-out attempt aborts
`ctx.signal` and holds the key until the handler settles, at most `ABORT_GRACE_MS` (30 s) — the
repo-intel pipeline ignores the signal today, so its overlap is bounded, not impossible. A job
waiting for its key holds a p-queue slot.
Where: `src/platform/jobs.ts:31`, `src/modules/_shared/jobs.ts:1`.

### 2026-09-24 — `pr_intent` scaffolding on `ReviewStore` was unused; the intent module now owns it via a port
`ReviewStore.upsertIntent`/`getIntent` (and their `pull.repo.ts` implementations) were dead code — nothing called them; the
intent layer (L03) instead gets its own `modules/intent/{ports,repository,service}.ts`, and `reviews` reaches it only through
the structural `ReviewDeps.intent` port (`IntentPort.forRun`), wired to `container.intentService` in the composition root. The
two modules never import each other directly. Where: `src/modules/reviews/ports.ts:147` (`ReviewStore`, now ends at
`// ---- runs + traces ----` with no intent section), `src/modules/reviews/deps.ts:9` (`IntentPort`).

### 2026-09-24 — `review_intent` defaulted to `openai/gpt-4.1` while the picker always saves `openrouter`
Same trap as the earlier `model-router.ts` entry: `FEATURE_MODELS`'s `review_intent` entry (`contracts/platform.ts:52`) had
`defaultProvider: 'openai'`, but `SettingsModels.tsx` always persists `provider: 'openrouter'` when a user changes the model —
so an unconfigured workspace ran a different default (openai/gpt-4.1) than any workspace that had ever touched the picker
(openrouter/whatever). Fixed to `openrouter/deepseek/deepseek-v4-flash` (D8), matching the already-used default elsewhere.
Where: `src/vendor/shared/contracts/platform.ts:52`.

### 2026-09-19 — Where a shared contract goes so both rings can import it
A file named `ports.ts` counts as core for depcruise — including `modules/_shared/ports.ts`, which
holds `JobQueue`, `RunBusPort`, the job kinds and `repoJobKey`. An adapter may not import any
`modules/**` file, so a constant both an adapter and a module need goes to `vendor/shared`
(`contracts/code-index.ts`: `SUPPORTED_EXT`, walk limits). Another module's types come through its
`types.ts`/`index.ts` only (`agents/types.ts`, `repos/types.ts`), which re-export from its `ports.ts`.
Where: `src/modules/_shared/ports.ts:1`, `src/vendor/shared/contracts/code-index.ts:1`.

### 2026-09-19 — Wiring lives in container getters: `reviewDeps`, `repoIntelDeps`
A service takes a plain deps object; `Container` builds it (`container.reviewDeps`,
`container.repoIntelDeps`) and routes call `new XService(container.xDeps)`. Tests build the same
object from fakes and real pure adapters (`test/helpers/repo-intel.ts`), so no test casts a fake
Container or patches a private field. The parse concurrency (`cpus() - 1`) is decided in the
container, not in the pipeline.
Where: `src/platform/container.ts:119`, `test/helpers/repo-intel.ts:11`.

### 2026-09-19 — `parseUnifiedDiff` lives in reviewer-core
The parser was an adapter file but is pure and is what grounding depends on, so it moved to
`reviewer-core/src/diff.ts`; the git adapter, the mocks and the review module import it from
`@devdigest/reviewer-core`. reviewer-core's own vitest config aliases `@devdigest/reviewer-core` to
its `src`, because its tests borrow the server mocks, which import it through that alias.
Where: `../reviewer-core/src/diff.ts:1`, `../reviewer-core/vitest.config.ts:12`.

### 2026-09-21 — An agent's version moves when its prompt's skill set moves, not on every binding edit
`AgentsRepository.setSkills` locks the agent row, replaces `agent_skills`, and bumps `agents.version` (plus an
`agent_versions` snapshot) only when the ENABLED, ordered skill ids differ from before. Muting a binding that was already
off, or re-saving the same list, leaves the version alone. The snapshot holds ids of enabled bindings, not bodies, so
editing a skill's body does not version the agents that use it (see Open Questions).
Where: `src/modules/agents/repository.ts:295` (`setSkillsLocked`).

### 2026-09-21 — A narrow skill narrows the agent: `route-breaking-change-rubric` made API Contract approve a new API client
With the lean prompt (role + severity/verdict only) the rubric in the skill becomes the agent's whole notion of the job.
`route-breaking-change-rubric` compares an OLD and a NEW route signature; on a PR that only ADDS an API client (no old
contract in the diff) API Contract returned `approve`/100 in 2 of 2 runs, while the same agent without skills found a
silent `[]` on error, a crash on non-404 statuses and a wrong map. On a PR that really breaks a route (renamed param,
array → object, dropped field) skills and no-skills found the same three breaks, so an obvious break does not separate
them. Write a skill for a class of input, and say in its `description` when it does NOT apply.
Where: `src/db/seed-skills.ts:89` (`ROUTE_BREAKING_CHANGE_RUBRIC`).

### 2026-09-21 — "Used by N agents" is a read port the agents repository implements, not a join in the skills module
`agent_skills` belongs to the agents module, so `SkillsService` takes a `SkillUsageReader` (`agentCounts`, `agentsUsing`) and
the container passes `agentsRepo`, which satisfies it structurally (no import of the skills port). Only bindings with
`enabled = true` count — an agent whose binding is muted does not "use" the skill. `GET /skills` computes counts in one grouped
query; `GET /skills/:id` and the mutations ask `agentsUsing` for one skill. `body_tokens` comes from the shared `Tokenizer`.
Where: `src/modules/agents/repository.ts:82`, `src/modules/skills/service.ts:26`.

### 2026-09-21 — Import from URL is SSRF-guarded at connect time, not by checking the URL string
`POST /skills/import/url` takes a user URL, so `SafeHttpFetcher` (`adapters/http/`) checks the address the socket actually
connects to: a custom `lookup` on `https.request` resolves the name and refuses when ANY answer is private, loopback,
link-local (169.254.169.254), CGNAT, ULA, multicast or an IPv4-mapped/NAT64/6to4 form of those (`isBlockedAddress`, fail closed
on anything unparseable). A pre-check of the host string cannot see DNS rebinding or a name that resolves to 127.0.0.1. Each of
the <=3 redirects is re-validated (https, no credentials, port 443, no IP literal); one timer covers all hops; the body is a
stream cut at `MAX_IMPORT_BYTES`. Pure URL rules (blob -> raw, .md/.zip) stay in `modules/skills/url.ts`; the adapter restates
the https/credential/port rules because adapters may not import modules.
Where: `src/adapters/http/safe-fetch.ts:36` (`createGuardedLookup`), `src/adapters/http/ip-guard.ts`.

### 2026-09-21 — Import truncates a skill description to 300 chars although `SkillInput` allows 500
`toPreview` cuts `description` at `MAX_DESCRIPTION_CHARS` (300), so a directive description longer than that loses its
"Do NOT apply when ..." tail when the skill is imported (file or URL) but not when created by hand. Keep descriptions of
importable skill samples under 300 chars (`docs/skill-samples/api-contract/*`).
Where: `src/modules/skills/import-parser.ts:107`.

### 2026-09-21 — Conventions evidence gate: the model may cite only what it saw, and the stored text is the file's
A convention is kept only if its `file` is one of the files put in the prompt and its `snippet` occurs there
(whitespace-collapsed, blank lines skipped, a copied `12| ` gutter stripped). The stored `evidence_line` /
`evidence_snippet` are then SLICED FROM THE FILE (nearest match to the model's line, max 12 lines), so a card can
never show code that is not in the repo; wrong lines are fixed, not trusted. `package.json` is shown only as a summary,
so it is not citable. A model that answers confidence on a 0-100 scale is read as percent from 10 up (85 → 0.85).
Where: `src/modules/conventions/verify.ts:86` (`verifyCandidates`), `src/modules/conventions/service.ts:146`.

### 2026-09-21 — `ports.ts` is core, so a module's ports declare narrow structural types instead of importing another module
`core-is-pure` lets `ports.ts` import only zod and other core, not `../repos/types.ts`. `conventions/ports.ts` therefore
declares `RepoLookup`, `SkillWriter` and `AgentSkillBinder` itself and the container passes `reposRepo`, `skillsRepo`,
`agentsRepo`, which satisfy them structurally. `appendSkill` lives on `AgentsRepository` and on that binder port only, not on
`AgentStore`: the in-memory `AgentStore` fakes in `test/agents-service.test.ts` would stop compiling.
Where: `src/modules/conventions/ports.ts:76`, `src/modules/agents/repository.ts:361`.

### 2026-09-23 — Flutter-first pass 1: `matchesAny`'s four hardcoded forms couldn't express a wildcard filename nested under a fixed directory
Excluding Dart codegen needed patterns like `**/l10n/app_localizations*.dart` and `**/generated/**`
(a directory anywhere, not a same-named prefix — `generated_helpers/` must NOT match `**/generated/**`).
The old `matchesAny` only had four literal branches (`dir/**`, `**/name` exact, `*.ext` suffix, exact
path), so it was replaced with a small compiled-regex glob (still just `*`/`?`/`**` and rooted-vs-`**/`
anchoring, no full minimatch). One deliberate wart kept for backward compat: a bare pattern with
**no** `/` and **no** wildcard (e.g. a literal filename) is an EXACT full-path match, not a
basename-anywhere match — `pnpm-lock.yaml` as a pattern does not match `client/pnpm-lock.yaml` (see
the existing test for that pattern). Everything else (any wildcard, or a leading `**/`) matches at any
depth. `applies_to` gating for skills/agents (spec 07) will reuse this same matcher.
Where: `src/modules/reviews/diff-filter.ts:17` (`compilePattern`).

### 2026-09-23 — A constant needed by two modules that don't import each other goes in `vendor/shared`, not one module re-exporting to the other
The repo-stack detector (spec 06, `modules/repos/`) needs the same generated/junk/lockfile/scaffold
patterns the conventions extractor already had in `modules/conventions/constants.ts`. Onion rules
forbid one feature module importing another's internals, so the patterns moved to
`@devdigest/shared` (`contracts/languages.ts`, new — also holds the ext→language table the client
diff-viewer chip uses) and `conventions/constants.ts` now re-exports them, unchanged for its own
callers (`sampling.ts`'s import of `./constants.js` didn't need to change).
Where: `src/vendor/shared/contracts/languages.ts:1`, `src/modules/conventions/constants.ts:4`.

### 2026-09-23 — Repo-stack detection rides the existing `clone` job; `Refresh` doesn't move HEAD, so a re-detect is only as fresh as the last fetch
`RepoService.detectAndStoreStack` runs at the end of `runCloneJob`, after `updateClonePath` — this
covers both Add (fresh clone) and the Refresh button (same job, re-enqueued) for free, no new job
kind needed. But `SimpleGitClient.clone` on an EXISTING clone directory only runs `git fetch`
(remote-tracking refs), never `git reset`/checkout — only `git.sync` (used by repo-intel's resync)
moves local HEAD. So Refresh re-detects the stack from whatever commit is currently checked out,
not necessarily origin's latest. Acceptable: a repo's stack (Flutter vs Next.js, its key packages)
changes on the order of months, not per-PR, and `POST /repos/:id/resync` gives an exact way to force
a real HEAD advance first.
Where: `src/modules/repos/service.ts:49` (`runCloneJob`), `src/adapters/git/simple-git.ts:106`.

### 2026-09-23 — jsonb read through `safeParse`, not `unknown`: an old/foreign `stack` row can never fail response serialization
`agents.output_schema` (existing code) is stored and read as opaque `unknown` — nothing validates
it. `repos.stack` takes the opposite, stricter approach on purpose: `RepoRepository.toRecord` runs
the raw jsonb through `RepoStack.safeParse` and falls back to `null` on any mismatch, because this
field IS meant to satisfy a fixed contract that ships in `GET /repos`'s response schema
(`fastify-type-provider-zod` — a shape mismatch there is a 500, not a client-side surprise). The
fallback also means a future `RepoStack` shape change degrades gracefully for already-stored rows
instead of breaking the endpoint; only `.nullish()` new fields keep the OLD data itself readable as
non-null, per the `run_traces` jsonb rule elsewhere in this file.
Where: `src/modules/repos/repository.ts:16` (`parseStack`).

### 2026-09-23 — Boot-time backfill is fire-and-forget and explicitly skipped under `NODE_ENV=test`
`backfillMissingStacks()` (repos cloned before stack detection existed) is called from
`repos/routes.ts` at plugin registration, matching where `registerCloneJobHandler()` already runs —
but UNLIKE the boot-time stale-run reaper in `app.ts` (which IS awaited, because it's a fast,
single DB query gating readiness), this is never awaited: a slow git read for one stale repo must
not delay every other repo or hold up `app.listen()`. It's skipped entirely when
`container.config.nodeEnv === 'test'`, because otherwise every test that builds a real `RepoRepository`
against `pg.handle.db` (most `*.it.test.ts` files) would get a background query racing its own
assertions and DB teardown — the same reason `registerCloneJobHandler` doesn't fire a clone on boot.
Where: `src/modules/repos/routes.ts:29`, `src/app.ts:80` (the reaper, for contrast).

### 2026-09-23 — `applies_to` gating (spec 07): fails open on missing signal, reuses the diff-filter matcher, and reads `pr_files` — not the live diff
Three deliberate choices worth knowing before touching this: (1) **fail open**, not
fail closed — `matchesAppliesTo` returns `true` whenever it has no changed-file signal to
judge against (empty `pr_files`, or every path excluded), so a PR nobody has opened yet
never silently loses a scoped skill/agent; the alternative (skip when unsure) would make a
brand-new PR's first review miss whatever agents happen to have `applies_to` set. (2) it
reuses `modules/reviews/diff-filter.ts`'s glob matcher rather than inventing a second
pattern language — the same `*.dart`/`dir/**` vocabulary already used for
`REVIEW_EXCLUDED_PATHS` gates skills and agents too. (3) agent-level gating
(`ReviewService.resolveTargets`) reads `getPrFiles(prId)` — the PERSISTED file list from
the last import/refresh — not the live `git diff`, because gating decides which agents
even get a `runId` before the (slower, per-agent) diff load happens; skill-level gating
inside `run-executor.ts` DOES use the loaded diff's paths, since the diff is already in
hand there and it's the authoritative, already-exclusion-filtered set.
Where: `src/modules/reviews/applicability.ts`, `src/modules/reviews/service.ts:59`
(`resolveTargets`), `src/modules/reviews/run-executor.ts` (`buildSkillBlocks`).

### 2026-09-23 — `isConfigChange`-style comparisons must not use `!==` on an array field
`AgentsRepository`'s config-change check compares most fields with plain `!==`, which
works for strings/booleans but is WRONG for `appliesTo: string[] | null`: two arrays are
never `===` even when equal, so a naive `patch.appliesTo !== existing.appliesTo` would
bump the agent's version (and write a wasted `agent_versions` snapshot) on every save that
merely round-trips the same globs — and the Agent editor's Config tab always sends the
FULL config on save (no dirty-diffing, unlike the Skill detail Config tab), so this would
have fired on every single save, not just ones that touched the field. Fixed with a small
element-wise `sameAppliesTo` helper instead of `!==`. Same trap awaits any future array or
object field added to `isConfigChange`.
Where: `src/modules/agents/helpers.ts` (`sameAppliesTo`, `isConfigChange`).

### 2026-09-23 — A literal `**/` inside a `/** */` JSDoc block closes the comment early — twice now
Writing gitignore-glob syntax examples straight into a doc comment (`` `**/name` ``,
`` `dir/**` ``) breaks the file with cryptic parser errors (`TS1443: Module declaration
names may only use ' or " quoted strings`, `TS1160: Unterminated template literal`) far
below the actual typo, because the literal `*/` inside the backticks closes the `/** */`
block right there. Hit once in `diff-filter.ts` (phase 05) and again in
`applicability.ts` (spec 07) before this got written down. Spell it out instead:
"`dir` + slash + `**`" / "`**` + slash + `name`", never the literal 2-character sequence.
Where: `src/modules/reviews/diff-filter.ts:17`, `src/modules/reviews/applicability.ts:5`.

### 2026-09-23 — A guarded prompt upgrade must check "already up to date" before "customised", or a fresh install is misreported
`seed.ts`'s `upgradePromptIfLegacy` only had one branch at first: `systemPrompt !== legacy
→ skip, logged as "customised"`. On a FRESH database the newly-inserted agent's
`systemPrompt` is already the NEW (neutral) prompt — which also isn't equal to `legacy` —
so every fresh install logged "skipped … — customised prompt" for General/Performance,
which is false (nobody customised anything; there was simply nothing to upgrade). Fixed
by checking `systemPrompt === next` (already current) FIRST and returning silently, before
the "does it match the old text" check that decides "upgrade" vs "genuinely customised".
Any future guarded-upgrade helper needs the same three-way branch (current / legacy /
other), not a two-way one.
Where: `src/db/seed.ts` (`upgradePromptIfLegacy`).

### 2026-09-23 — `pnpm typecheck` never sees `server/test/**` — a wrong field name in a test only fails at runtime
`server/tsconfig.json`'s `include` is `["src/**/*.ts"]`; vitest itself runs tests through
esbuild (types stripped, not checked), so a test file's type errors surface only when the
test actually executes and hits the wrong shape at runtime (here: passing `{skill_id: ...}`
where `SkillBinding` needs `{skillId: ...}` — a real Postgres NOT NULL violation, not a
compile error, and ESLint's `no-unused-vars` catches unrelated slips like a stray unused
`const` in a test, but not this). `pnpm lint` DOES run over `test/**` (eslint has no
tsconfig-style `include` restriction) — so lint catches unused-variable mistakes in tests
that typecheck silently allows, but neither one catches a field-name mismatch; only running
the test does. Don't trust `pnpm typecheck` passing as proof a new `*.it.test.ts` compiles
correctly — run it.
Where: `tsconfig.json:28` (`include`), `test/seed.it.test.ts` (where this was caught).

### 2026-09-24 — IntentRepository reads tables owned by pulls/repos
`IntentRepository.context` selects `pull_requests`, `repos` and `pr_files` directly (same shared-table
precedent as `reviews/repository/pull.repo.ts`); depcruise cannot see this coupling. Accepted for L03 —
when those tables change shape, update this repository too, or move the reads to function ports on
`IntentDeps` like `conventionsDeps` and keep `IntentStore` to `pr_intent` only.
Where: src/modules/intent/repository.ts:42, src/platform/container.ts:150

### 2026-09-25 — Agent models tag `Finding.scope` unreliably; hunk ranges fix it
On a real PR (cs2-lineups #8) only 3 of 6 deepseek-v4-flash agents tagged obvious out-of-scope
findings `out_of_scope`; the rest left client-file bugs "in scope". Fix: the intent classifier
cites numbered hunk ids it judges incidental, the server maps them to line ranges
(`incidental_changes`), and `applyScopePolicy` treats any finding inside one as out of scope → 5/6
agents folded correctly. Limits: hunk headers only (no diff bodies, by spec), so one hunk mixing
in- and out-of-scope code can't be split; asked "judge by path + context", the model also flagged
pubspec.yaml/lockfiles, hence the `NEVER_INCIDENTAL_PATTERN` guard.
Where: src/modules/intent/domain.ts:76, ../reviewer-core/src/scope.ts:60

### 2026-09-26 — PR-detail refresh didn't update `head_sha`
`replaceDetail` (run on every `GET /pulls/:id`) refreshed body/files/commits but not `head_sha`/`title`/
`base` — only the list sync did. After a push the row kept the old SHA while `pr_files` showed the new
commit, so intent `stale` never fired and a re-derive stored the old SHA. It now sets them too. The
existing stale test hid it by updating `head_sha` in the DB directly — test through `GET /pulls/:id`.
Where: src/modules/pulls/repository.ts:156, test/intent.it.test.ts

### 2026-09-26 — The gitignore-like glob matcher moved to `_shared/glob.ts`; a bare filename pattern still needs a `**` + slash prefix
Smart Diff's classifier (spec 09) needed the same pattern dialect `diff-filter.ts` already had, so
`escapeLiteral`/`translateSegment`/`compilePattern`/`cachedPattern`/`matchesAny` moved verbatim into
`modules/_shared/glob.ts` (onion: `_shared` is exempt from the cross-module-internals check);
`diff-filter.ts` now just imports and re-exports `matchesAny`, so its existing callers
(`applicability.ts`, `run-executor.ts`) and its own test keep passing unchanged. The one wart this
carries over: a bare pattern with no `/` and no wildcard is an EXACT full-path match, not
basename-anywhere — a classify rule for a file name needs a `**` + slash prefix (e.g. `**` + slash
+ `pnpm-lock.yaml`) to match at any depth.
Where: src/modules/_shared/glob.ts:70 (`matchesAny`), src/modules/smart-diff/constants.ts.

### 2026-09-26 — Smart Diff's `finding_lines` reuse the PR list's exact "latest round" rule, through `pulls/index.ts`
`SmartDiffService.forPull` calls `latestBatchByPr` + `latestRoundReviewIds` (now re-exported from
`pulls/index.ts`, same pattern as `PullsRepository`) against a `roundInputs(prId)` scoped to one PR,
so "the PR's latest review" never disagrees between the PR list, the PR page and Smart Diff. The
service takes only a narrow `SmartDiffStore` (its own `ports.ts`, not `pulls/ports.ts`) — the
repository just has to shape its rows the same way `pulls/repository.ts`'s `roundInputs` does.
Where: src/modules/smart-diff/service.ts:22, src/modules/pulls/index.ts:4.

## Tool & Library Notes

### 2026-09-17 — The "routes don't touch drizzle" rule fails on the starter's own routes
`CLAUDE.md` says modules are layered routes → service → repository, so the obvious ESLint
rule is `no-restricted-imports` for `drizzle-orm` under `src/modules/**/routes.ts`. Turning
it on reports `pulls`, `settings` and `workspace`, which all query the DB from the handler.
The rule is written up but left out of the config until those three grow a repository —
enabling it means rewriting starter code, not fixing a violation you introduced.
Where: `eslint.config.mjs:33`, `src/modules/pulls/routes.ts:3`.


### 2026-09-18 — Layer rules live in the onion-architecture skill, with a known-violations baseline
The 2026-09-17 entry left layer rules out of eslint because starter code breaks them. They now
run as dependency-cruiser from the skill; `known-violations.json` (40 entries) hides existing
debt, so only new violations fail. Rejected: eslint `no-restricted-imports` has no baseline, so
it would fail on day one. To move it into CI later, point `depcruise` at the same config + baseline.
Where: `../.claude/skills/onion-architecture/assets/dependency-cruiser.cjs:57`.

### 2026-09-18 — dependency-cruiser quirks when writing rules for this package
`octokit` is ESM-only and stays unresolved (path = bare `octokit`), so package rules must match
`(^|node_modules/)pkg(/|$)`. Nested quantifiers such as `(\.pnpm/[^/]+/)?` fail with "unsafe regular
expression". `depcruise src/modules/x` follows imports into other modules and reports their
violations too; to scope a report, run on `src` and grep the path.
Where: `../.claude/skills/onion-architecture/assets/dependency-cruiser.cjs:27`.

### 2026-09-18 — Supersedes "Layer rules live in the onion-architecture skill, with a known-violations baseline"
Still true: the rules live in the skill, not in eslint/CI. What changed: the baseline now has 45
entries, not 40. Application code is now fail-closed. `application-allowed-packages` allows only
zod, graphology, p-queue and `crypto`/`path`/`util`, so `fs/promises` and `os` in `repo-intel` were
added to the baseline as debt. An eval found the previous SDK list let an unlisted `@slack/web-api`
import through. A new pure library must be added to `APPLICATION_PKGS`.
Where: `../.claude/skills/onion-architecture/assets/dependency-cruiser.cjs:47`, rule at `:76`.

### 2026-09-18 — Batched upsert in Drizzle: `excluded.<column>` and one row per key
`onConflictDoUpdate` with `set` values written as the sql template `excluded.title` updates each row from its own
VALUES tuple. Postgres rejects a batch that hits the same conflict key twice ("cannot affect row a
second time"), so dedupe by the key first — GitHub's paginated PR list can repeat a PR.
Where: `src/modules/pulls/repository.ts:50`.

### 2026-09-19 — Supersedes "Layer rules live in the onion-architecture skill, with a known-violations baseline"
The baseline is gone: the layering debt was paid down from 45 entries to zero (pulls, settings, repos,
agents, reviews, repo-intel), so `pnpm arch` runs the skill's config without `--ignore-known` and any
violation fails CI. The rules still live in the skill (`assets/dependency-cruiser.cjs`), not in eslint.
Two things the rules do not see: application code importing `platform/resilience.ts` /
`platform/run-logger.ts`, and `RepoIntelService` taking the concrete `RepoIntelRepository` class.
Where: `package.json:15`, `../.claude/skills/onion-architecture/assets/dependency-cruiser.cjs:1`.

### 2026-09-21 — Listing a zip without inflating it: `unzipSync` with a filter that returns false
`FflateZipReader.list` passes a `filter` that records `{name, originalSize}` and returns `false`, so headers are read and
nothing is decompressed; `readText` then inflates one chosen entry. The import limits (200 entries, 1 MB file, 10 MB total)
are checked against the DECLARED `originalSize`; a header that lies about its size is not covered by a test **(unverified)**.
Where: `src/adapters/archive/zip.ts:19`, `src/modules/skills/import-parser.ts:141`.

### 2026-09-21 — `dns.lookup` callback shape and IP literals when guarding an outbound connect
`net.connect` calls a custom `lookup` with `{ all: true }` on Node 20+ (happy eyeballs) and expects an ARRAY of addresses;
without `all` it expects `(err, address, family)`. The guard must answer both shapes, so it always resolves with `all: true`
and adapts. `lookup` is never called for an IP-literal host (`https://169.254.169.254/`), so literals are rejected up front
instead (`assertPublicHttpsUrl`, and `IP_LITERAL` in `url.ts`, which cannot import `node:net`: the application ring only allows
`application-allowed-packages`). WHATWG `URL` already turns `2130706433` and `0x7f.1` into dotted form.
Where: `src/adapters/http/safe-fetch.ts:36`, `src/modules/skills/url.ts:12`.

### 2026-09-24 — deepseek-v4-flash spends max_tokens on reasoning first
It is a reasoning model: `max_tokens` covers reasoning + answer. With 600 the intent classifier got
`finish_reason: "length"`, 600 reasoning tokens and EMPTY content → "structured output failed schema
validation" (looks like a schema bug, isn't). Give reasoning models a budget of thousands (intent uses
4000, ~$0.0007/call); to see it, tee `fetch` and read `choices[0].finish_reason` + `usage.completion_tokens_details.reasoning_tokens`.
Where: src/modules/intent/constants.ts:15

### 2026-09-26 — drizzle 0.38 `numeric` reads back as a string
`numeric()` has no `mode: 'number'` in drizzle-orm 0.38.4: selects return `"0.00073598"`, and zod
`z.number()` then fails the whole row. `pr_intent.cost_usd` is `numeric(14,8)` (money is never a float), so
the repository maps `Number(row.costUsd)` on read and `String(cost)` on write. Other `cost_usd` columns
(runs, eval, ci) are still `double precision` — migrate them the same way if touched.
Where: src/db/schema/reviews.ts:104, src/modules/intent/repository.ts

## Recurring Errors & Fixes

### 2026-09-16 — Local dev DB is ahead of this branch's migrations
The `devdigest_pgdata` volume has 17 rows in `drizzle.__drizzle_migrations`, but the
repo has 10 (the volume was migrated from an integration branch). `agent_runs` already
has `cost_usd`, `critical_count` and similar columns, so `pnpm db:migrate` fails with
`column "cost_usd" ... already exists`. Fresh databases (Testcontainers, `scripts/e2e.sh`)
migrate fine. Decide with the owner whether to reset or reconcile; never `down -v` without asking.
Where: `src/db/migrations/meta/_journal.json:79` (the `0010_colossal_shaman` entry).

### 2026-09-16 — Reconciling the diverged dev DB without a reset
Follow-up to "Local dev DB is ahead": `0010_colossal_shaman` was reconciled by hand, no data lost.
Apply the new SQL with `ADD COLUMN IF NOT EXISTS`, then `INSERT INTO drizzle.__drizzle_migrations
(hash, created_at)` with hash = `shasum -a 256 <file>.sql` and created_at = the journal `when`;
`pnpm db:migrate` then reports applied. The migrator only runs files whose `when` is newer than the
last applied `created_at`.
Where: `src/db/migrations/meta/_journal.json:79`, `src/db/migrations/0010_colossal_shaman.sql:1`.

### 2026-09-18 — Supersedes "Failed background job may crash the process (unverified)"
Verified, then fixed: `test/jobs.test.ts` saw the `done` rejection reach `unhandledRejection` for a
fire-and-forget `enqueue()`. `enqueue` now attaches `done.catch(() => {})` — the failure is already
persisted as `status='failed'`, and a caller that awaits `done` still gets the rejection.
Where: `src/platform/jobs.ts:102`.

### 2026-09-18 — Supersedes "`RunBus.complete()` doesn't release buffers"
`complete()` now drops a run's buffer, seq and completed flag after `COMPLETED_RETENTION_MS` (5 min).
The flip side: a late SSE subscriber to a run the bus forgot would wait forever, so
`ReviewService.runStream()` checks `agent_runs` first — unknown run → 404, finished and not on the
bus → the stream closes at once (the persisted trace has the log). Tests inject a fresh bus via
`ContainerOverrides.runBus`.
Where: `src/platform/sse.ts:90`, `src/modules/reviews/service.ts:80`.

### 2026-09-18 — Reconciling a new migration with the ahead-of-branch local DB
The local volume already had several objects of `0011_low_stark_industries` with identical definitions
(`findings_review_idx`, `agent_runs_status_ck`, …) from the integration branch, and `db:migrate` runs
a file in one transaction, so the first "already exists" rolls it all back. What worked: feed the
file to `psql -v ON_ERROR_ROLLBACK=on` (savepoint per statement) inside BEGIN/COMMIT together with
the `__drizzle_migrations` insert (hash = `shasum -a 256`, created_at = journal `when`), after checking
that every "already exists" object has the same definition. `pnpm db:migrate` is then a no-op.
Where: `src/db/migrations/0011_low_stark_industries.sql:1`.

### 2026-09-19 — A "no DB" unit test passes locally and fails in CI when the handler reads the DB first
`POST /pulls/:id/review` calls `getContext` (workspace lookup) before it validates the body, so the test that expects
400 `invalid_run_request` needs a database. It passed on every dev machine (docker Postgres is up) and answered 500 on the
`server unit` CI lane (no DB). Reproduce it with `DATABASE_URL=postgres://x:x@127.0.0.1:1/x pnpm test:unit`; a DB-touching
test belongs in a `*.it.test.ts`, so it moved to `routes.it.test.ts`.
Where: `test/routes.it.test.ts:221`, `src/modules/reviews/routes.ts:38`.

### 2026-09-21 — Supersedes "Local dev DB is ahead of this branch's migrations": the dev schema was reset
Migration `0012` failed on the dev DB with `column "enabled" of relation "agent_skills" already exists` (the volume came
from another branch: 19 rows in `drizzle.__drizzle_migrations` vs 13 files). With the owner's OK the schema was dropped
(`DROP SCHEMA public, drizzle CASCADE; CREATE SCHEMA public`), then `pnpm db:migrate` and `pnpm db:seed`. The volume and
container stayed; keys live in `~/.devdigest/secrets.json`, so they survived. Repos must be re-added afterwards.
Where: `src/db/migrations/meta/_journal.json:93`.

### 2026-09-21 — Conventions scan fails about half the time on schema validation
While filming the HW2 demo, `POST /repos/:id/conventions/extract` failed 3 of 6 times with `The model call failed: OpenRouter
structured output failed schema validation for ConventionExtraction` (`deepseek/deepseek-v4-flash`, repo `artemmmon/cs2-lineups`).
Pressing Run Scan again succeeded every time; good scans took 52-115 s. `maxRetries` on `completeStructured` did not save it
**(unverified** whether it retries a schema failure or only transport errors). To do: log the rejected payload, then either retry
the call once in `extract` or loosen/repair the field that fails. Until then a scan failure is not a reason to debug the repo.
Where: `src/modules/conventions/service.ts:158`.

### 2026-09-24 — Adding shared pre-work to every review run made every un-mocked `reviews.it.test.ts`/`skills.it.test.ts` app hit real OpenRouter
The intent layer (L03) calls `deps.intent.forRun()` once per batch inside `ReviewRunExecutor.executeRuns`, and `review_intent`
defaults to the `openrouter` provider (`FEATURE_MODELS`). Any test app built with `buildApp({ overrides: { llm: { openai: mock } } })`
— i.e. every existing `appWith`/`makeApp` helper that only mocked the AGENT's own provider — left `openrouter` unmocked, so
`container.llm('openrouter')` fell through to a REAL `LocalSecretsProvider` reading `~/.devdigest/secrets.json`. On a machine with a
real key configured (any dev box that's run `./scripts/dev.sh`), this makes a genuine network call to OpenRouter on every review run,
even though `IntentService.forRun` itself fails open on error — the call SUCCEEDS, so there's no error to fail open from, just several
extra seconds and (observed) flakiness serving-order-dependent across the file (`server/test/skills.it.test.ts`: 18s → 3.4s after the
fix; `reviews.it.test.ts`: 43s and 3 unrelated tests failing → 3.2s and all green). Fix: add `secrets: new MockSecretsProvider({})` to
any `buildApp` override set that runs a review but doesn't already mock every provider it might resolve to — this makes BOTH
`container.github()` and `container.llm('openrouter')` throw `ConfigError`, which `IntentService` swallows deterministically (D9),
with zero network. A future feature that adds its own always-on pre-work LLM call needs the same audit of every `.it.test.ts` overrides object.
Where: `src/modules/reviews/run-executor.ts:124` (`this.deps.intent.forRun`), `test/reviews.it.test.ts:169` (`appWith`), `test/skills.it.test.ts:63` (`makeApp`).

### 2026-09-24 — Line-level scanners over PR text/diffs must skip URLs and hunk bodies
Two bugs caught by implementation-verifier in the intent layer: a bare-path regex over the PR body
also matched the path tail of every URL (`https://notion.so/x.md` → fetched `notion.so/x.md` from the
PR repo → spurious `not_found` that lowered confidence), and a raw-diff parser took an in-hunk
`+++ …` body line as a file header, leaking body text into the classifier prompt. Strip URLs and
markdown targets before scanning for bare paths; count `@@ -a,b +c,d @@` line totals to skip bodies.
Where: src/modules/intent/links.ts:88, src/modules/intent/hunks.ts:49

## Open Questions

### 2026-09-15 — Failed background job may crash the process (unverified)
`JobRunner.enqueue()` returns `{ id, done }`; `done` rejects on failure but nobody
awaits or catches it. On Node 22 an unhandled rejection exits the process.
Repro idea: add a repo with a non-existent URL.
Where: `src/platform/jobs.ts:49` (`enqueue`), `src/modules/repos/service.ts:68` (an
unawaited call site).

### 2026-09-15 — `RunBus.complete()` doesn't release buffers
The docstring says "release buffers/emitters", but only the emitter is deleted;
`buffers`, `seq` and `completed` grow for the life of the process.
Where: `src/platform/sse.ts:76` (`complete`).

### 2026-09-16 — `findings` has no index on `review_id`
Postgres does not index a foreign key automatically and `0000_init.sql` adds only the FK
constraint, so every read of findings by review is a sequential scan. The PR list now runs
one `IN (latest review ids)` query per page load on top of the existing reviews/runs
queries. Fine at seed scale; if the table grows, add the index in `db/schema/reviews.ts`
and regenerate with `pnpm db:generate` (never hand-write the migration).
Where: `src/db/schema/reviews.ts:28`, `src/db/migrations/0000_init.sql:378`,
`src/modules/pulls/routes.ts:163` (the `IN (latest review ids)` read).

### 2026-09-21 — Should editing a skill body version the agents bound to it?
Today it does not: agent snapshots store skill ids only, and a run's trace records the skill blocks (name, tokens) it
actually used, not their bodies. To reproduce an old run you would need `skill_versions`, which is written but not
linked from `agent_runs`. Decide before L06 (eval) needs reproducible runs.
Where: `src/modules/reviews/run-executor.ts:393` (`buildSkillBlocks`), `src/db/schema/skills.ts`.

### 2026-09-21 — Conventions: `last_scan` is the newest row, and an edited accepted rule can come back
There is no scans table: `last_scan` is the newest `conventions.created_at`, so a rescan that keeps nothing new does not
move it. "Never re-suggest" compares word sets (Jaccard >= 0.8) against accepted/rejected rules as stored, so a rule the
reviewer reworded may be proposed again in the model's original wording. A skill made from accepted rules is a snapshot;
rejecting a rule later does not change it. Decide if a `scans` table (and matching by evidence) is worth it.
Where: `src/modules/conventions/service.ts:70` (`list`), `src/modules/conventions/dedup.ts:33` (`dedupeCandidates`).

### 2026-09-24 — Two independent closing-issue detectors now exist, with different regexes and never persisted the same way
`OctokitGitHubClient.resolveLinkedIssue` (`octokit.ts:152`) keeps the OLD loose regex (`(?:closes|fixes|resolves)?\s*#(\d+)`,
keyword optional, first match only) feeding `PrDetail.linked_issue` — display-only, never persisted. The intent layer
(L03, `modules/intent/links.ts`) uses GraphQL `closingIssuesReferences` first (D6), then a stricter regex set (bare `#N`,
`owner/repo#N`, an issue URL, deduped, no keyword requirement) feeding the stored, LLM-visible `pr_intent.sources`. Nothing
unifies them; a PR whose `linked_issue` (Overview tab) differs from `pr_intent`'s picked issue is possible and not a bug.
Decide whether `PrDetail.linked_issue` should be retired in favour of the intent layer's detector.
Where: `src/adapters/github/octokit.ts:150` (`resolveLinkedIssue`), `src/modules/intent/links.ts:15` (`extractIssueRefs`).

## Session Notes

### 2026-09-16 — Run Cost Badge (L01)
Brought per-run `cost_usd` back and added `agent_runs.batch_id` so the PR list can sum
the latest batch. The entries above came from this work.
Where: `src/modules/pulls/cost.ts:19` (`latestBatchCostByPr`), spec `../specs/01-run-cost-badge.md`.

### 2026-09-16 — PR list severity breakdown (L01)
Added `PrMeta.findings_by_severity` (mirrored into `client/src/vendor/shared`) and
`modules/pulls/findings.ts`, following the cost-badge precedent: contract + pure rollup
module + one extra IN-query in the route, no schema change.
Where: `src/modules/pulls/findings.ts:70` (`severityByPr`), spec `../specs/02-findings-severity.md`.

### 2026-09-18 — onion-architecture skill
Added `.claude/skills/onion-architecture/`. It maps Onion rings onto `routes`, `service` and
`repository`, gives practices per tool and code patterns, and ships a runnable depcruise
check. The two Tool & Library entries above came from this work.
Where: `../.claude/skills/onion-architecture/SKILL.md:18`.

### 2026-09-18 — Phase 1 of the skills audit (security and crash fixes)
Repo URL hardening, job rejection fix, `API_HOST` (default `localhost`) and Postgres on
`127.0.0.1`, 5xx messages hidden outside development, test-connection saves a key only after it
passes, SSE 404 + RunBus retention. Plan: `~/.claude/plans/sunny-squishing-token.md`.
Where: `src/server.ts:29`.

### 2026-09-18 — Phase 2 of the skills audit (data integrity)
Indexes/CHECKs/FKs (migration 0011), transactions (agents, PR refresh, repo-intel replace*), batched
PR/settings upserts and agent-name lookup, JobRunner abort + per-repo serialisation + shutdown, git
token via header, GitHub errors → AppError, workspace scoping for runs/skills/repo-intel.
Where: `src/platform/jobs.ts:1`.

### 2026-09-19 — Phase 4 (server): layering debt to zero
Onion slices for pulls, settings, repos, agents, reviews and repo-intel; dead code and re-export
shims removed; response schemas on pulls/settings/repos/workspace; unit tests with fakes for the
services. Client refactors are tracked separately in `../client/INSIGHTS.md`.
Where: `src/modules/pulls/service.ts:1`.

### 2026-09-21 — Conventions extractor (HW2, server)
Added `modules/conventions/` (sampling, evidence gate, dedup, skill draft, five routes under `/repos/:id/conventions`),
`conventionsDeps` in the container, `AgentsRepository.appendSkill` and `evidenceFiles` on skill insert/update. The scan is
synchronous with an in-memory per-repo guard (409 `scan_in_progress`); a second API instance would not share it.
Where: `src/modules/conventions/service.ts:96`.

### 2026-09-21 — HW2 demo filming
Six live scans of `artemmmon/cs2-lineups` for the demo video: half failed on structured-output validation (see Recurring
Errors). No server code changed; the demo resets `conventions` rows with SQL because there is no delete route.
Where: `src/modules/conventions/service.ts:158`.
