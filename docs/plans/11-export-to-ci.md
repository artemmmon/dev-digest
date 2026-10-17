# Development Plan: Export to CI
Status: in progress
Spec: specs/15-export-to-ci.md
Brainstorm: docs/plans/11-export-to-ci.brainstorm.md
Execution mode: multi-agent (chosen by the user)

## Goal
Export one agent from its CI tab into a repository's GitHub Actions: a PR on `devdigest/ci`, or a zip. A bundled `agent-runner` reviews each same-repository PR. DevDigest pulls each run's `devdigest-result.json` back, verifies it, and lists it on a CI Runs page.
In scope: shared contracts, a new `agent-runner/` package (pnpm) with a committed bundle, the server `ci` module plus GitHub Actions adapter methods, the agent CI tab, the Export Wizard, the CI Runs page, and the GLOBAL nav entry.
Out of scope: everything under the spec's Non-goals; changes to `server/src/modules/reviews/**` and the PR feed (NFR-11); **new tests**. Tests are off for this feature: no step writes a test file, and the implementer repairs only the tests it breaks.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | 1–3 | spike (scratch), `server/src/vendor/shared`, `server/src/adapters/github` | — | Spike verdict REPRODUCIBLE / NOT (in `agent-runner` handoff); new contract names; new `GitHubClient` methods and `CommitFilesPayload.replaceDirs` |
| G2 | 4–5 | `agent-runner/`, repo-root registration, `.github/workflows` | G1 | `agent-runner/dist/` path and file list; env vars the runner reads |
| G3 | 6–9 | `server/src/modules/ci` pure files, `server/src/adapters`, config | G1 (parallel with G2, G4) | Exported pure functions and the names of the `ci/ports.ts` interfaces |
| G4 | 10–13 | `client/` | G1 (parallel with G2, G3) | Hook names; the routes the client calls (listed in Step 10) |
| G5 | 14–17 | server schema, repository, service, routes, container | G2, G3 | Route list for G6; `ci` registered |
| G6 | 18–21 | migration, nav, final rebuild, checks, manual fork check | G5, G4, **after worktree A is merged into `main` and this branch is rebased** | — |
| G7 | 22–25 | `client/` CiTab and Export Wizard, plus one line in `server/src/modules/ci/workflow.ts` | G4, G5 (both done). Runs **before** the remaining Steps 19 and 21, which stay last in execution order; one implementer | none for the code. Steps 19 and 21 need nothing from G7; the Step 20 re-run covers G7's files |

## Skills behind the steps
| Path glob (routing.json rule id) | Skills | Why they matter here |
|---|---|---|
| `server/src/{modules,platform,adapters}/**` (server-app) | onion-architecture, fastify-best-practices | ports, thin routes, zod on routes, rate limits |
| `server/src/modules/**/repository.ts`, `server/src/db/**` (server-data) | drizzle-orm-patterns | `ON CONFLICT DO NOTHING`, transaction on `tx` |
| `server/src/db/schema/**` (server-schema) | postgresql-table-design | partial unique index, FK indexes, timestamptz, bigint |
| `server/src/vendor/shared/**` (shared-contracts-server/-client) | zod, onion-architecture | one schema for the runner and the server |
| `client/src/**` (client-src, client-app-router), `client/messages/**` (client-i18n) | frontend-architecture, react-best-practices, next-best-practices | colocation, hooks, derive-don't-store, a11y |
| `**/*.{ts,tsx}`, `.github/workflows/**`, `scripts/**`, `package.json` (security-surface) | security | workflow permissions, secrets by name, bounded zip, result validation |
| `agent-runner/src/**` (new rule, Step 5) | typescript-expert, zod | runner CLI |

## Steps
### Step 1 — ncc reproducibility spike (scratch, no repo change)
- Files: create `agent-runner/INSIGHTS.md`
- Change: run `git worktree add <scratchpad>/spike upstream/lesson-7-lab/agent-runner`. There: `npm ci` in `reviewer-core`, then `pnpm install` and `pnpm build` in `agent-runner` twice. Record `shasum -a 256 dist/*` each time. Then build once on Linux: Docker `node:22`, from a clean copy of `agent-runner`, `reviewer-core` and `server/src/vendor/shared` with no host `node_modules`. Compare all three hash sets, then `git worktree remove` the spike. Write the verdict into the new `agent-runner/INSIGHTS.md` ("What Works" or "What Doesn't Work"; `Where:` = `agent-runner/package.json`). **REPRODUCIBLE** means every file's hash is equal in all three builds. Otherwise the verdict is **NOT** → D1-2 (Step 5 branch B).
- Covers: none
- Rules / skills: security
- Practices: build from the lockfile only; no repo file changes except the INSIGHTS entry (engineering-insights format).
- Tests (test-writer): none
- Existing tests to update: none
- Done when: `agent-runner/INSIGHTS.md` holds the verdict and the three hash lists; `git worktree list` shows no spike worktree.

### Step 2 — Shared CI contracts (server vendor/shared)
- Files: modify `server/src/vendor/shared/contracts/eval-ci.ts`, `server/src/vendor/shared/contracts/trace.ts`
- Change: rewrite the Export-to-CI block (`eval-ci.ts:247-356`). Add constants `MANIFEST_VERSION = 1` and `RUNNER_VERSION = '1.0.0'`.
  - `AgentManifest` gains `manifest_version: z.literal(MANIFEST_VERSION)` and `agent_version` (int ≥1).
  - `CiResultArtifact` is replaced by the 16 fields of spec :101. Counts are int ≥0. `verdict` reuses `Verdict` (`contracts/findings.ts:27`). `commit_sha` is `/^[0-9a-f]{40}$/`. `repository_id` and `run_id` are positive ints. Drop `version`.
  - New: `CiPostAs`, `CiTrigger` (`opened|synchronize|reopened`) and `CiFailureReason` (the 8 reasons of AC-106..AC-113).
  - `CiFile`: `contents` nullable, plus `bytes`, `sha256` and `editable`.
  - `CiPreviewInput`: `repo_id` uuid, `triggers` min 1, `post_as`.
  - `CiPreview`: `files`, `base_branch`, `replaces` (`{agent_id, agent_name}` or null), `secret_status` (`present|missing|unknown`).
  - `CiInstallInput`: preview input plus `workflow` (string, max 64 KB) and `confirm_replace`.
  - `CiInstallResult`: `{installation, pr_url}`.
  - `CiInstallation`: spec :102 fields plus `triggers` and `post_as`.
  - `CiRun`: spec :103 fields. `CiRunStatus` becomes `succeeded|no_findings|failed`.
  - `CiAgentOverview`: `{installations, runs}`.
  - `CiRunsQuery`: `period 7d|30d|all` defaulting to `7d`, optional `agent_id`, `repo` and `status`, `cursor`, `limit` defaulting to 50.
  - `CiRunPage`: `{runs, next_cursor}`.
  - `CiRefreshInput {force}` and `CiRefreshResult {refreshed, github_error}`.
  - Remove the unused `CiExportInput` and `CiExport`.
  - `RunTrace` (`trace.ts:86`) gains `ci: {manifest_version, agent_version, runner_version, commit_sha, repository, run_id}.nullish()`.
