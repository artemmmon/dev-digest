# Brainstorm: Export to CI (runner bundle source, `ci/` module origin, GitHub Actions access and ingest, work sequencing)
Status: chosen: option D1-1, D2-3, D3a-1, D3b-A, D4-2
Spec: specs/15-export-to-ci.md (SPEC-15, `Status: approved`)

Numbering: `ls docs/plans` ends at `10-multi-agent-review` (after rebasing onto main; it was `09-eval-pipeline` when this brief was written); the brainstorm agent takes "the next free number" and the plan reuses it (`.claude/agents/brainstorm.md:94-95`, `.claude/agents/implementation-planner.md:78`). Plans are numbered sequentially, not by spec id (`09-eval-pipeline` implements SPEC-13). So this brief is `11`, and the plan will be `docs/plans/11-export-to-ci.md`.

Notation: **[F]** = fact (I opened it), **[I]** = inference. Refs of the form `upstream/<branch>:<path>:<line>` were read with `git show`, never checked out. `fix` = `upstream/fix/numbered-diff-line-citations`, `finish` = `upstream/lesson-7-lab/multiagents-finish`, `runner` = `upstream/lesson-7-lab/agent-runner`, `example` = `upstream/devdigest/ci`.

## Problem

SPEC-15 fixes the behaviour and the wire. It leaves four build decisions open, and each has more than one structurally different answer:

1. **D1 (OQ-5)**: how the server obtains the built agent-runner bundle it exports (`.devdigest/runner/index.js` plus any ncc chunk and `package.json`).
2. **D2**: where the server `ci/` module comes from (two upstream implementations exist; the spec forbids parts of both).
3. **D3**: how GitHub Actions access (workflow runs, artifacts, secret names, repository id, deleting files in the export commit) enters the GitHub adapter and port, and how ingest is scheduled, deduplicated and written.
4. **D4**: the order of work inside this one feature and which step groups can run in parallel without sharing files, given that worktree A (Multi-Agent Review) merges first.

Done condition: the user picks an option per decision, then `implementation-planner` turns the choice into a plan. This brief writes no steps and no code.

## Context found

