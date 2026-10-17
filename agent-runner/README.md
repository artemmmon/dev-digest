# @devdigest/agent-runner

The DevDigest CI runner: a standalone script that reviews a pull request inside a
*target repository's own GitHub Actions*, outside this repo's server and Postgres.
`ncc` bundles `src/index.ts` into `dist/index.js`; the DevDigest server exports that
bundle into the target repo as `.devdigest/runner/index.js`, and the generated
workflow runs `node .devdigest/runner/index.js` on each same-repository pull request.
Spec: `../specs/15-export-to-ci.md`. Package rules: `AGENTS.md`.

## What it does

1. Loads and validates `.devdigest/agents/<slug>.yaml` (the shared `AgentManifest`:
   `manifest_version` 1, `agent_version` >= 1) and the skills in `.devdigest/skills/`.
2. Resolves the PR context from env and the `pull_request` event payload.
3. Fetches the PR diff over the GitHub REST API and drops `.devdigest/**` and
   `.github/workflows/**`.
4. Runs the same `reviewer-core` pipeline as a studio review (`reviewPullRequest`:
   untrusted-input fencing, structured completion, mandatory grounding). The PR title
   and body go inside the fenced `pr-description` block.
5. Computes the verdict from the grounded findings and the manifest's `ci_fail_on`
   (`countBlockers` / `gateTriggered`), never from the model's own verdict.
6. Posts per `DEVDIGEST_POST_AS`, and only after the post succeeded writes
   `devdigest-result.json` (a `CiResultArtifact`).

`src/run.ts` (`runCi`) holds the pipeline; `src/index.ts` only wires env, fs and the
OpenRouter provider and maps the result to the exit code.

## Environment

Read straight from `process.env` (the bundle runs in someone else's CI, so the server's
`SecretsProvider` does not apply).

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENROUTER_API_KEY` | yes | LLM credential |
| `GITHUB_TOKEN` | unless `DEVDIGEST_POST_AS=none` | fetch the diff, post the review or comment |
| `GITHUB_REPOSITORY` | yes | `owner/name` |
| `PR_NUMBER` | yes (falls back to the event payload) | pull request to review |
| `DEVDIGEST_HEAD_SHA` | yes | PR head commit, 40 lowercase hex (set by the workflow) |
| `GITHUB_RUN_ID` | yes | Actions run id, a positive integer (default Actions variable) |
| `GITHUB_REPOSITORY_ID` | yes | numeric repository id (default Actions variable) |
| `DEVDIGEST_POST_AS` | no | `github_review` (default), `pr_comment` or `none` |
| `GITHUB_EVENT_PATH` | set by Actions | event payload with the PR title, body and fork flag |
| `DEVDIGEST_DIR` / `DEVDIGEST_RESULT_PATH` | no | override `.devdigest/` and the result path (defaults: `cwd/.devdigest`, `cwd/devdigest-result.json`) |

## Result file

`devdigest-result.json` has 16 fields, counts and ids only: `findings_count`, `critical`,
`warning`, `suggestion`, `verdict`, `cost_usd`, `duration_ms`, `agent`, `manifest_version`,
`agent_version`, `runner_version`, `model`, `commit_sha`, `repository_id`, `run_id`,
`pr_number`. No PR title or body, diff, finding text or env value. The server validates it
against the same `CiResultArtifact` schema on ingest.

## Exit codes

- `0`: the review completed and the `ci_fail_on` gate did not trigger (never for `never`).
- `1`: the gate triggered, or the review could not complete (invalid manifest, missing
  skill, unresolvable context, diff or model error, failed post). On a failure nothing is
  posted and no result file is written.

## Commands

```sh
(cd ../reviewer-core && npm ci)   # once: the bundle resolves `openai` from reviewer-core/node_modules
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test        # vitest, hermetic: LLM stubbed, no network
pnpm build       # rm -rf dist && ncc build src/index.ts -o dist
```

`reviewer-core` and `@devdigest/shared` are consumed as raw TypeScript through the
`tsconfig.json` `paths` (and the same aliases in `vitest.config.ts`), so the sibling
folders `../reviewer-core` and `../server/src/vendor/shared` must exist.

## Committed bundle and the drift check

`dist/` (`index.js`, `300.index.js`, `package.json`) is committed and the export ships it.
The build is byte-reproducible, so CI runs `pnpm build` and fails on `git diff --exit-code -- dist`
or a non-empty `git status --porcelain -- dist`. Rebuild and commit `dist/` after any change to
`src/`, `reviewer-core/` or `server/src/vendor/shared/`. The root `.gitattributes` marks
`agent-runner/dist/**` as `-text`: a bundled dependency ships CRLF source, and line-ending
normalization on commit would otherwise make the committed file differ from a Linux build.

See `INSIGHTS.md` for build quirks.