- Covers: NFR-12
- Rules / skills: shared-contracts-server; zod
- Practices: wire spelling is snake_case (root AGENTS.md "Naming"). Export the schema and its `z.infer` type together. A new trace field must be `.nullish()` (`server/INSIGHTS.md:65-70`). Comment-only drift also fails the check (root `INSIGHTS.md:94-98`).
- Tests (test-writer): none
- Existing tests to update: none found (only `reviewer-core/src/review/run.ts:27` mentions `AgentManifest`, and only in a comment)
- Done when: `pnpm typecheck` passes in `server/` and `client/` (after Step 3's sync) and in `mcp/`; `rg -n "CiExportInput|CiExport\b" server/src client/src --glob '!**/vendor/**'` prints nothing.

### Step 3 — GitHubClient: Actions, repository, secrets, path replacement (server adapters)
- Files: modify `server/src/vendor/shared/adapters.ts`, `server/src/adapters/github/octokit.ts`, `server/src/adapters/mocks.ts`
- Change:
  - **First**, run `pnpm install --frozen-lockfile` in `server/` and confirm that `octokit.rest.actions.listWorkflowRuns`, `listJobsForWorkflowRun`, `listWorkflowRunArtifacts`, `downloadArtifact` and `listRepoSecrets` and `octokit.rest.repos.get` exist in 4.1.4. For any that is missing, use `this.octokit.request('GET /repos/{owner}/{repo}/actions/…')` inside the adapter.
  - Add these port methods:
    - `getRepository(repo) → {id, full_name, default_branch}`.
    - `listWorkflowRuns(repo, workflowFile, {createdAfter: Date, perPage}) → WorkflowRunMeta[]`, with `status: 'completed'` and `created: '>=ISO'`. `WorkflowRunMeta` is `{id, head_sha, conclusion, html_url, run_started_at, updated_at, repository_id, pr_number|null, display_title}`.
    - `listRunJobs(repo, runId) → {name, conclusion}[]`.
    - `listRunArtifacts(repo, runId) → {id, name, size_in_bytes, expired}[]`.
    - `downloadArtifact(repo, artifactId) → Uint8Array`.
    - `listRepoSecretNames(repo) → string[] | null`, returning null on 403 or 404.
  - Add `CommitFilesPayload.replaceDirs?: string[]`: every blob of the parent tree under those prefixes that is not in `files` gets a `{path, mode:'100644', type:'blob', sha: null}` entry. This applies **also when the branch is new** (do not copy `fix`'s `branchExists &&` guard; brief :207). Read the parent tree with `git.getTree({recursive:'true'})`.
  - Map a 403, 404 or 422 whose message mentions `workflow` (a `.github/workflows` write refused) to `AppError('github_workflow_scope', …, 403)` in `toAppError`.
  - Implement the same methods in `MockGitHubClient`, with canned data and a recorded `lastCommit` for later checks. Then run `./scripts/shared-contracts.sh sync`.
- Covers: AC-32, AC-33, AC-57, AC-102, NFR-3
- Rules / skills: server-app, security-surface; onion-architecture; security
- Practices: every call goes through `call()` (`octokit.ts:63`), so SDK errors never leave the adapter (Principle 5). Return plain port types, never Octokit types. Request names only from the secrets endpoint and never log values (security rule 9). `perPage` is capped at 20 by the caller (NFR-10).
- Tests (test-writer): none
- Existing tests to update: any test fake that `implements GitHubClient` besides `adapters/mocks.ts` (find with `rg -n "implements GitHubClient" server`)
- Done when: `pnpm typecheck` and `pnpm arch` pass in `server/`; `./scripts/shared-contracts.sh check` passes; `pnpm typecheck` passes in `client/` and `mcp/`.

### Step 4 — agent-runner package: copy and adapt (agent-runner)
- Files: create `agent-runner/package.json`, `agent-runner/tsconfig.json`, `agent-runner/vitest.config.ts`, `agent-runner/.gitignore`, `agent-runner/pnpm-workspace.yaml`, `agent-runner/src/index.ts`, `agent-runner/src/run.ts`, `agent-runner/src/artifact.ts`, `agent-runner/src/context.ts`, `agent-runner/src/manifest.ts`, `agent-runner/src/skills.ts`, `agent-runner/src/diff.ts`, `agent-runner/src/github.ts`, `agent-runner/src/errors.ts`, `agent-runner/AGENTS.md`
- Change:
  - Copy these files from `upstream/lesson-7-lab/agent-runner:agent-runner/` with `git show`. Do **not** copy `*.test.ts` (tests are off), `pnpm-lock.yaml` (generate it with `pnpm install`), `insights/` or `CLAUDE.md`.
  - `package.json`: name `@devdigest/agent-runner`; `build` = `rm -rf dist && ncc build src/index.ts -o dist` (a stale chunk otherwise survives, brief fact 10); pin `@vercel/ncc` exactly.
  - `context.ts` reads `DEVDIGEST_HEAD_SHA`, `GITHUB_RUN_ID` and `GITHUB_REPOSITORY_ID`.
  - `artifact.ts` writes all 16 result fields. `runner_version` is `RUNNER_VERSION` from `@devdigest/shared`; delete the local constant. `verdict` is `request_changes` when the gate triggered, else `comment`. `model` comes from the manifest. `commit_sha` comes from `DEVDIGEST_HEAD_SHA`.
  - `run.ts`/`diff.ts` drop the files under `.devdigest/` and `.github/workflows/` from the diff before review.
  - Exit codes: 1 when `gateTriggered` (always 0 for `never`); 1 with no post and no result file when the manifest fails the schema or the review fails; 0 otherwise.
  - `none` posts nothing.
  - `pnpm-workspace.yaml` has `allowBuilds` like `mcp/pnpm-workspace.yaml:3`.
  - `AGENTS.md` (≤100 lines) holds the commands and the alias gotcha. Then `ln -s AGENTS.md agent-runner/CLAUDE.md`.
- Covers: AC-60, AC-61, AC-62, AC-63, AC-64, AC-65, AC-66, AC-67, AC-68, AC-69, AC-70, AC-71, AC-72, AC-118, EC-10, EC-35, NFR-1, NFR-12
- Rules / skills: agent-runner rule (Step 5); typescript-expert; zod; security
- Practices: validate the manifest and the result with the shared schemas, and never with local copies (NFR-12). The result holds counts and ids only: no PR title, body, diff, finding text or env value (AC-72). PR text reaches the prompt only through reviewer-core's `reviewPullRequest`, which wraps untrusted text (security rule 6). The runner reads env directly because it runs outside the server (`upstream index.ts:9-13` comment). Typecheck needs `reviewer-core/node_modules` (`npm ci` there; upstream INSIGHTS "What Doesn't Work").
- Tests (test-writer): `agent-runner/src/artifact.test.ts` — AC-71, AC-72, AC-118; `agent-runner/src/run.test.ts` — AC-61, AC-62, AC-63, AC-64, AC-65, AC-66, AC-67, AC-68, AC-69, AC-70 (recorded only, tests off)
- Existing tests to update: none
- Done when: in `agent-runner/`, `pnpm typecheck` and `pnpm test` (passWithNoTests) pass; `pnpm build` writes `dist/index.js`; `grep -c "^import\|require(" dist/index.js` prints `0`.

### Step 5 — Register the package and distribute the bundle (repo root, CI)
- Files: create `.github/workflows/agent-runner.yml` · modify `AGENTS.md`, `.claude/skills/pr-self-review/assets/routing.json`, `.gitignore`, `scripts/dev.sh`, `scripts/e2e.sh`, `.github/workflows/server-integration.yml`
- Change:
  - Root `AGENTS.md`: add an `agent-runner/` row (pnpm) and add `agent-runner/pnpm-lock.yaml` to "Do not touch".
  - `routing.json`:
    - add `packages.agent-runner` with checks `pnpm typecheck` and `pnpm test`;
    - add the lock file to `generated.lockfiles`;
    - add rule `agent-runner-src` (`agent-runner/src/**/*.ts`, ignore tests, skills typescript-expert and zod);
    - add `agent-runner` to the `security-surface` globs;
    - add `agent-runner/dist/**` to `generated` with the note "built by `pnpm build`".
  - `agent-runner.yml`, modelled on `.github/workflows/mcp.yml`, with `permissions: contents: read` and no `secrets.*`. Paths: `agent-runner/**`, `reviewer-core/**`, `server/src/vendor/shared/**` and the workflow file. Steps: `npm ci` in `reviewer-core`, then `pnpm install --frozen-lockfile`, `typecheck` and `test` in `agent-runner`.
  - **Branch A (Step 1 REPRODUCIBLE, D1-1):** keep the `.gitignore` un-ignore (`.gitignore:3-5`) and commit `agent-runner/dist/`. Rewrite the misleading comment there to "exported into target repos by the server". `agent-runner.yml` adds `pnpm build` and then `git diff --exit-code -- dist` plus an empty `git status --porcelain -- dist` (the drift check). `dev.sh`, `e2e.sh` and `server-integration.yml` stay unchanged.
  - **Branch B (NOT, D1-2):** remove the two un-ignore lines and do not commit `dist/`. `dev.sh` and `e2e.sh` build `agent-runner` when `agent-runner/dist/index.js` is missing, after the `reviewer-core` install (`scripts/dev.sh:79`). `server-integration.yml` builds it before the tests. `agent-runner.yml` runs `pnpm build` with no diff check.
- Covers: NFR-12
- Rules / skills: security-surface; security
- Practices: CI stays read-only (security rule 12). A new package keeps install scripts blocked (rule 13). `AGENTS.md` stays ≤100 lines. A harness file changed, so G6 runs `pnpm eval:static` and `pnpm eval:workflow` (root AGENTS.md "Evals").
- Tests (test-writer): none
- Existing tests to update: none
- Done when: `node -e "JSON.parse(require('fs').readFileSync('.claude/skills/pr-self-review/assets/routing.json','utf8'))"` exits 0; `./scripts/check-changed.sh --quick` lists `agent-runner` among the checked packages; branch A: `git ls-files agent-runner/dist` lists the bundle; branch B: `git check-ignore agent-runner/dist/index.js` prints the path.

### Step 6 — Runner bundle source, zip writer, yaml dependency (server adapters, config)
- Files: create `server/src/adapters/runner-bundle/fs-runner-bundle.ts`, `server/src/modules/ci/ports.ts` · modify `server/src/platform/config.ts`, `server/src/adapters/archive/zip.ts`, `server/package.json`, `.claude/skills/onion-architecture/assets/dependency-cruiser.cjs`
- Change:
  - `AppConfig.ciRunnerBundleDir`: env `DEVDIGEST_CI_RUNNER_DIR`, default `../agent-runner/dist`, resolved like `cloneDir` (`config.ts:81-83`).
  - `FsRunnerBundle.read()` returns `{name, bytes: Uint8Array}[]` for the regular files directly in that directory. It skips symlinks and subdirectories, caps the total at 5 MB, and throws `ValidationError` naming `cd agent-runner && pnpm build` when `index.js` is missing.
  - Add `FflateZipWriter.zip(files: {path, bytes}[]) → Uint8Array` (fflate `zipSync`) beside the reader in `zip.ts`.
  - `ci/ports.ts` declares the structural ports:
    - `RunnerBundleSource`;
    - `ZipWriter`;
    - `ResultArchiveReader` (same shape as `FflateZipReader.list`/`readText`);
    - `CiAgentSource` (`getById` and `resolvedSkills`, satisfied by `AgentsRepository`, see `server/src/modules/eval/ports.ts:153-162`);
    - `CiRepoSource` (`getById`, satisfied by `RepoRepository`, `server/src/modules/repos/repository.ts:58`);
    - `CiStore` (Step 15);
    - `CiDeps`.
  - `pnpm add yaml@2.9.0` in `server/` (already in the lockfile), and add `'yaml'` to `APPLICATION_PKGS` (`dependency-cruiser.cjs:45`).
- Covers: AC-13, AC-54
- Rules / skills: server-app; onion-architecture; security
- Practices: adapters never import `modules/**` (depcruise `adapters-not-to-modules`), so the ports are structural, as with `skills/ports.ts:89` and `adapters/archive/zip.ts`. The path is server config, not input. Do not follow symlinks (security rule 2).
- Tests (test-writer): none
- Existing tests to update: none
- Done when: `pnpm typecheck` and `pnpm arch` pass in `server/`.

### Step 7 — Pure generators: slugs, manifest, memory, secret scan (server ci)
- Files: create `server/src/modules/ci/constants.ts`, `server/src/modules/ci/slug.ts`, `server/src/modules/ci/manifest.ts`, `server/src/modules/ci/memory-export.ts`, `server/src/modules/ci/redact.ts`
- Change:
  - `constants.ts`: `CI_BRANCH='devdigest/ci'`, `WORKFLOW_PATH='.github/workflows/devdigest-review.yml'`, `WORKFLOW_FILE='devdigest-review.yml'`, `RESULT_ARTIFACT='devdigest-result'`, `RESULT_FILE='devdigest-result.json'`, `RESULT_MAX_BYTES=262144`, `PR_TITLE='Add DevDigest CI review'`, `REPLACE_DIRS=['.devdigest/agents/','.devdigest/skills/','.devdigest/runner/']`, `REFRESH_SKIP_MS=30000`, `RUNS_PER_REFRESH=20`, plus `PINNED_ACTIONS` (Step 8).
  - `slug.ts`: lowercase ASCII, digits, single hyphens, ≤40 characters; fallback `agent` or `skill`; `-2`, `-3`… in binding order.
  - `manifest.ts`: build the manifest object, `AgentManifest.safeParse` it (failure → `ValidationError` with the field errors), and serialize with `yaml` `stringify`. Also export `manifestSha256` (`node:crypto`).
  - `memory-export.ts`: one line `{"kind","content"}` per entry, `''` when there are none.
  - `redact.ts`: `findSecretShapes(text) → string[]` (pattern ids only, never the match), using the secret table of the `security` skill (sk-/sk-or-/sk-ant-, `gh[pousr]_`, `github_pat_`, AKIA, private key, quoted generic assignment, Postgres URL with password).
  - You may lift the logic from `upstream/fix/numbered-diff-line-citations:server/src/modules/ci/{manifest,memory-export,redact}.ts`, without their tests.
- Covers: AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-56, EC-20, EC-21, EC-22, EC-25, EC-26, NFR-2
- Rules / skills: server-app; onion-architecture; zod; security
- Practices: application code imports only `zod`, `yaml` and `node:crypto` (allowlist `dependency-cruiser.cjs:45-46`). The system prompt and skill bodies become YAML values through `stringify` and are never string-interpolated (spec :349). The scanner returns ids, so no secret value reaches an error or a log (NFR-2).
- Tests (test-writer): `server/src/modules/ci/slug.test.ts` — AC-21, AC-22, AC-23; `manifest.test.ts` — AC-19, AC-20; `memory-export.test.ts` — AC-24, AC-25; `redact.test.ts` — AC-56 (recorded only)
- Existing tests to update: none
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm arch` pass in `server/`.

### Step 8 — Workflow generator and bundle assembly (server ci)
- Files: create `server/src/modules/ci/workflow.ts`, `server/src/modules/ci/bundle.ts` · modify `server/src/modules/ci/constants.ts`
- Change:
  - `generateWorkflow({triggers, postAs})` returns a YAML string with `on: pull_request: types: [<selected>]` and nothing else in `on`.
  - Top-level `permissions` is `contents: read` plus `pull-requests: write` (review or comment) or `pull-requests: read` (`none`).
  - Job `gate`:
    - `if: github.event.pull_request.head.repo.full_name == github.repository`;
    - checks out `ref: ${{ github.event.pull_request.base.sha }}` with `persist-credentials: false`;
    - outputs `present` from `test -f .devdigest/runner/index.js`.
  - Job `review`:
    - `needs: gate`, `if: needs.gate.outputs.present == 'true'`;
    - checks out the same base sha;
    - runs `actions/setup-node` with node 22;
    - runs `node .devdigest/runner/index.js` with env `OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}`, `GITHUB_TOKEN: ${{ github.token }}`, `PR_NUMBER`, `DEVDIGEST_HEAD_SHA: ${{ github.event.pull_request.head.sha }}` and `DEVDIGEST_POST_AS: <value>`;
    - then runs `actions/upload-artifact` with `if: always()`, name `devdigest-result`, path `devdigest-result.json` and `if-no-files-found: ignore`.
  - `PINNED_ACTIONS`: resolve the latest v4 tag of `actions/checkout`, `actions/setup-node` and `actions/upload-artifact` with `gh api repos/actions/<name>/git/ref/tags/<tag>`. When `object.type` is `tag`, follow `gh api repos/actions/<name>/git/tags/<sha>` to the commit. Emit `uses: actions/<name>@<40-hex> # <tag>`.
  - `bundle.ts`, `assembleFiles({manifest, skills, memory, runnerFiles, workflow})`, returns `CiFile[]`:
    - files in the AC-13 order, with `bytes` and `sha256`;
    - runner files under `.devdigest/runner/<name>`;
    - only the workflow `editable`.
  - `bundle.ts`, `toPreviewFiles`: nulls `contents` for runner files.
- Covers: AC-13, AC-15, AC-34, AC-35, AC-36, AC-37, AC-38, AC-39, AC-40, AC-41, AC-42, AC-43, AC-44, AC-45, AC-117, AC-119, EC-8, EC-9, EC-36, EC-38
- Rules / skills: security-surface; security
- Practices: no `pull_request_target`, no `devdigest/review-action`, no `${{ }}` built from user text (only fixed expressions plus enum values; security rule 12). The runner, manifest and skills come from the base commit (spec :345). Neither upstream generator meets AC-39, AC-40 or AC-118 (brief fact 12), so write this one fresh.
- Tests (test-writer): `server/src/modules/ci/workflow.test.ts` — AC-34, AC-35, AC-36, AC-37, AC-38, AC-39, AC-40, AC-41, AC-42, AC-43, AC-44, AC-45, AC-117, AC-119 (recorded only)
- Existing tests to update: none
- Done when: `pnpm typecheck` and `pnpm arch` pass in `server/`; `rg -n "@v[0-9]" server/src/modules/ci/constants.ts` prints only `# v…` comments.

### Step 9 — Ingest checks (server ci)
- Files: create `server/src/modules/ci/ingest-check.ts`
- Change: `checkResult({artifacts, archiveBytes?, run, installation, reader})` returns either `{ok: true, result}` or `{ok: false, reason}`. The order:
  1. no `devdigest-result` artifact → `no_result`;
  2. `expired` → `result_expired`;
  3. `size_in_bytes` > 256 KB → `result_too_large`, before any download;
  4. the archive must hold exactly the entry `devdigest-result.json`, with a declared size ≤256 KB and no `/`, `\` or `..` in its name; anything else → `invalid_result` (a size breach → `result_too_large`);
  5. `readText` with `RESULT_MAX_BYTES`;
  6. `findSecretShapes` → `secret_in_result`;
  7. `JSON.parse`, then `CiResultArtifact.safeParse` → `invalid_result`;
  8. `commit_sha` ≠ `run.head_sha` → `commit_mismatch`;
  9. `repository_id` ≠ the installation's → `repository_mismatch`;
  10. `run_id` ≠ `run.id` → `run_mismatch`.
  Also export `statusFor(result)`: `succeeded` when `findings_count`>0, else `no_findings`; every rejection maps to `failed`.
- Covers: AC-87, AC-106, AC-107, AC-108, AC-109, AC-110, AC-111, AC-112, AC-113, EC-11, EC-12, EC-13, EC-15, EC-24, NFR-6
- Rules / skills: server-app; zod; security
- Practices: never trust `JSON.parse` output (zod `parse-never-trust-json`). Check declared sizes before inflating, and the real size after (`server/INSIGHTS.md:486-490`). Reasons are fixed enum values; result contents never go into a reason.
- Tests (test-writer): `server/src/modules/ci/ingest-check.test.ts` — AC-87, AC-106, AC-107, AC-108, AC-109, AC-110, AC-111, AC-112, AC-113, NFR-6 (recorded only)
- Existing tests to update: none
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm arch` pass in `server/`.

### Step 10 — Client data layer (client)
- Files: create `client/src/lib/hooks/ci.ts` · modify `client/src/lib/query-keys.ts`, `client/src/lib/hooks/index.ts`, `client/src/lib/api.ts`, `client/package.json`
- Change:
  - Add `keys.ci.{scope(), overview(agentId), runs(filters)}`.
  - Hooks:
    - `useCiOverview(agentId)` → `GET /agents/:id/ci`;
    - `useCiRuns(filters)` → infinite `GET /ci/runs`, 50 per page;
    - `useCiPreview` → `POST /agents/:id/ci/preview`;
    - `useCiInstall` → `POST /agents/:id/ci/install`;
    - `useCiZip` → `POST /agents/:id/ci/zip`, a blob saved as `devdigest-ci.zip`;
    - `useCiRefresh` → `POST /ci/refresh` `{force}`, invalidating `keys.ci.scope()`;
    - `useCiAutoRefresh()` → calls refresh `{force:false}` every 60 s while mounted and keeps the last `github_error`.
  - Add a blob variant to `api.ts` if `apiFetch` (`api.ts:22`) cannot return bytes.
  - `pnpm add yaml` in `client/`.
- Covers: AC-99, AC-116, EC-34
- Rules / skills: client-src; frontend-architecture; react-best-practices
- Practices: every query key comes from `query-keys.ts` and is never a literal; components never call `fetch` (client AGENTS.md). Server state stays in the query cache. Clear the interval on unmount (react "useEffect Rules"). Parse responses with the shared contracts.
- Tests (test-writer): `client/src/lib/hooks/ci.test.tsx` — AC-99, AC-116 (recorded only)
- Existing tests to update: none
- Done when: `pnpm typecheck` and `pnpm lint` pass in `client/`.

### Step 11 — Agent CI tab (client)
- Files: create `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/CiTab.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/index.ts`, `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/styles.ts`, `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/FailOnControl/FailOnControl.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/FailOnControl/index.ts`, `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/InstallationsTable/InstallationsTable.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/InstallationsTable/index.ts`, `client/src/components/ci-run-table/CiRunTable.tsx`, `client/src/components/ci-run-table/index.ts` · modify `client/src/app/agents/[id]/page.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`, `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`, `client/messages/en/ci.json`
- Change:
  - Add the `ci` tab after `evals` in `TABS` and in `VALID_TABS` (`page.tsx:17`). `EditorTab.ns` gains `"ci"`, and `AgentEditor.tsx:22` translates from `ci`.
  - Empty state "Not in CI yet" with "Add to CI". The button is disabled with "CI runs support OpenRouter agents only" when `provider !== 'openrouter'`.
  - `FailOnControl`: a radio group with Critical / Warning + / Never, plus "Any" only while the stored value is `any`. It saves through the existing agent update hook (`useUpdateAgent`, `client/src/lib/hooks/agents.ts`) as `ci_fail_on`.
  - `InstallationsTable`: repository, target, method, version, last status and time; "Waiting for first run" plus a PR link; an "Outdated" badge; "Update CI config" opens the wizard preselected with the row's repo, triggers and post_as.
  - `CiRunTable` is shared with Step 13 (second consumer): the 20 newest runs plus an "All CI runs" link to `/ci-runs?agent=<id>`.
  - Mount `useCiAutoRefresh`.
- Covers: AC-1, AC-2, AC-4, AC-73, AC-74, AC-75, AC-76, AC-77, AC-78, AC-79, AC-80, EC-18, EC-19, EC-28, NFR-7, NFR-8
- Rules / skills: client-src, client-app-router, client-i18n; frontend-architecture; react-best-practices
- Practices:
  - A new tab needs both `TABS` and `VALID_TABS` (`client/INSIGHTS.md:368-372`).
  - Design source: `client/docs/design/src/screen_agents.jsx`, tab `CI`.
  - Reuse `client/src/components/severity-counts`, `run-cost-badge` and the kit `Badge`.
  - Every string goes under `ci` (NFR-8). Link names include the PR number (NFR-7; `client/INSIGHTS.md:94-99`).
  - Rows use a real `<Link>`/`<button>` (client AGENTS.md).
- Tests (test-writer): `CiTab/CiTab.test.tsx` — AC-1, AC-2, AC-4, AC-73, AC-74, AC-75, AC-76, AC-77, AC-78, AC-80 (recorded only)
- Existing tests to update: `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx` if it counts tabs
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `client/`.

### Step 12 — Export Wizard (client)
- Files: create `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard/ExportWizard.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard/index.ts`, `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard/helpers.ts`, `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard/useExportWizard.ts`, `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard/_components/TargetStep.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard/_components/PreviewStep.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard/_components/ConfigureStep.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard/_components/InstallStep.tsx` · modify `client/messages/en/ci.json`
- Change:
  - Four steps, using the kit `Modal` and `ExportWizardSteps` (`client/src/vendor/ui/ExportWizardSteps.tsx`). All wizard state lives in `useExportWizard` and is dropped on close.
  - **Target:** GitHub Actions only, preselected; a repo select from `useRepos`; "Import a repository first" and Continue disabled when there is no repo; a `confirm-dialog` naming the agent when `preview.replaces` is set.
  - **Preview:** a file list; contents for the selected file; runner files show their size; only the workflow is editable (a textarea); "Reset to generated"; YAML errors (`yaml` `parseDocument(...).errors`) disable Install with "The workflow is not valid YAML".
  - **Configure:** three trigger checkboxes (opened and synchronize on by default; none selected → Continue disabled); "Post results as" (3 options); the AC-31 note; the secret status (AC-32 / AC-33 text). A change re-calls preview; with workflow edits, it first asks to confirm.
  - **Install:** "Open a PR with these files" (default; disabled with "Add a GitHub token in Settings → API Keys" when `useSecretsStatus().github` is false, `client/src/lib/hooks/core.ts:58`) or "Download as zip"; "Installing…" while pending; success with a PR link; error code `github_workflow_scope` → the AC-57 text; any other error → the mapped message, staying on the step.
  - Replace the `blockMergeDesc` text ("Requires a GitHub App …", `ci.json`) with the AC-31 note.
- Covers: AC-3, AC-5, AC-6, AC-7, AC-8, AC-10, AC-14, AC-15, AC-16, AC-17, AC-18, AC-26, AC-27, AC-28, AC-29, AC-30, AC-31, AC-32, AC-33, AC-46, AC-47, AC-48, AC-53, AC-54, AC-57, AC-58, EC-1, EC-5, EC-6, EC-7, EC-27, EC-29, EC-30, EC-31, NFR-7, NFR-8
- Rules / skills: client-src; frontend-architecture; react-best-practices; security
- Practices:
  - The kit `Modal` has no Escape handling or focus return: add an Escape close, a focus trap, focus return, and `aria-current="step"` plus a live step name (`client/INSIGHTS.md:358-362`; NFR-7).
  - Derive "edited" by comparing with the generated text, and do not store it twice.
  - The client sends only the edited workflow; the server regenerates the rest (brief :208).
  - Show no raw GitHub body.
  - Design: `client/docs/design/src/screen_export.jsx`.
- Tests (test-writer): `ExportWizard/ExportWizard.test.tsx` — AC-3, AC-5, AC-8, AC-16, AC-17, AC-18, AC-27, AC-30, AC-47, AC-48, AC-57, AC-58 (recorded only)
- Existing tests to update: none
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `client/`.

### Step 13 — CI Runs page (client)
- Files: create `client/src/app/ci-runs/page.tsx`, `client/src/app/ci-runs/_components/CiRunsFilters/CiRunsFilters.tsx`, `client/src/app/ci-runs/_components/CiRunsFilters/index.ts`, `client/src/app/ci-runs/_components/TraceDetails/TraceDetails.tsx`, `client/src/app/ci-runs/_components/TraceDetails/index.ts` · modify `client/src/components/ci-run-table/CiRunTable.tsx`, `client/messages/en/ci.json`
- Change:
  - A thin page with `usePageCrumb`. Filters (period 7d default / 30d / all, agent, repo, status) live in URL params (`useSearchParamState`).
  - Header with Refresh (`force:true`) and `useCiAutoRefresh`. The notice "Could not refresh from GitHub — showing stored runs" shows on `github_error`.
  - `CiRunTable` columns: per AC-84, with `—` for missing cost, duration or findings. The PR cell links to `/repos/<repoId>/pulls/<n>` when `pr_id` is set, else to `https://github.com/<repo>/pull/<n>`. The agent cell shows `agent_name`. A Failed badge exposes `failure_reason` as a tooltip on hover and on focus (a focusable element with `aria-describedby`). "Job" opens `job_url` with `target="_blank" rel="noopener noreferrer"`. "Trace" toggles `TraceDetails`.
  - States: loading; error with Retry; "No CI runs yet" plus "Set up CI for an agent" → `/agents`; "No runs match these filters"; "Load more".
- Covers: AC-83, AC-84, AC-85, AC-86, AC-88, AC-89, AC-90, AC-91, AC-92, AC-93, AC-94, AC-95, AC-96, AC-97, AC-98, AC-116, EC-16, EC-17, NFR-7, NFR-8
- Rules / skills: client-src, client-app-router; next-best-practices; react-best-practices; security
- Practices: `useSearchParams` needs a Suspense boundary (next "Suspense Boundaries"). The PR title and agent name are text only, truncated with CSS ellipsis (spec :348). Use no `dangerouslySetInnerHTML`. Design: `client/docs/design/src/screen_cizruns.jsx` (`ci-runs`, `e-ci`).
- Tests (test-writer): `client/src/app/ci-runs/page.test.tsx` — AC-83, AC-85, AC-86, AC-90, AC-91, AC-92, AC-93, AC-95, AC-96, AC-97, AC-98, AC-116 (recorded only)
- Existing tests to update: none
- Done when: `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` pass in `client/` (dev server stopped; client AGENTS.md gotcha).

### Step 14 — Schema: ci_installations and ci_runs (server db)
- Files: modify `server/src/db/schema/ci.ts`
- Change:
  - `ci_installations` gains:
    - `workspace_id` (uuid not null, FK cascade);
    - `repo_id` (FK repos, set null);
    - `repository_id` (bigint `mode:'number'`, **nullable**);
    - `method` (text, check `pr|manual`);
    - `agent_version` (int);
    - `runner_version` and `manifest_sha256` (text);
    - `triggers` (text[]) and `post_as` (text);
    - `pr_url`;
    - `ended_at` and `last_ingested_at` (timestamptz);
    - a partial unique index on `(workspace_id, repo) WHERE ended_at IS NULL`;
    - an index on `agent_id`.
  - `ci_runs` gains:
    - `workspace_id` (not null FK cascade);
    - `agent_id` (FK set null) and `agent_name`;
    - `github_run_id` (bigint not null);
    - `commit_sha` and `pr_title`;
    - `duration_ms`;
    - `critical`, `warning` and `suggestion`;
    - `verdict` and `failure_reason`;
    - `manifest_version` and `agent_version`;
    - `runner_version` and `model`;
    - `agent_run_id` (FK `agent_runs`, set null);
    - a unique index on `(workspace_id, github_run_id)`;
    - an index on `(workspace_id, ran_at desc)`;
    - a status check `succeeded|no_findings|failed`.
  - Keep the existing columns (`github_url` holds the job link). **Do not run `pnpm db:generate` here** (Step 18).
- Covers: AC-55, AC-115
- Rules / skills: server-schema, server-data; postgresql-table-design; drizzle-orm-patterns
- Practices: index the FK columns. Use timestamptz. `cost_usd` stays `doublePrecision` like `agent_runs` (`server/INSIGHTS.md:506-511`). Use a partial unique index for "one active installation" (`server/INSIGHTS.md:619-622`). The existing tables have no writer, so NOT NULL additions apply to empty tables (see Risks).
- Tests (test-writer): none
- Existing tests to update: none
- Done when: `pnpm typecheck` passes in `server/`.

### Step 15 — CI repository (server ci)
- Files: create `server/src/modules/ci/repository.ts` · modify `server/src/modules/ci/ports.ts`
- Change: `CiRepository implements CiStore`, on `DbOrTx` (`server/src/db/client.ts:15`). Methods:
  - `activeInstallationForRepo` and `listInstallations(workspaceId, agentId)`, with the last run status and time;
  - `listActiveInstallations(workspaceId)`;
  - `replaceInstallation(new, endIds)`: one transaction that sets `ended_at` and inserts;
  - `claimIngest(id, force)`: `UPDATE … SET last_ingested_at=now() WHERE id=$1 AND (force OR last_ingested_at IS NULL OR last_ingested_at < now()-interval '30 seconds') RETURNING`;
  - `setRepositoryId`;
  - `knownRunIds(workspaceId, ids)`;
  - `storeRun(run, agentRun|null, trace|null)`: one transaction that inserts `ci_runs` with `ON CONFLICT DO NOTHING RETURNING`, and inserts the `agent_runs` row (`source:'ci'`, `status:'done'`, model, cost, duration, `findings_count`) and its `run_traces` row only when a row was returned; then it sets `agent_run_id`;
  - `listRuns(workspaceId, query)`, a keyset cursor on `(ran_at, id)` that joins `pull_requests` for `pr_id`;
  - `memoryFor(workspaceId, repoId)`, where `scope='repo' AND repo_id=$repo` or `scope='global'`, ordered by `created_at`.
  Return contract types; rows never leave the file.
- Covers: AC-101, AC-103, AC-104, AC-105, AC-114, AC-115, EC-14, NFR-4
- Rules / skills: server-data; drizzle-orm-patterns; onion-architecture; security
- Practices: build the repository on `tx` (`server/INSIGHTS.md:102-107`, `skills/repository.ts:42`). Every method filters by `workspace_id` (security rule 5). Use the `sql` template only, never `sql.raw` (rule 4). This repository writes `agent_runs` and `run_traces` itself; `reviews` stays untouched (NFR-11, brief "Rejected upfront"). The trace fills the required `RunTrace` fields with empty values and sets `config.source:'ci'` and the `ci` block.
- Tests (test-writer): `server/test/ci-repository.it.test.ts` — AC-101, AC-104, AC-114, AC-115 (recorded only)
- Existing tests to update: none
- Done when: `pnpm typecheck` and `pnpm arch` pass in `server/`.

### Step 16 — CI service (server ci)
- Files: create `server/src/modules/ci/service.ts`
- Change: `CiService(deps: CiDeps)` with `{store, agents, repos, github: () => Promise<GitHubClient>, bundle, zip, archive, now, log}`.
  - `preview(ws, agentId, input)`:
    - agent and repo scoped to the workspace;
    - `provider !== 'openrouter'` → 422;
    - assemble via Steps 7–8;
    - `replaces` = another agent's active installation;
    - `secret_status` from `listRepoSecretNames` (`unknown` when there is no token or null);
    - return `toPreviewFiles`.
  - `install(ws, agentId, input, 'pr'|'manual')`:
    - regenerate everything except the workflow;
    - scan every file, bundle included (refuse with the file name, AC-56);
    - require `confirm_replace` when `replaces` → 409 `ci_replace_unconfirmed`;
    - `pr`: `getRepository` (the default branch is the base and the id is recorded), then `commitFiles({branch: CI_BRANCH, base, replaceDirs: REPLACE_DIRS})`, then `findOpenPr`, else `openPullRequest(PR_TITLE)`; `installed_at = now()` after that;
    - `manual`: try `getRepository` only when a token exists (else `repository_id` null), and return the zip bytes;
    - then `replaceInstallation` ends every active installation in that repo. Nothing is recorded on any failure.
  - `overview(ws, agentId)`: installations with `outdated` (current `manifestSha256` ≠ stored) and the 20 newest runs.
  - `listRuns`.
  - `refresh(ws, force)`, for each active installation:
    - `claimIngest`, or skip;
    - fill a null `repository_id` via `getRepository`;
    - `listWorkflowRuns(WORKFLOW_FILE, createdAfter: installed_at, perPage: 20)`;
    - for runs not yet known: `listRunJobs`, and if the `review` job is absent or `skipped`, store nothing; otherwise artifacts, `downloadArtifact` only when the size check passes, then `checkResult`, then `storeRun`;
    - log every rejection with `{reason, installation_id, run_id}` only;
    - a GitHub `AppError` sets `github_error` and moves to the next installation.
- Covers: AC-9, AC-10, AC-11, AC-12, AC-49, AC-50, AC-51, AC-52, AC-55, AC-56, AC-59, AC-100, AC-102, AC-120, AC-121, EC-1, EC-2, EC-3, EC-4, EC-23, EC-32, EC-33, EC-37, NFR-1, NFR-2, NFR-9, NFR-10
- Rules / skills: server-app; onion-architecture; security; `load: .claude/skills/onion-architecture/references/patterns.md`
- Practices: the constructor takes ports, never `Container` (depcruise `application-no-container`). There are no LLM calls (NFR-1). Errors are `AppError` with fixed messages (security rule 10). The GitHub token comes only via `github()`, which reads `SecretsProvider` (`container.ts:440-447`). A double refresh is safe through the claim and the unique index (D3b-A).
- Tests (test-writer): `server/src/modules/ci/service.test.ts` — AC-10, AC-11, AC-12, AC-51, AC-52, AC-56, AC-59, AC-101, AC-102, AC-120, AC-121, NFR-9 (recorded only)
- Existing tests to update: none
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm arch` pass in `server/`.

### Step 17 — Routes, container, registry (server ci)
- Files: create `server/src/modules/ci/routes.ts` · modify `server/src/platform/container.ts`, `server/src/modules/index.ts`
- Change:
  - `container.ciRepo`, `container.runnerBundle`, `container.zipWriter` and `get ciDeps()` (pattern of `evalDeps`, `container.ts:217`). `log` is added in the route.
  - `routes.ts` builds one `CiService`:
    - `GET /agents/:id/ci` → `CiAgentOverview`;
    - `POST /agents/:id/ci/preview` → `CiPreview`;
    - `POST /agents/:id/ci/install` (`rateLimit {max:10, timeWindow:'1 minute'}`) → `CiInstallResult`;
    - `POST /agents/:id/ci/zip` (same limit) → `application/zip` with `content-disposition: attachment; filename="devdigest-ci.zip"`;
    - `GET /ci/runs` → `CiRunPage`;
    - `POST /ci/refresh` (`max:30`) → `CiRefreshResult`.
  - Register `ci` in `modules/index.ts`.
  - Then prove the scan over the committed bundle: `pnpm exec tsx -e` imports `findSecretShapes` and prints the hits for each file in `../agent-runner/dist`. If anything matches, tighten only the generic pattern in `redact.ts` and re-run.
- Covers: AC-20, NFR-3, NFR-4, NFR-5, AC-56, NFR-2
- Rules / skills: server-app; fastify-best-practices; onion-architecture; security
- Practices: each handler does schema → `getContext` → one service call (`eval/routes.ts:43-44`). Use zod `params`, `body`, `querystring` and response, and never `parse` in a handler (server AGENTS.md). No route accepts a CI result (NFR-3). The rate limit is inert under test (`server/INSIGHTS.md:526-527`).
- Tests (test-writer): `server/test/ci.it.test.ts` — AC-20, AC-49, AC-103, AC-106, NFR-3, NFR-4, NFR-5 (recorded only)
- Existing tests to update: any `buildApp` test asserting the route count or the module list
- Done when: `./scripts/check-changed.sh --quick` is green for server; the bundle scan prints no hit.

### Step 18 — Rebase on worktree A, generate the migration (server db)
- Files: modify `server/src/db/schema/ci.ts`
- Change: once worktree A is in `main`, rebase this branch and resolve conflicts (A owns `reviews`, the nav and any of its own migrations). Then run `pnpm db:generate` in `server/`. If drizzle-kit asks about a rename, answer "create column" (all columns are new). Run `pnpm db:migrate` on the dev DB.
- Covers: AC-115
- Rules / skills: server-schema; drizzle-orm-patterns
- Practices: never hand-edit `server/src/db/migrations/` (root AGENTS.md "Do not touch"). If one pass prompts, use two passes (`server/INSIGHTS.md:619-622`).
- Tests (test-writer): none
- Existing tests to update: none
- Done when: a new `server/src/db/migrations/00NN_*.sql` follows A's last migration; `pnpm db:migrate` succeeds; `pnpm test:integration` passes.

### Step 19 — GLOBAL nav: CI Runs (client)
- Files: modify `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/constants.ts`, `client/src/components/app-shell/hooks/useNavLabel.ts`, `client/messages/en/ci.json`
- Change: add `{key:'ci-runs', icon:…, href:'/ci-runs'}` with no literal label to the GLOBAL group. Create the group if A did not, and put the item after "Multi-Agent Review" if A added it. `NAV_LABEL_KEYS` maps `ci-runs` to `ci` `nav.label`; `useNavLabel` resolves each key from its own namespace, not only `eval` (`useNavLabel.ts:13`).
- Covers: AC-81, AC-82
- Rules / skills: client-src; frontend-architecture
- Practices: read `client/docs/design/src/chrome.jsx:15-19` for the order (`client/INSIGHTS.md:163-167`). Use the namespaced nav label pattern (`client/INSIGHTS.md:382-385`).
- Tests (test-writer): none
- Existing tests to update: `client/src/components/app-shell/nav.test.ts` if it lists the groups
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `client/`.

### Step 20 — Final rebuild and checks (all)
- Files: modify `agent-runner/INSIGHTS.md`
- Change:
  - Branch A: `pnpm build` in `agent-runner`, then commit `dist/` (contracts or reviewer-core may have moved in the rebase). Re-run the Step 17 bundle scan.
  - Run `./scripts/check-changed.sh` (full) and `./scripts/shared-contracts.sh check`.
  - In `evals/`: `pnpm eval:static`, then `pnpm eval:workflow`.
  - Check `git diff --stat origin/main -- server/src/modules/reviews server/src/modules/pulls` is empty (NFR-11).
  - Record the run in `agent-runner/INSIGHTS.md` Session Notes.
- Covers: NFR-11, NFR-12
- Rules / skills: engineering-insights
- Practices: push `.github/workflows/*` with `gh auth git-credential` (user memory; Emdash token lacks the `workflow` scope).
- Tests (test-writer): none
- Existing tests to update: whatever the full run shows broken
- Done when: every command above exits 0; the reviews/pulls diff is empty.

### Step 21 — Manual check on the user's demo fork (user + implementer)
- Files: none (verification step; findings go to `agent-runner/INSIGHTS.md`)
- Change: export an agent to the user's demo fork and verify three things:
  - (a) OQ-4: with "None" on a private repo, the runner fetches the diff with `pull-requests: read`;
  - (b) AC-57: a token without the workflow scope gets the mapped message;
  - (c) AC-120: the skipped `review` job shows `conclusion: skipped` in the jobs API on the export PR's own run.
  Record each outcome.
- Outcomes (2026-10-17, probe repo; also in `agent-runner/INSIGHTS.md`):
  - (a) OQ-4: in a private repo the diff request (`GET /repos/{r}/pulls/{n}`, diff media type, `GITHUB_TOKEN`) returned 200 with `contents: read` + `pull-requests: read` and with `contents: read` only. `pull-requests: read` is not required for "None"; AC-37 grants it anyway (harmless, left as is).
  - (b) AC-57: an Actions token (no `workflows` permission) got 201 for a normal file and 403 `{"message":"Resource not accessible by integration"}` for `.github/workflows/evil.yml` through `POST git/trees` and `PUT contents`; the body does not contain "workflow", so the mapping uses the commit payload (`server/src/modules/ci/workflow-scope.ts`). Unverified: what a PAT or OAuth token without the `workflow` scope returns over REST (the "refusing to allow an OAuth App …" text was seen only from `git push`).
  - (c) AC-120: the jobs API reports a skipped job as `completed` / `skipped`; a run whose only job is skipped is `completed` / `skipped` with 0 artifacts; a same-repo `pull_request` run has `pull_requests` length 1 and `head_repository.id` equal to `repository.id`.
- Covers: AC-37, AC-57, AC-120
- Rules / skills: security
- Practices: never seed or show `acme/payments-api` (user memory); push only to the user's fork.
- Tests (test-writer): none
- Existing tests to update: none
- Done when: the three outcomes are recorded; any failure is reported back as a Plan deviation.

### Step 22 — Configure step: trigger chips and the "Secrets expected" panel (client)
- Files: modify `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard/_components/ConfigureStep.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard/styles.ts`, `client/src/vendor/ui/primitives/Chip.tsx`, `client/messages/en/ci.json`
- Change:
  - **Trigger chips.** Replace the `Checkbox` list (`ConfigureStep.tsx:21-30`) with one row of `Chip`s: `display:flex`, `flexWrap:'wrap'`, `gap`. This replaces the `flexDirection:'column'` of `choiceRow` (`styles.ts:99`) with a new `chipRow`. A selected chip is `active` and shows the `Check` icon; a click calls `wizard.toggleTrigger(trigger)`. The "Select at least one trigger." alert and the disabled Continue stay as they are.
  - **`Chip.tsx`:** give the kit `Chip` an explicit `type="button"` and optional `role` and `ariaChecked` props, passed to the `<button>`. Each trigger chip then is `role="checkbox" aria-checked={selected}`. A native button already fires on Space and Enter.
  - **"Secrets expected" panel.** Place it between the Trigger fieldset and "Post results as":
    - a title;
    - exactly two rows, in this order:
      - `OPENROUTER_API_KEY` (mono), "Your OpenRouter key", badge from `wizard.preview?.secret_status`: `present` → "set" (success colours), `missing` → "not set" (warning colours), `unknown` (or no preview yet) → "unknown" (neutral `--text-muted`/`--bg-surface`, distinct from both);
      - `GITHUB_TOKEN`, "Auto-provided by Actions", badge "ready" (success).
  - Under the panel, the hint "Add these to your repo's Actions secrets before the workflow runs." shows in every state.
  - Delete the old single status line (`ConfigureStep.tsx:71-78`) and its `s.secret` style.
  - **`ci.json`:** remove `wizard.configure.secret.*` and add `wizard.configure.secrets.{title, hint, openrouter.description, github.description, badge.set, badge.notSet, badge.unknown, badge.ready}`, with the exact spec texts.
- Covers: AC-32, AC-33, AC-122, AC-123, AC-124, AC-125, AC-126, AC-127, AC-128, AC-129, AC-130, AC-131, AC-132, AC-133, EC-39, NFR-13, NFR-8
- Rules / skills: client-src, client-i18n; frontend-architecture; react-best-practices; security
- Practices:
  - The panel renders only the `secret_status` enum the server already returns (`CiPreview.secret_status`, Step 2). It never renders a value; there is none on the wire (AC-130, security rule 9).
  - Every badge carries its status as text, not colour alone (NFR-13). Keep the badge row inside one `role="status" aria-live="polite"` region so a status change after a regenerate is announced.
  - Derive the badge from the preview during render; no `useState` copy (react "Derive, don't store").
  - Keep the `Chip` change backward-compatible: existing callers pass no `role`.
  - Design: the trigger chips at `client/docs/design/src/screen_export.jsx:77`. The design export has no "Secrets expected" panel, so build it from the spec text and match the surrounding info box styling (`screen_export.jsx:84-87`).
- Tests (test-writer): `ExportWizard/ConfigureStep.test.tsx` — AC-122, AC-123, AC-125, AC-126, AC-128, AC-129, AC-130, AC-131, AC-132, AC-133, NFR-13 (recorded only, tests off)
- Existing tests to update: none found. No client test names the old secret line or the trigger checkboxes, and no test covers `ConfigureStep` (`rg -ln "configure.secret|Checkbox|pull_request:opened" client/src --glob '*.test.tsx'` prints nothing). Re-run the whole client suite: the `Chip` change reaches every `Chip` user.
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `client/`; `rg -n "configure\.secret\." client/src client/messages` prints nothing; `rg -n "secrets\.title" client/messages/en/ci.json` prints one line.

### Step 23 — Install step: the setup docs link (client)
- Files: modify `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard/_components/InstallStep.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard/constants.ts`, `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard/styles.ts`, `client/messages/en/ci.json`
- Change:
  - Add `GHA_DOCS_URL = "https://docs.github.com/en/actions"` to `constants.ts`.
  - Under the two install options, add a centered muted `<p>`: "Need help? See the " followed by `<a href={GHA_DOCS_URL} target="_blank" rel="noopener noreferrer">GitHub Action setup docs →</a>`.
  - The text is the key `wizard.install.help` with a rich tag (`t.rich("wizard.install.help", { link: (c) => <a …>{c}</a> })`).
- Covers: AC-134, AC-135, AC-136
- Rules / skills: client-src, client-i18n; frontend-architecture; security
- Practices: external links carry `rel="noopener noreferrer"` (security `devdigest.md` "client rendering" row). The URL is a constant, never built from data. The design's line is at `client/docs/design/src/screen_export.jsx:101`.
- Tests (test-writer): `ExportWizard/InstallStep.test.tsx` — AC-134, AC-135, AC-136 (recorded only, tests off)
- Existing tests to update: none (no test covers `InstallStep`)
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `client/`; `rg -n "noopener noreferrer" "client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/_components/ExportWizard/_components/InstallStep.tsx"` prints one line.

### Step 24 — CI tab: "Add repository" and the position of "Fail CI on" (client)
- Files: modify `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/CiTab.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/styles.ts`, `client/messages/en/ci.json`
- Change:
  - **With installations:** render the heading row ("CI deployment" plus the "active in" count, `CiTab.tsx:94-96`), then `FailOnControl`, then `InstallationsTable`.
  - **Then "Add repository":** a full-width `<button type="button">` with the `Plus` icon, a `1px dashed var(--border-strong)` border and a transparent background, matching `client/docs/design/src/screen_agents.jsx:158-159`. Its `onClick` is `setWizard({ preset: null })`, exactly like "Add to CI" (`CiTab.tsx:64`), so no installation's choices are preselected. It is disabled with the existing `tab.openRouterOnly` reason when `!supported`, the same as "Add to CI".
  - **Without installations:** keep "Not in CI yet" with "Add to CI", and keep `FailOnControl` shown (today it renders at `CiTab.tsx:72` for every state). Only its position changes, and only when installations exist.
  - Add the `ci.json` key `tab.addRepository` = "Add repository".
- Covers: AC-137, AC-138, AC-139, EC-40, EC-41
- Rules / skills: client-src, client-i18n; frontend-architecture; react-best-practices
- Practices:
  - Use a real `<button>`, never a clickable `<div>` (client AGENTS.md).
  - Both buttons share one handler; do not copy the wizard state.
  - Move the existing `FailOnControl` element and do not mount it twice (one radio group per page, NFR-7).
  - Styles go in `CiTab/styles.ts` and are applied as `style={s.addRepo}` (react "Styling").
  - The design places "Fail CI on" at `screen_agents.jsx:137-144`.
- Tests (test-writer): `CiTab/CiTab.test.tsx` — AC-137, AC-138, AC-139, EC-41 (recorded only, tests off)
- Existing tests to update: check `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx`. It renders the editor tabs; fix it only if it asserts the CI tab's element order.
- Done when: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass in `client/`; `rg -n "addRepository" client/messages/en/ci.json "client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/CiTab.tsx"` prints a line in each file.

### Step 25 — Workflow name "DevDigest Review" (server ci)
- Files: modify `server/src/modules/ci/workflow.ts`
- Change: the generated workflow's top-level `name` (`workflow.ts:37`, today `name: DevDigest review`) becomes `name: DevDigest Review`. Nothing else changes.
- Covers: AC-140
- Rules / skills: server-app; security
- Practices: change only the literal. The workflow's permissions, pins and jobs stay as Step 8 built them. The rename does not change the workflow file path (`WORKFLOW_FILE`), so ingest still finds the runs of existing installations. Existing installations are not marked Outdated, because "Outdated" compares only the manifest hash (Design notes → Outdated).
- Tests (test-writer): `server/src/modules/ci/workflow.test.ts` — AC-140 (recorded only, tests off)
- Existing tests to update: none (`rg -n "DevDigest review" server client/src e2e` finds only `workflow.ts:37`)
- Done when: `rg -n "name: DevDigest Review" server/src/modules/ci/workflow.ts` prints line 37; `./scripts/check-changed.sh --quick` is green for server and client (this is the end of G7).

## Contracts & migrations
- Shared contracts sync: yes — `contracts/eval-ci.ts`, `contracts/trace.ts`, `adapters.ts` (Steps 2–3).
- Schema change + `pnpm db:generate`: yes — `ci_installations` and `ci_runs`; schema in Step 14, generation only in Step 18, after A is merged.
- Spec `Status` update: yes — the implementer sets SPEC-15 to `in progress`, then to its final status (`specs/README.md` vocabulary).

## Verification
| Package | Checks (from routing.json) |
|---|---|
| server | `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm arch` (+ `pnpm test:integration` in Step 18) |
| client | `pnpm typecheck` · `pnpm lint` · `pnpm test` |
| agent-runner | `pnpm typecheck` · `pnpm test` (added in Step 5) |
| mcp | `pnpm typecheck` · `pnpm lint` · `pnpm test` (vendor/shared changed) |
Plus extra checks: `./scripts/shared-contracts.sh check`; `pnpm eval:static` and `pnpm eval:workflow` in `evals/` (AGENTS.md, routing.json and dependency-cruiser.cjs changed). Needs Postgres: yes (Step 18 only).
All of the above in one command: `./scripts/check-changed.sh` (a group that is not the last runs `--quick`).
Plan deviations to report, not fix: the spec's `npm run typecheck` / `npm test` for agent-runner (spec :120) are `pnpm typecheck` / `pnpm test` (user decision, brief :234). `repository_id` is nullable and filled on the first refresh when a zip export had no token (spec :331, AC-55; user decision).

Accepted deviations recorded after implementation (verifier round):
- Step 4 "Done when": `grep -c "^import\|require(" agent-runner/dist/index.js` prints 1, not 0. The ESM bundle has exactly one `import { createRequire … } from "module"` (a Node builtin); no package is imported and the bundle needs no `node_modules`. Smoke test: `node dist/index.js` in an empty dir prints the manifest-directory error and exits 1. (Also in `agent-runner/INSIGHTS.md`.)
- Step 13 file path: `TraceDetails` lives in `client/src/components/ci-run-table/TraceDetails.tsx`, not in `client/src/app/ci-runs/_components/TraceDetails/`, because lint forbids a shared component from importing `@/app`; the CI tab and the page both get the Trace row through `CiRunTable`.
- Step 5 `.files`: `scripts/dev.sh`, `scripts/e2e.sh` and `.github/workflows/server-integration.yml` stay unchanged by design (branch A: `dist/` is committed); the check script does not model branch A.
- Unplanned supporting files, each belonging to the named step:
  - Steps 11–12: `ExportWizard/{constants,styles,useDialogA11y}.ts`, `FailOnControl/{constants,styles}.ts`, `InstallationsTable/styles.ts`, `client/src/vendor/ui/ExportWizardSteps.tsx` (`aria-current`, NFR-7).
  - Step 13: `ci-runs/_components/CiRunsView/{CiRunsView.tsx,helpers.ts,index.ts,styles.ts}`, `components/ci-run-table/{CiStatusBadge.tsx,TraceDetails.tsx,helpers.ts,styles.ts}`.
  - Step 14: `ci_runs` gained a `repo` column and `status` is NOT NULL.
  - Step 17: new error code `ci_install_conflict` (409) and `AppError` throws in the ci repository.
  - Generated / lock output: `agent-runner/dist/{300.index.js,package.json}`; `client/pnpm-lock.yaml` (pnpm 10.34 also rewrote unrelated lines, no version bumps); `server/pnpm-lock.yaml` (yaml only); `agent-runner/CLAUDE.md` (symlink to `AGENTS.md`).
  - Docs: `client/INSIGHTS.md` (4 entries); root `AGENTS.md` also shortens one "Keeping docs alive" bullet to stay at 100 lines.
- Review-round changes outside any step's file list: fix round 1 touched `agent-runner/src/{run,diff,index,errors,manifest,skills}.ts`, `server/src/modules/ci/service.ts` and three client CiTab files. The security fix round touched `service.ts`, `redact.ts`, `octokit.ts` (`listWorkflowRuns` maps `event` and `head_repository_id`), shared `adapters.ts` and `contracts/eval-ci.ts` (+ client copy), and agent-runner `run.ts`, `artifact.ts`.
- Contract note: `CiResultArtifact.pr_number` stays in the contract but the server ignores it (the PR number comes only from GitHub's run metadata); the PR title is fenced through the `prDescription` argument; ingest skips any run whose `event` is not `pull_request` or whose head repository id differs from the installation's `repository_id`.
- Step 21 was run by the main session on a private probe repo, not through DevDigest's export; (b) is only approximated by an Actions token, not by a PAT without the workflow scope.
- Review round (PR #28): install validates the edited workflow server-side (no pull_request_target/workflow_run, permissions limited to contents read and pull-requests read|write, uses pinned to a 40-hex SHA); the spec's Untrusted-inputs table says the edited workflow is committed as edited, so this is stricter than the spec.

## Insights to record
- `server/INSIGHTS.md` · Codebase Patterns — `yaml` is on the application allowlist so the `ci` generators can stringify YAML (Where: `.claude/skills/onion-architecture/assets/dependency-cruiser.cjs:45`)
- `server/INSIGHTS.md` · Codebase Patterns — `ci_installations.repository_id` is nullable and filled on the first refresh; AC-108 compares only after that (Where: `server/src/modules/ci/service.ts`)
- `server/INSIGHTS.md` · Tool & Library Notes — `commitFiles.replaceDirs` deletes through tree entries with `sha: null`, also on a new branch (Where: `server/src/adapters/github/octokit.ts`)
- `agent-runner/INSIGHTS.md` · What Works / What Doesn't Work — the Step 1 reproducibility verdict and the Step 21 fork outcomes

<!-- implementer-brief:end -->

## Context read
- `specs/15-export-to-ci.md:1-359` — SPEC-15, approved; 121 AC, 38 EC, 12 NFR; OQ defaults.
- `docs/plans/11-export-to-ci.brainstorm.md:2,186-236` — chosen options and user decisions; "For the planner".
- `AGENTS.md` (root) — naming, cross-package rules, do-not-touch, evals.
- `server/AGENTS.md`, `client/AGENTS.md` — module layout, zod routes, hooks and query keys, i18n.
- `server/src/vendor/shared/contracts/eval-ci.ts:247-356` — current CI contracts (7-field manifest, 9-field result).
- `server/src/vendor/shared/adapters.ts:140-195` — `CommitFilesPayload`, `GitHubClient`.
- `server/src/adapters/github/octokit.ts:20-69,269-344` — `toAppError`, `call()`, additive `commitFiles`.
- `server/src/db/schema/ci.ts:1-30`, `repos.ts:5-29`, `runs.ts:19-63`, `knowledge.ts:8-28` — tables; no GitHub repo id anywhere.
- `server/src/vendor/shared/contracts/trace.ts:86-105` — `RunTrace` shape.
- `server/src/platform/container.ts:217-224,440-447` — deps getter pattern; GitHub client from `GITHUB_TOKEN`.
- `server/src/modules/eval/ports.ts:153-162`, `eval/routes.ts:37-67` — structural agent port; route idiom and rate limit.
- `server/src/modules/agents/helpers.ts:95-108` — `ci_fail_on` bumps the version; skill bindings do not, hence the manifest hash for "Outdated".
- `.claude/skills/onion-architecture/assets/dependency-cruiser.cjs:28-50,114-118` — `yaml` not allowlisted; adapters may not import modules.
- `server/src/adapters/archive/zip.ts:1-40` — fflate reader with size checks; ports declared structurally in `skills/ports.ts:89`.
- `.claude/skills/pr-self-review/assets/routing.json` — no agent-runner package or rule yet.
- `.gitignore:3-5` — `agent-runner/dist/` already un-ignored.
- `client/src/app/agents/[id]/page.tsx:17`, `AgentEditor/constants.ts`, `AgentEditor.tsx:18-22` — tab wiring.
- `client/src/vendor/ui/nav.ts:23-45`, `client/src/components/app-shell/hooks/useNavLabel.ts:13` — no GLOBAL group; labels only from `eval`.
- `client/messages/en/ci.json` — the namespace exists, including the "Requires a GitHub App" string.
- `server/src/vendor/shared/contracts/platform.ts:127-132` — `SecretsStatus.github`.
- `upstream/lesson-7-lab/agent-runner:agent-runner/**` — package layout, `artifact.ts`, `index.ts`, INSIGHTS.
- `server/INSIGHTS.md:65-70,102-107,146-151,486-490,506-511,526-527,593-605,614-622`; `client/INSIGHTS.md:94-99,163-167,358-385`; root `INSIGHTS.md:94-98,327-332`.

## Requirements trace
| R | Requirement (source `path:line` or "request") | Steps |
|---|---|---|
| AC-1–AC-5 | CI tab and wizard entry (spec :124-129) | 11, 12 |
| AC-6–AC-12 | Target and replacement (:131-138) | 12, 16 |
| AC-13–AC-18 | Preview (:140-146) | 6, 8, 12 |
| AC-19–AC-25 | Generated files (:148-155) | 7 |
| AC-26–AC-33 | Configure (:157-165) | 3, 12 |
| AC-34–AC-45, AC-117, AC-119 | Workflow (:167-179, :265, :267) | 8 |
| AC-46–AC-59 | Install (:181-195) | 3, 12, 16, 17 |
| AC-60–AC-72, AC-118 | Runner (:197-210, :266) | 4 |
| AC-73–AC-80 | CI tab (:212-220) | 11 |
| AC-81, AC-82 | Nav (:222-224) | 19 |
| AC-83–AC-98 | CI Runs page (:226-242) | 9, 13 |
| AC-99–AC-116, AC-120, AC-121 | Refresh and ingest (:244-269) | 9, 10, 15, 16, 21 |
| AC-32, AC-33 (reworded), AC-122–AC-133, EC-39, NFR-13 | Amendment 2026-10-17: the "Secrets expected" panel and trigger chips (spec :165-166, :273-284, :332, :349) | 22 |
| AC-134–AC-136 | Amendment: Install help link (:285-287) | 23 |
| AC-137–AC-139, EC-40, EC-41 | Amendment: "Add repository" and the "Fail CI on" position (:288-290, :333-334) | 24 |
| AC-140 | Amendment: workflow name (:291) | 25 |
| EC-1–EC-38 | spec :271-309 | as cited per step |
| NFR-1–NFR-12 | spec :311-323 | as cited per step |
Recommendations: octokit actions methods verified first, with the `octokit.request` fallback — accepted (Step 3). `RUNNER_VERSION` and `MANIFEST_VERSION` in `eval-ci.ts` — accepted (Step 2). npm→pnpm as a deviation note plus package registration and evals — accepted (Steps 5, 20).

## Affected modules
| Package | Path | Ring / layer | Change |
|---|---|---|---|
| server | `src/vendor/shared/contracts/eval-ci.ts`, `trace.ts`, `adapters.ts` | core | contracts, port |
| server | `src/adapters/github/octokit.ts`, `adapters/mocks.ts`, `adapters/archive/zip.ts`, `adapters/runner-bundle/` | outer (driven) | Actions API, path delete, zip writer, bundle reader |
| server | `src/modules/ci/*` | ports/application/outer | new module |
| server | `src/db/schema/ci.ts` + generated migration | outer | columns, indexes |
| server | `src/platform/container.ts`, `config.ts`, `modules/index.ts` | composition root | wiring |
| agent-runner | `agent-runner/**` | new package | runner CLI and bundle |
| client | `src/lib/hooks/ci.ts`, `query-keys.ts`, `api.ts` | data | hooks |
| client | agent editor `CiTab/**`, `app/ci-runs/**`, `components/ci-run-table/` | feature/route | UI |
| client | `vendor/ui/nav.ts`, `components/app-shell/**` | chrome | nav entry |
| repo | `AGENTS.md`, `routing.json`, `dependency-cruiser.cjs`, `.github/workflows/agent-runner.yml`, `.gitignore`, `scripts/*` | harness/CI | registration |

## Constraints honored
| Rule | Source (`path:line`) | How the plan respects it |
|---|---|---|
| Edit the server contracts, then sync | `AGENTS.md` "Cross-package rules" | Steps 2–3 sync; checks in Steps 3 and 20 |
| Migrations only via `db:generate` | `AGENTS.md` "Do not touch" | Step 18 only, after A |
| DB tests end in `.it.test.ts` | `AGENTS.md` "Naming" | recorded test names use the suffix |
| i18n in `client/messages/en/ci.json` | spec NFR-8 | Steps 11–13, 19 |
| Onion: ports via the constructor, no Container | onion SKILL Principle 3 | `CiDeps` from `container.ciDeps` |
| One ACL per SDK | onion Principle 5 | all GitHub calls in `octokit.ts` |
| Adapters do not import modules | `dependency-cruiser.cjs:114-118` | structural ports |
| No `pull_request_target`, minimal permissions, SHA pins | security rule 12 | Step 8 |
| Secrets only by name | security rule 9, NFR-2 | Steps 3, 7, 9 |
| NFR-11, reviews untouched | spec :322 | the ci repository writes `agent_runs` itself; check in Step 20 |
| Lock files via their manager | `AGENTS.md` "Do not touch" | `pnpm install` / `pnpm add` only |
| `CLAUDE.md` is a symlink | `AGENTS.md` "Do not touch" | Step 4 `ln -s` |

## Design notes
- **Transactions:** the repo's precedent is repository-level transactional methods (`skills/repository.ts:42`, `onboarding/repository.ts:50`). `storeRun` and `replaceInstallation` follow it instead of adding a unit-of-work port; the service still decides when the write happens.
- **Skipped job (AC-120):** the workflow has two jobs, `gate` and `review`. Fork PRs and bases without a runner skip `review`, and the jobs API shows whether it ran. Runs whose review was skipped are never stored, so a later refresh re-reads them; this costs at most 20 job reads per installation per refresh.
- **PR title:** taken from the workflow run's `display_title` (for `pull_request` runs it is the PR title), so it needs no extra call.
- **Outdated:** sha256 of the manifest text generated now vs. the one stored at export. Skill binding toggles do not bump the agent version (`agents/helpers.ts:95-108`), so a version compare would miss them.
- **Zip:** built on the server (it has the runner bytes, which preview does not send). A separate route returns `application/zip`.
- **Replace dirs:** all three `.devdigest/` sub-directories are replaced, so the files of an earlier agent leave too (AC-12, EC-2).

## Risks & open questions
- G7 (Steps 22–25, added for the 2026-10-17 amendment) is placed after Step 21 in the file only because step numbers must be sequential. In execution order it runs before the remaining Steps 19 and 21. Finished steps are not reopened.
- The design export has no "Secrets expected" panel; it comes from the course lab images. Step 22 builds it from the spec text, so its look may still differ from those images.
- Step 22 changes the shared kit `Chip` (`client/src/vendor/ui/primitives/Chip.tsx`): it gets `type="button"` plus optional `role` and `ariaChecked`. A `Chip` inside a form would no longer submit it; none was found to rely on that, but this is unverified for every caller.
- Step 1's verdict decides between branches A and B of Step 5. With branch B, a stale local `dist/` exports silently (brief fact 10).
- The `workflow`-scope error status (403, 404 or 422) and its message are unverified; Step 21 confirms them.
- `display_title` as the PR title, and `conclusion: skipped` on the jobs API, are unverified; Step 21.
- Memory scope `team` (`knowledge.ts:16`) is left out of AC-24's "whole workspace"; only `global` is included. Ask the user if `team` should count.
- NOT NULL `workspace_id` on `ci_installations` and `ci_runs` assumes the tables are empty (no writer exists today). If a dev DB has rows, the generated migration fails, and the rows must be cleared by hand on that DB, never by editing the migration.
- Worktree A may also touch `vendor/shared`, `reviewer-core` or migrations (brief fact 27); Step 18's rebase can conflict there. With branch A the bundle must be rebuilt after it (Step 20).
- Whether `ncc` writes `dist/package.json` (`{"type":"module"}`) itself is unverified; if it does not, `build` must write it.
- The upstream runner tests (`diff.test.ts`, `manifest.test.ts`, `run.test.ts`) are not copied because tests are off; they are ready to lift when tests are turned on.
- The brief is above 20 000 characters, because 171 spec ids are written out and there are 21 steps.

## Handed off
- Architecture reviewer: structural ports in `modules/ci/ports.ts`; `CiRepository` writing `agent_runs`/`run_traces` outside `reviews`; `yaml` added to the application allowlist; `container.ciDeps`; zip route returning bytes.
- Security reviewer: `workflow.ts` (permissions, base-commit checkout, fork guard, SHA pins, no interpolated user text); `redact.ts` patterns and the bundle scan; `ingest-check.ts` (zip entry, sizes, JSON parse); `listRepoSecretNames` (names only); the install and refresh rate limits; the error mapping that hides GitHub bodies; `agent-runner/src/artifact.ts` contents (AC-72); the new `agent-runner.yml` workflow.