| # | Claim | F/I | Evidence |
|---|---|---|---|
| 1 | The repo has no `ci` server module, no `agent-runner` package, no `modules/memory`. Only the contracts `CiTarget/CiFile/AgentManifest/CiExportInput/CiInstallation/CiRun/CiResultArtifact` and the tables `ci_installations` / `ci_runs` exist. | F | `server/src/modules/index.ts:23-41`, `server/src/vendor/shared/contracts/eval-ci.ts:250-360`, `server/src/db/schema/ci.ts:5-30` |
| 2 | The shared `AgentManifest` has 7 fields and `CiResultArtifact` has 9, with `version: string` and no `verdict`, `commit_sha`, `repository_id`, `run_id`. The spec requires 9 and 16. | F | `eval-ci.ts:269-288`, `eval-ci.ts:345-356`, `specs/15-export-to-ci.md:100-101,105-110` |
| 3 | `ci_runs` has no workspace, commit SHA, GitHub run id or failure reason; `ci_installations` has no GitHub repository id, method, versions, PR url, triggers or post-as. The `repos` table has no GitHub repository id either. | F | `server/src/db/schema/ci.ts:5-30`, `server/src/db/schema/repos.ts:5-27` |
| 4 | `agent_runs.source` already allows `'ci'`; `agent_runs.status` is checked to `running/done/failed/cancelled`; traces are one jsonb row in `run_traces`. The only writer of both tables is the `reviews` module repository. | F | `server/src/db/schema/runs.ts:41,53-55,60`, `server/src/modules/reviews/repository/run.repo.ts:203-205` |
| 5 | `GitHubClient` already has `openPullRequest`, `commitFiles` (one Git Data API commit, parent = branch tip else base, additive only), `findOpenPr`, `getFileContent`. It has no repository lookup, no workflow-run, artifact or secret-name methods, and `commitFiles` cannot delete a path. | F | `server/src/vendor/shared/adapters.ts:155-195`, `server/src/adapters/github/octokit.ts:269-344` |
| 6 | The adapter funnels every REST call through `call()` (timeout, retry on 429/5xx, `AppError` mapping). The GitHub client is built from the `GITHUB_TOKEN` secret and cached in the container. | F | `octokit.ts:63-69`, `server/src/platform/container.ts:440-447` |
| 7 | Server pins `octokit@4.1.4` and `fflate@0.8.3`; `yaml@2.9.0` is in the lockfile. `fflate` is already used for zip reading in `adapters/archive/zip.ts` (header size checked before inflating). | F | `server/pnpm-lock.yaml:2409,2014,3013`, `server/package.json`, `server/src/adapters/archive/zip.ts:1-40` |
| 8 | Training runner: `agent-runner/` with `ncc build src/index.ts -o dist`, `dist/` git-ignored, README tells you to run `pnpm build`. It consumes `reviewer-core` and `server/src/vendor/shared` as raw TS through tsconfig path aliases; typecheck needs `reviewer-core/node_modules`. | F | `runner:agent-runner/package.json:9`, `runner:agent-runner/.gitignore:1-3`, `runner:agent-runner/README.md` ("Requirements", "Commands"), `runner:agent-runner/insights/INSIGHTS.md` ("What Doesn't Work") |
| 9 | The export on `example` holds `.devdigest/runner/index.js` 1,576,052 B, `310.index.js` 5,995 B, `package.json` 23 B (`{"type":"module"}`), `memory.jsonl` 0 B. The `fix` branch commits `agent-runner/dist/` (1,625,827 B + 5,796 B + 23 B). | F | `git ls-tree -r -l upstream/devdigest/ci`, `git ls-tree -r -l upstream/fix/numbered-diff-line-citations` |
| 10 | The ncc chunk name is a webpack module id (`310` became `300`); ncc does not clean `dist/`, so a stale chunk stays and would ship if the server copies the whole directory. | F | `fix:agent-runner/insights/INSIGHTS.md:24` |
| 11 | ncc README: single-file output, `-m` minify, `--no-cache` only skips cache population; it says nothing about reproducible output or about chunk files from dynamic `import()`. | F | https://github.com/vercel/ncc |
| 12 | `example` workflow uses `actions/*@v4` tags, checks out the PR head SHA, grants `contents: read` + `pull-requests: write` always. `finish` does the same (`@v4`, `ref: PR_HEAD_SHA_EXPR`). `fix` pins SHAs but uses a default checkout (no base-commit ref) and a workflow-written sidecar `devdigest-run.json` instead of result fields. All three miss AC-39, AC-40 or AC-118. | F | `git show upstream/devdigest/ci:.github/workflows/devdigest-review.yml`, `finish:server/src/modules/ci/workflow.ts:120-126,141`, `fix:server/src/modules/ci/workflow.ts:121,147`, `fix:server/src/modules/ci/constants.ts:93-97` |
| 13 | `finish` ci module: 12 files; `CiService` takes the whole `Container` (`constructor(private container: Container)`), ingest takes `Container`, agent runs go through `container.reviewRepo.createCiAgentRun`, the bundle dir is resolved from `import.meta.url`, tags not SHAs. Its retro records "`ci_runs` table left untouched/dead". | F | `finish:server/src/modules/ci/service.ts:32,106,290`, `finish:server/src/modules/ci/ingest.ts:5,36,101`, `finish:docs/retros/2026-07-08-export-to-ci-run.md` (decisions Q1) |
| 14 | `fix` ci module: 20 files, 40 KB `service.ts`, constructor takes ports (`CiRepository`, `AgentLookup`, `SkillLookup`, `MemoryReader`, `RepoLookup`, `() => GitHubClient`, bundle dir, `SecretsProvider`); several agents per repository (roster table `ci_installation_agents`), `pruneDirs`, `RefreshDebounce` (in-memory 30 s map), `POST /ci/refresh {force}`, unique index `ci_runs_provider_run_uq (workspace_id, provider_run_id)`, secret-shape scanner `redact.ts`, zip reader limited to named entries and 256 KB. | F | `fix:server/src/modules/ci/service.ts:147-165`, `fix:server/src/modules/ci/refresh.ts`, `fix:server/src/modules/ci/redact.ts`, `fix:server/src/modules/ci/ingest.ts:16-18`, `fix:server/src/db/schema/ci.ts:64-76,104,169`, `fix:server/src/modules/ci/routes.ts` |
| 15 | `fix` `pruneDirs` runs only when the branch already exists (`if (branchExists && pruneDirs.length > 0)`), and `ci/service.ts` passes `[DEVDIGEST_DIR]`. When `devdigest/ci` does not exist yet and the default branch already holds another agent's manifest, nothing is pruned, so AC-12 would fail in that case. | F (code) / I (consequence) | `fix:server/src/adapters/github/octokit.ts:346`, `fix:server/src/modules/ci/service.ts:469` |
| 16 | `fix` bundle builder scans every generated file, runner files included, with `key|token|secret\s*[:=]\s*[A-Za-z0-9+/_-]{24,}`-style patterns. A 1.6 MB minified bundle may trip a pattern; I did not run it. | F (code) / I (risk) | `fix:server/src/modules/ci/redact.ts` (SECRET_SHAPE_PATTERNS), `fix:server/src/modules/ci/bundle.ts` (final loop) |
| 17 | `fix` preview nulls the runner files' `contents` and keeps `bytes`/`sha256`, so the 1.6 MB bundle is not re-sent to the browser on each Configure change; export and zip use the real contents. This is the shape AC-15 needs. | F | `fix:server/src/modules/ci/bundle.ts` (`toPreviewFiles`, comment above it) |
| 18 | GitHub REST (primary docs): list runs for a workflow takes `status`, `created`, `event`, `per_page` (max 100), `head_sha`; a run has `id`, `head_sha`, `pull_requests`, `html_url`, `conclusion`, `run_started_at`, `repository.id`. Artifacts: list per run with `name`, `size_in_bytes`, `expired`, `expires_at`; download is a 302 to a URL that lasts 1 minute. Secrets list returns names and timestamps only. Docs name the `repo` scope for classic tokens and do not name fine-grained permissions. | F | https://docs.github.com/en/rest/actions/workflow-runs , https://docs.github.com/en/rest/actions/artifacts , https://docs.github.com/en/rest/actions/secrets |
| 19 | `GITHUB_RUN_ID` and `GITHUB_REPOSITORY_ID` are default Actions variables; the page does not say what `GITHUB_SHA` is for `pull_request`. | F | https://docs.github.com/en/actions/reference/workflows-and-actions/variables |
| 20 | `finish` adapter already calls `octokit.rest.actions.listWorkflowRuns`, `listWorkflowRunArtifacts`, `downloadArtifact`. I could not confirm them against `node_modules` here (not installed in this worktree). | F (usage) / I (available in 4.1.4) | `finish:server/src/adapters/github/octokit.ts:394,448,468`, `server/pnpm-lock.yaml:966,2409` |
| 21 | Architecture rules: services get narrow ports through the constructor, never the `Container`; one anti-corruption layer per SDK; the service owns the transaction (a unit-of-work port keeps `tx` in the outer ring); `pnpm arch` runs in CI. `modules/reviews` exposes only six pure names through `index.ts`, and `eval` reaches reviews only that way (ADR 0001). | F | `.claude/skills/onion-architecture/SKILL.md` ("Principles" 3, 5, 6), `server/package.json` (`arch`), `docs/0001-eval-runs-are-their-own-module.md` (Decision 1) |
| 22 | Per-route rate limit idiom: `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }`; it is inert when `NODE_ENV=test`. | F | `server/src/modules/eval/routes.ts` (eval-runs POST), `server/src/app.ts:114-115`, `server/INSIGHTS.md:526-527` |
| 23 | A new package has to be registered in five places: root `AGENTS.md` packages table and "Do not touch" lock-file list, `.claude/skills/pr-self-review/assets/routing.json` (`packages`, `generated.lockfiles`), a path-filtered workflow (`mcp.yml` is the template: it also lists `server/src/vendor/shared/**`), and the shared-contracts drift workflow. | F | `AGENTS.md` (Packages, Do not touch), `routing.json:18-30,32-70`, `.github/workflows/mcp.yml:1-25`, `.github/workflows/shared-contracts.yml` |
| 24 | `ci_fail_on` is stored on the agent and a change of it counts as a config change in the agent helper, so the version moves and an installation shows Outdated (EC-18) without extra work. | F (stored, counted) / I (version bump) | `server/src/db/schema/agents.ts:28`, `server/src/modules/agents/helpers.ts:104` |
| 25 | `resolvedSkills(agentId)` returns skills in binding order where binding and skill are enabled: this is the AC-19 skill list. A `memory` table exists with `scope` (`repo/global/team`) and `repo_id`. | F | `server/src/modules/agents/repository.ts:387`, `server/src/modules/agents/ports.ts:112-121`, `server/src/db/schema/knowledge.ts:8-28` |
| 26 | Client: a new agent tab needs two edits (`TABS` and the page's `VALID_TABS`); the sidebar label for a feature namespace goes through `NAV_LABEL_KEYS`; the kit `Modal` has no Escape handling and no focus return (NFR-7 needs both); the design has a GLOBAL section with "CI Runs". The current `NAV` has no GLOBAL section. | F | `client/INSIGHTS.md:365-368,382-384,358-362`, `client/docs/design/src/chrome.jsx:15-19`, `client/src/vendor/ui/nav.ts:25-45` |
| 27 | Worktree A's branch (`upstream/emdash/multi-agents-review-v1x`) has a stale merge base (`587c46a`), so its diff against `main` says nothing about what A will change in `vendor/shared`, migrations or `reviewer-core`. | F | `git merge-base upstream/emdash/multi-agents-review-v1x main` |
| 28 | The next migration number is `0026`; both worktrees would generate the same index and edit `meta/_journal.json`. | F (latest is 0025) / I (collision) | `server/INSIGHTS.md:619-621` (names `0025_premium_dragon_lord.sql`), `server/src/db/migrations/meta/0025_snapshot.json` |

## Options

### D1. Source of the built runner bundle (OQ-5)

The server must give the wizard a file list that holds `.devdigest/runner/*` and must write the same bytes into the PR and the zip.

**D1-1. Commit the built bundle, guard it with a CI drift check.** `agent-runner/dist/` is committed (root `.gitignore` un-ignores it, as `fix` does at `fix:.gitignore:3-6`). The server reads the directory from a known path (`AppConfig.ciRunnerBundleDir`, default `../agent-runner/dist`, env override for tests; `fix:server/src/platform/config.ts:40,93-107`) and copies every file in it. A workflow rebuilds on Linux and fails when the result differs from the committed bytes. *Pros*: no build step before the first export, hermetic e2e, the exported bytes equal what CI verified, nothing to execute in the API process. *Cons*: ~1.6 MB per rebuild enters history; a binary-like single-line file conflicts when two worktrees both change `reviewer-core`, `vendor/shared` or `agent-runner`; reproducibility across macOS and Linux is unverified. *Risks*: ncc nondeterminism makes the drift check flaky; a runner source change without a rebuilt `dist/` is caught only by that check.

**D1-2. Build in a script and CI step, read a gitignored `dist/` from the same known path.** Same server code as D1-1, but `agent-runner/dist/` stays ignored; `./scripts/dev.sh`, `./scripts/e2e.sh` and the server-integration workflow run `install + build` for `agent-runner` (like they already do for `reviewer-core`, `scripts/dev.sh:79-80`). A missing directory gives a `ValidationError` that names the build command (`fix:server/src/modules/ci/bundle.ts` does this). *Pros*: nothing large in git, no merge friction, always built from the lockfile. *Cons*: a fresh clone cannot export until the build ran; a stale `dist/` exports an old runner silently (fact 10); another install in dev.sh, e2e.sh and two workflows.

**D1-3. Build on demand inside the server at export.** `@vercel/ncc` becomes a server dependency; the export builds (in process or as a child process) and caches by a hash of the sources. *Pros*: always current. *Cons*: the API process runs a toolchain over sibling packages whose `node_modules` it needs; seconds on the first export; widens the server's dependency and install-script surface (security skill rules 3 and 13); needs a `BundleBuilder` port plus adapter for a build step that is not server I/O.

**D1-4. Do not bundle: export transpiled sources plus a `package.json`, and let the workflow install.** The workflow runs `npm ci` and then `node …`. *Pros*: files are readable in the PR. *Cons*: the install runs in the target repo's job next to `OPENROUTER_API_KEY`; the runner still needs a build to turn `reviewer-core` raw TypeScript into JavaScript, so no pipeline is saved; AC-39 and AC-15 get harder (many files, an install step to protect).

### D2. Origin of the `ci/` module

**D2-1. Port `finish` (12 files) and adapt.** Smallest code, closest to the "simple" module.
**D2-2. Port `fix` (20 files) and strip.** Newer, ports through the constructor, redaction and zip hardening exist; roster, prune, sidecar, `agentPerformance`, `force` refresh and the memory module dependency must come out or be re-shaped.
**D2-3. Write the module fresh in the onion layout, lifting the pure leaves.** `routes.ts` → `service.ts` → `repository.ts`, `ports.ts`, `domain`/pure helpers; copy-and-adapt only leaf files that have no ring problem: `slug`, `manifest`, `memory-export`, `redact`, the zip entry checks from `ingest`, the `toPreviewFiles` idea from `bundle`, the PINNED_ACTIONS table (to be re-verified), with their unit tests. The workflow generator is rewritten to AC-34..AC-45, AC-117, AC-119 (neither upstream satisfies them: fact 12).

### D3. GitHub Actions access, ingest trigger, idempotency

**D3a. Where the new GitHub calls live**
- **D3a-1. Extend the existing `GitHubClient` port** (`vendor/shared/adapters.ts`) with `getRepository`, `listWorkflowRuns`, `listRunArtifacts`, `downloadArtifact`, `listRepoSecretNames` (null on 403, as `fix:adapters.ts:206-222`), and give `CommitFilesPayload` a way to delete paths; implement in `OctokitGitHubClient` and `MockGitHubClient`.
- **D3a-2. A second, narrow port in `modules/ci/ports.ts`** with its own adapter file `adapters/github/actions.ts` built from the same token. The export still needs `commitFiles`, `openPullRequest`, `findOpenPr` from the first port, and the delete capability still changes `CommitFilesPayload`, so the module would use two ports onto one SDK.

**D3b. Ingest trigger, 30 s skip, one run per run id**
- **D3b-A. Client-driven pull; the gate and the dedup live in the database.** `POST /ci/refresh {force}`, rate limit 30/min. A column `ci_installations.last_ingested_at` is claimed with one statement (`UPDATE … WHERE last_ingested_at IS NULL OR < now() - 30 s RETURNING`); `force` (the Refresh button) bypasses it. A unique index on the GitHub run id plus `INSERT … ON CONFLICT DO NOTHING RETURNING` inside one transaction that also writes the `agent_runs` row and its `run_traces` row only when the insert returned a row (the service owns the transaction through a unit-of-work port; precedent `server/INSIGHTS.md:100-107`).
- **D3b-B. Client-driven pull; the 30 s gate is an in-memory `Map` in the service** (as `fix:server/src/modules/ci/refresh.ts`, the same pattern as the in-flight map of the brief service, `server/INSIGHTS.md:415-417`); dedup is still the unique index plus transaction.
- **D3b-C. A server timer** (job runner every 60 s for all workspaces) instead of, or in addition to, the page polling.
- **D3b-D. Ingest inside `GET /ci/runs`** (read triggers GitHub calls).

**Writing the agent run** (sub-decision, one viable way): the `ci` repository writes `ci_runs`, `agent_runs` and `run_traces` in one transaction. See "Rejected upfront" for the alternative.

### D4. Sequencing and parallel step groups

- **D4-1. Layers, strictly in series**: contracts → runner → schema/migration → adapter → `ci/` pure files → repository/service/routes/container → client → nav. One implementer at a time.
- **D4-2. Contracts first, then disjoint parallel tracks, shared items last.** Group 0 (serial, one writer): contracts and the port change in `server/src/vendor/shared`, `./scripts/shared-contracts.sh sync`. Then in parallel: Track R (the `agent-runner` package and its CI/registration files), Track S1 (pure `modules/ci/` generators), Track S2 (`adapters/github/octokit.ts` + `adapters/mocks.ts`), Track C (client). Then Track S3 (schema, migration, repository, service, routes, container wiring) once S1 and S2 interfaces exist. Last, after worktree A is merged and this branch rebased: `pnpm db:generate`, the nav GLOBAL entry, `shared-contracts.sh check`, the integration and e2e runs.
- **D4-3. Vertical slices**: slice 1 = export (preview, install, wizard, CI tab shell, runner); slice 2 = ingest (adapter calls, `ci_runs` columns, CI Runs page, tab history).

## Rejected upfront

| Option | Rule broken | Source |
|---|---|---|
| Hand-rolled `fetch` calls from the server to the GitHub REST API for runs/artifacts (D3a) | One anti-corruption layer per SDK; SDK access, retry, timeout and error mapping belong to `src/adapters/github/` | `.claude/skills/onion-architecture/SKILL.md` (Principle 5) |
| Add `createCiAgentRun` / CI listing to the `reviews` repository (the training run's "single writer", `finish:server/src/modules/ci/ingest.ts:101`) | NFR-11 leaves the multi-agent run service and PR feed unchanged; worktree A owns that module; modules meet only through `index.ts` (ADR 0001) | `specs/15-export-to-ci.md:322,119`, `docs/0001-eval-runs-are-their-own-module.md` |
| A route that accepts a CI result from the caller (push ingest) | Non-goal and NFR-3: results enter only by the server downloading them with the stored token | `specs/15-export-to-ci.md:29,314` |
| Several agents per repository, roster table, `devdigest-run.json` sidecar (taken from `fix` as is) | Non-goals (one agent per repository, replaced after confirmation); AC-118 and NFR-12 put commit SHA, repository id and run id in the result itself | `specs/15-export-to-ci.md:41,32,101,106-109` |
| `pull_request_target`, tag-pinned actions, checkout of the PR head for the runner (what `example`/`finish` generate) | AC-35, AC-40, AC-39; security skill rule 12 | `specs/15-export-to-ci.md:169-173`, `.claude/skills/security/SKILL.md:68-69` |
| Publish the runner (npm package, release asset or action) and let the server download it | Judgment, not a hard rule: no publishing workflow exists in `.github/workflows/`, it adds a network and trust dependency at export time, and the spec lists "a published `devdigest/review-action`" as a non-goal. Revisit if the bundle is ever shared outside this repo | `specs/15-export-to-ci.md:34`, `.github/workflows/` (client, e2e-web, evals, mcp, pr-self-review, reviewer-core, server-*, shared-contracts) |

## Criteria & weights

Weights (1-5) are fixed before scoring, per decision. Scores are 1-5, higher is better. Maxima = 5 x sum of weights.

| Decision | Criteria (weight) |
|---|---|
| D1 | Security / supply chain (5) · Reproducibility and staleness protection (4) · Dev loop for a fresh clone, `dev.sh`, e2e (4) · Merge friction and repo size (3) · Scope and effort (3) · Fit with conventions (3) · Testability (3). Sum 25, max 125 |
| D2 | Fit with the onion layout and conventions (5) · Fit with SPEC-15 (5) · Scope and effort (3) · Risk and reversibility (3) · Testability (3) · Security surface (4). Sum 23, max 115 |
| D3a | Fit with architecture (5) · Overlap on shared files with worktree A (4) · Effort (2) · Testability (3) · Security surface (3). Sum 17, max 85 |
| D3b | Fit with AC-99..101, 115, 116 (5) · Safety under concurrent refreshes (5) · Effort (3) · Testability (3) · Architecture fit (3) · GitHub rate budget (3). Sum 22, max 110 |
| D4 | Merge-conflict risk with worktree A (5) · Contract rework risk (4) · Parallelism / elapsed time (3) · Verifiability per group (3) · Coordination overhead (2). Sum 17, max 85 |

## Scoring matrix

### D1

| option | Sec (5) | Repro (4) | Dev loop (4) | Merge/size (3) | Effort (3) | Fit (3) | Test (3) | weighted total |
|---|---|---|---|---|---|---|---|---|
| D1-1 commit + drift check | 4 | 3 | 5 | 2 | 3 | 4 | 5 | **94** |
| D1-2 build step, ignored `dist/` | 3 | 3 | 2 | 5 | 3 | 3 | 4 | 80 |
| D1-3 build in the server | 2 | 3 | 3 | 5 | 2 | 2 | 2 | 67 |
| D1-4 unbundled + install in CI | 1 | 3 | 3 | 4 | 2 | 2 | 3 | 62 |

Evidence (one line each):
- D1-1: Sec 4: exported bytes equal the CI-verified bytes, no toolchain at export, no network [I]. Repro 3: drift check helps, but ncc determinism is undocumented (fact 11) and untested. Dev 5: `fix` shipped it this way and the export works on a fresh clone (fact 9, `fix:.gitignore:3-6`). Merge/size 2: 1.6 MB per rebuild, single-line conflicts (fact 9) [I]. Effort 3: un-ignore, drift workflow, config path. Fit 4: config-path pattern as `cloneDir`/`ciRunnerBundleDir`. Test 5: the real directory or an injected fake (`fix:server/test/ci-export.it.test.ts:22`).
- D1-2: Sec 3: exported bytes depend on whatever was built on that disk; install runs on the dev machine [I]. Repro 3: built from the lockfile, but staleness is invisible at export (fact 10). Dev 2: extra install + build in dev.sh, e2e.sh and CI before the first export works [F: dev.sh:79-80 shows the existing pattern]. Merge/size 5. Effort 3. Fit 3. Test 4: unit tests inject a fixture directory; one smoke test needs the build.
- D1-3: Sec 2: child process or in-process webpack in the API; ncc plus `agent-runner` deps must be installed beside the server (security skill rules 3, 13). Repro 3. Dev 3: no build step but slow first export. Merge/size 5. Effort 2: cache, timeout, concurrency, port + adapter. Fit 2. Test 2: slow, heavy integration tests.
- D1-4: Sec 1: `npm ci` runs in the job that holds `OPENROUTER_API_KEY` (spec untrusted-input table, `specs/15-export-to-ci.md:345`). Repro 3: lockfile exported. Dev 3. Merge/size 4. Effort 2: a transpile pipeline is still needed for raw-TS `reviewer-core`. Fit 2. Test 3.

### D2

| option | Fit onion (5) | Fit SPEC-15 (5) | Effort (3) | Risk (3) | Test (3) | Sec (4) | weighted total |
|---|---|---|---|---|---|---|---|
| D2-1 port `finish` | 2 | 1 | 3 | 2 | 2 | 2 | 44 |
| D2-2 port `fix`, strip | 4 | 2 | 2 | 3 | 3 | 4 | 70 |
| D2-3 fresh, lift pure leaves | 5 | 5 | 2 | 3 | 4 | 4 | **93** |

Evidence:
- D2-1: Onion 2: whole `Container` in service and ingest (fact 13) so `pnpm arch` would very likely flag it [I, not run]. SPEC 1: tags, PR-head checkout, `reviewRepo` writer, `ci_runs` left dead (facts 12, 13). Effort 3: small, but most of it is rewritten. Risk 2, Test 2: tests assert the old behaviour. Sec 2: no redaction module, no SHA pins.
- D2-2: Onion 4: ports through the constructor (fact 14). SPEC 2: roster, sidecar, `agentPerformance`, prune and `force` all need removal or reshaping; the workflow still breaks AC-39/AC-118 (fact 12). Effort 2: stripping half a 40 KB service is slower than writing the small one. Risk 3. Test 3: `bundle.test`, `redact.test`, `workflow.test` can be adapted. Sec 4: `redact.ts`, bounded zip reader, SHA pins already exist.
- D2-3: Onion 5, SPEC 5: built against the AC ids. Effort 2: two of the larger files are new. Risk 3: the leaves are proven; the new parts are covered by in-memory fakes. Test 4. Sec 4: lifted checks are re-verified rather than trusted (fact 16 shows one needs a runner-file exemption).

### D3a

| option | Fit (5) | Overlap with A (4) | Effort (2) | Test (3) | Sec (3) | weighted total |
|---|---|---|---|---|---|---|
| D3a-1 extend `GitHubClient` | 5 | 2 | 4 | 4 | 4 | **65** |
| D3a-2 narrow second port | 4 | 3 | 3 | 3 | 3 | 56 |

Evidence: D3a-1 Fit 5: all GitHub I/O stays in one port and adapter, `call()` handles errors (fact 6); Overlap 2: edits `vendor/shared/adapters.ts` plus the client copy and the `mcp` type-drift check (fact 23); Test 4: `MockGitHubClient` in `adapters/mocks.ts:228-233` gets the same methods. D3a-2 Overlap 3: `CommitFilesPayload` still changes, so `adapters.ts` is touched anyway (fact 5); Effort 3 and Sec 3: a second class either duplicates `call()`/`toAppError` or forces an extraction.

### D3b

| option | Spec (5) | Concurrency (5) | Effort (3) | Test (3) | Arch (3) | Rate (3) | weighted total |
|---|---|---|---|---|---|---|---|
| D3b-A DB claim + unique index | 5 | 5 | 3 | 4 | 4 | 5 | **98** |
| D3b-B in-memory gate + unique index | 4 | 4 | 4 | 5 | 4 | 3 | 88 |
| D3b-C server timer | 2 | 3 | 2 | 2 | 3 | 2 | 52 |
| D3b-D ingest on read | 2 | 2 | 4 | 3 | 2 | 1 | 50 |

Evidence: A: the claim statement makes "two tabs refresh at once" (EC-14) one GitHub read per installation, survives a restart, and the unique index closes the rest of AC-115. B: a restart or two simultaneous requests can both call GitHub; rows are still deduplicated, so the damage is only extra API calls. C: AC-99 says the client requests the refresh while a page is open; a timer spends GitHub budget with nobody looking and needs a single-runner assumption. D: AC-116 needs a distinct refresh with its own failure notice; GET with side effects breaks it.

### D4

| option | Conflict (5) | Rework (4) | Parallel (3) | Verify (3) | Coord (2) | weighted total |
|---|---|---|---|---|---|---|
| D4-1 layers in series | 4 | 5 | 1 | 4 | 5 | 65 |
| D4-2 contracts first, parallel tracks | 4 | 4 | 4 | 4 | 3 | **66** |
| D4-3 vertical slices | 2 | 3 | 2 | 5 | 3 | 49 |

Evidence: D4-1 and D4-2 share the same late-binding rule (migration after A, nav last), so Conflict is equal at 4; D4-2 trades one point of Rework (the runner and server are built against contracts frozen in Group 0, which can still prove incomplete) and Coordination for three more points of Parallel. D4-3 touches `vendor/shared`, `container.ts` and `modules/index.ts` twice and needs two migrations, doubling the collision surface (fact 28) [I].

## Sensitivity

Move the top weight by +/-1, plus the stress cases that matter.

- **D1**: Security 5 to 4 gives 90 vs 77, to 6 gives 98 vs 83 (D1-1 vs D1-2): same winner. Raising Merge/size from 3 to 5 gives 98 vs 90: same winner, gap shrinks from 14 to 8. If a spike shows ncc output is not reproducible between macOS and Linux (Repro of D1-1 drops to 1) and Merge/size is also 5, D1-1 and D1-2 tie at 90. That is the flip.
- **D2**: Fit 5 to 4 gives 88 vs 66 (D2-3 vs D2-2), to 6 gives 98 vs 74. Weighting Effort at 5 gives 97 vs 74: same winner.
- **D3a**: Fit 5 to 4 gives 60 vs 52, to 6 gives 70 vs 60. Overlap 4 to 5 gives 67 vs 59. Same winner.
- **D3b**: Concurrency 5 to 4 gives 93 vs 84, to 6 gives 103 vs 92. Effort at 5 gives 104 vs 96. Same winner.
- **D4**: Conflict 5 to 4 gives 61 vs 62; to 6 gives 69 vs 70. The two top options stay within one point: the choice rests on elapsed time against coordination overhead. Raising Coordination from 2 to 5 makes D4-1 win (80 vs 75). This is a user call (see question 5).

## Recommendation

1. **D1: option D1-1** (commit the bundle, add a CI drift check). It is the only option that works on a fresh clone with no extra step, keeps the exported bytes identical to the verified ones, and runs nothing at export time. It costs repo size and merge friction, which D1-2 avoids. Flips to D1-2 if the first spike (build twice, on macOS and on Linux CI, compare bytes) shows ncc is not reproducible, or if worktree A also changes `reviewer-core` or `vendor/shared` and the single-line conflicts become routine.
2. **D2: option D2-3** (fresh onion module, lifting pure leaves with their tests). Both upstream modules fail the spec (facts 12-14) and the lighter one fails the layering rule. Flips to D2-2 only if the user wants speed over spec fit and accepts stripping the roster by hand.
3. **D3a: D3a-1; D3b: D3b-A; writes in the `ci` repository.** Existing pattern, one place for GitHub errors, and the claim plus unique index covers AC-101, AC-115 and EC-14 in the database. Flips to D3b-B if the extra column is unwanted (acceptable: duplicate GitHub reads on a double refresh are harmless).
4. **D4: D4-2** with the order in "For the planner". Flips to D4-1 if token cost or coordination matters more than elapsed time (the docs say agent cost is context x calls per agent, so parallel tracks re-read shared context: `docs/agent-workflow-cost.md`).

## For the planner

**Modules and files (verify each path yourself before planning)**

- Server (new): `server/src/modules/ci/**` (`routes.ts`, `service.ts`, `repository.ts`, `ports.ts`, pure `slug/manifest/workflow/bundle/redact/memory-export/ingest-check`), register in `server/src/modules/index.ts`, wire in `server/src/platform/container.ts` (a `ciDeps`-style getter, per `server/INSIGHTS.md:146-151`), config key for the bundle directory in `server/src/platform/config.ts`.
- Server (edit): `server/src/vendor/shared/adapters.ts` (new GitHub methods, delete-capable `CommitFilesPayload`, `GitHubClient`), `server/src/vendor/shared/contracts/eval-ci.ts` (manifest, result, installation, run, file with nullable contents plus `bytes`/`sha256`, preview and export bodies, constants `MANIFEST_VERSION`/`RUNNER_VERSION`), `server/src/adapters/github/octokit.ts`, `server/src/adapters/mocks.ts`, `server/src/db/schema/ci.ts` (+ `server/src/db/schema.ts` barrel) and a migration from `pnpm db:generate` only.
- Client (edit/new): `client/src/app/agents/[id]/page.tsx` (`VALID_TABS`), `…/AgentEditor/constants.ts` and `AgentEditor.tsx`, new `…/AgentEditor/_components/CiTab/**` (wizard colocated, one consumer), `client/src/app/ci-runs/**`, `client/src/lib/hooks/ci.ts`, `client/src/lib/query-keys.ts`, `client/src/vendor/ui/nav.ts` + `client/src/components/app-shell/hooks/useNavLabel.ts`, `client/messages/en/ci.json` (replace the "Requires a GitHub App" strings, NFR-8), and the synced `client/src/vendor/shared`.
- New package `agent-runner/` (copy from `runner`, then change: manifest and result schemas, `commit_sha`/`repository_id`/`run_id`/`runner_version`/`verdict` in `artifact.ts`, head SHA from the workflow, base-commit run, `.devdigest/` and `.github/workflows/` excluded from the diff). Registration: root `AGENTS.md` (package row, lock file in "Do not touch"), `.claude/skills/pr-self-review/assets/routing.json`, a new `agent-runner.yml` workflow (path filter also `reviewer-core/**`, `server/src/vendor/shared/**`), the `.gitignore` un-ignore if D1-1.

**Constraints**

- Contracts: edit the server copy, then `./scripts/shared-contracts.sh sync`, CI runs `check` (`AGENTS.md` Cross-package rules). Migration only through `pnpm db:generate`; generate it last, after worktree A is merged and this branch rebased (fact 28). `server/clones/`, lock files and `CLAUDE.md` symlinks are untouched or regenerated by their own manager.
- Onion (`pnpm arch`): service takes ports, no `Container`; the repository returns domain types; zod on every route; errors as `AppError`; rate limit 10/min install and 30/min refresh (OQ-1), and the 429 test needs a non-test app (`server/INSIGHTS.md:526-527`).
- Security: workflow permissions per AC-36/AC-37, every action pinned to a 40-character SHA (take values from `fix:server/src/modules/ci/constants.ts:93-97` only after checking them against each action's release; I did not), secrets by name only, zip reader bounded (256 KB per entry, named entry only; check `size_in_bytes` from the artifact listing before downloading), result never logged (NFR-9), PR title rendered as text. The secret-shape scan must not run over the runner bundle files, or must be proven not to match them (fact 16).
- AC-12 needs the other agent's manifest deleted even when `devdigest/ci` does not exist yet (fact 15): do not copy the `branchExists &&` guard.
- Preview and export: the client sends only the edited workflow; the server regenerates every other file (AC-16, AC-56). Preview responses carry `bytes` and `contents: null` for runner files (fact 17).
- `runner_version` is written by the runner and recorded by the server at export (AC-55); `dist/package.json` is only `{"type":"module"}` (fact 9), so the version needs a single constant in the shared contracts that both import [I].
- Installation row must also keep what AC-78/AC-79 need: exported manifest hash or text, triggers, post-as, `last_ingested_at`, GitHub repository id, method, PR url, and an "ended" marker for AC-11 [I]. `cost_usd` stays `double precision` like `agent_runs` (note `server/INSIGHTS.md:506-511` says to migrate to `numeric` only "if touched").
- Skipped review job (AC-120): how GitHub reports it (run `conclusion` or the jobs API) was not verified; test on the demo fork together with OQ-4.

**INSIGHTS entries that apply**

- `server/INSIGHTS.md:65-70` (new trace fields must be `nullish`), `:100-107` (repository on `tx`, row locks), `:146-151` (deps objects from container getters), `:415-417` (service with an in-flight map built once), `:506-511` (numeric vs double for cost), `:526-527` (rate limit inert under test), `:595-604` (mock secrets in `buildApp` overrides so tests do not reach the real key), `:616` (run one `.it.test.ts`; fresh worktree needs `pnpm install` and `npm ci` in `reviewer-core`), `:619-621` (two `db:generate` passes for table rewrites).
- `client/INSIGHTS.md:365-368` (`TABS` plus `VALID_TABS`), `:382-384` (nav label from a feature namespace), `:358-362` (Modal has no Escape or focus return; stop window shortcuts under `[role="dialog"]`), `:94-99` (explicit `aria-label` when a button holds a count and a label; same idea for "Job"/"Trace" links, NFR-7), `:163-167` (read `chrome.jsx` for the nav; design is the source of truth).
- Root `INSIGHTS.md:92-98` (contract sync and drift check), `:322-329` (`allowBuilds` in a new package's `pnpm-workspace.yaml`; CI pins pnpm 10).
- Training notes worth reading before touching the runner: `runner:agent-runner/insights/INSIGHTS.md` (path-alias and `reviewer-core/node_modules` gotcha, diff-parser trailing newline, `post_as` gap) and `fix:agent-runner/insights/INSIGHTS.md:24` (stale chunk).

**Project skills that apply**: `onion-architecture`, `security`, `zod`, `drizzle-orm-patterns`, `postgresql-table-design`, `fastify-best-practices`, `frontend-architecture`, `next-best-practices`, `react-best-practices`, `react-testing-library`, `typescript-expert`, `dependency-checker` (new package with ncc, yaml, zod, openai in the bundle), `engineering-insights` (new `agent-runner/INSIGHTS.md`). Pushing a `.github/workflows/*` file needs the `gh auth git-credential` push noted in the user's memory.

**Open questions for the user**

1. D1 (OQ-5): commit the built runner bundle with a CI drift check (recommended), or keep `agent-runner/dist/` ignored and build it in `dev.sh`, `e2e.sh` and CI? (options: 1. commit + drift check / 2. build step, ignored)
2. D2: write the `ci/` module fresh in the onion layout and lift the pure upstream files (recommended), or port the `fix` branch module and strip the multi-agent parts? (options: 1. fresh + lift / 2. port `fix` / 3. port `finish`)
3. Package manager of `agent-runner`: the spec's check list says `npm run typecheck` and `npm test` (`specs/15-export-to-ci.md:120`) while the training branch has `pnpm-lock.yaml` and `server`/`mcp` use pnpm. Which one? (options: 1. npm, package-lock.json / 2. pnpm, pnpm-lock.yaml)
4. Spec gap: GitHub keeps one run id when a failed workflow is re-run. AC-115 stores one CI run per run id, so a `no_result` Failed row would hide a later successful attempt. (options: 1. keep the first outcome, as the spec reads / 2. replace a stored `no_result` row when a later attempt completes, which needs a spec amendment)
5. Execution: parallel tracks after the contracts group (recommended, shorter elapsed time) or one implementer in series (less coordination, same scope)? (options: 1. parallel tracks / 2. series)

## User decisions (2026-10-17)

Recorded by the main session after the user's answers in chat:
- D1: D1-1 (commit the built `agent-runner/dist/` and add a CI drift check). D2: D2-3 (fresh onion module, lift pure upstream files with their tests). D3a: D3a-1. D3b: D3b-A. D4: D4-2 (the user accepted the three recommendations together).
- `agent-runner` package manager: **pnpm** (the training branch's `pnpm-lock.yaml`; server and mcp use pnpm). The spec's check list says `npm run typecheck` / `npm test` for agent-runner: the planner uses `pnpm typecheck` / `pnpm test` and the spec's wording is corrected by an amendment or noted as a plan deviation. The root `AGENTS.md` package table gets an `agent-runner/` row (pnpm).
- Re-run rule: keep the first stored outcome per GitHub run id, as the spec reads (AC-115). No spec amendment. Known limitation: a re-run after a stored `no_result` Failed row does not replace it.
- Execution mode (single vs multi-agent) is not decided here; the planner asks it.

## Sources

- Spec and repo: `specs/15-export-to-ci.md`, `AGENTS.md`, `server/AGENTS.md` and `server/CLAUDE.md`, `client/AGENTS.md`, `server/INSIGHTS.md`, `client/INSIGHTS.md`, `INSIGHTS.md`, `docs/0001-eval-runs-are-their-own-module.md`, `docs/agent-workflow-cost.md`, `.claude/skills/onion-architecture/SKILL.md`, `.claude/skills/security/SKILL.md`, `.claude/skills/frontend-architecture/SKILL.md`, `server/src/**` files cited above, `scripts/dev.sh`, `scripts/shared-contracts.sh`, `.github/workflows/*`, `client/docs/design/artboards.md`, `client/docs/design/src/chrome.jsx`.
- Git refs (read with `git show` / `git ls-tree`): `upstream/lesson-7-lab/agent-runner`, `upstream/devdigest/ci`, `upstream/lesson-7-lab/multiagents-finish` (incl. `docs/retros/2026-07-08-export-to-ci-run.md`), `upstream/fix/numbered-diff-line-citations`, `upstream/emdash/multi-agents-review-v1x` (merge base only).
- Web (fetched in this run): https://docs.github.com/en/rest/actions/workflow-runs · https://docs.github.com/en/rest/actions/artifacts · https://docs.github.com/en/rest/actions/secrets · https://docs.github.com/en/actions/reference/workflows-and-actions/variables · https://github.com/vercel/ncc

## Not found

- Whether ncc output is byte-reproducible across machines: the README is silent (fact 11) and builds were not run (read-only). It decides whether the D1-1 drift check works; make it the first planner spike.
- Fine-grained token permission names for Actions read and secrets list: the three GitHub pages name only the `repo` scope. The Settings text and AC-57's wording depend on it.
- How GitHub reports a workflow run whose only job was skipped (needed for AC-120): not fetched.
- What worktree A changes in `vendor/shared`, migrations and `reviewer-core`: its branch has a stale merge base, so the collision forecast for D4 is an inference.
- Whether `pnpm arch` actually flags `import type { Container }` in an application file: not run. The rule text suggests it does.
- Whether `octokit@4.1.4` exposes `rest.actions.listWorkflowRuns`, `listWorkflowRunArtifacts`, `downloadArtifact`: used by `finish`, but `node_modules` is not installed in this worktree.
- Commit SHAs of `actions/checkout`, `actions/setup-node`, `actions/upload-artifact`: the values in `fix:server/src/modules/ci/constants.ts:93-97` were not checked against the action repositories.
- History growth from committing the bundle in bytes (compressed size): not measured.
