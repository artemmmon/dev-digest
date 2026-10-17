# agent-runner Insights

Non-obvious discoveries from real sessions. Specific and actionable.

## What Works

### 2026-10-17 — ncc bundle is byte-reproducible (REPRODUCIBLE, Step 1 spike)
Built `upstream/lesson-7-lab/agent-runner` (ncc 0.38.4, TypeScript 5.9.3, from the lockfile) three times: twice on the macOS host, once in `node:22` (Linux, clean copy of `agent-runner`, `reviewer-core`, `server/src/vendor/shared`, no host `node_modules`, `npm ci` + `pnpm install --frozen-lockfile`). All three produced identical hashes, so a committed `dist/` with a CI drift check is safe (plan D1-1, Step 5 branch A). The Docker run was arm64; the bundle is JS-only with no native part, so x64 CI should match. The flat `dist/` holds three files, not one: `index.js`, `300.index.js` (a chunk) and `package.json`.
```
99aad697f412c582652c9c3998e5dbe40851f5c2b673cd0ed549c001b5153845  300.index.js
cfb4b39ac742d39cdf34bc4c05597a82f9e4a7829749c6bf6a755c3348340b20  index.js
3ca9d4afd21425087cf31893b8f9f63c81b0b8408db5e343ca76e5f8aa26ab9a  package.json
```
(host build 1, host build 2 and the Docker build: the same three lines each.)
Where: agent-runner/package.json:1

### 2026-10-17 — Step 21 probe on a private repo: diff fetch needs only `contents: read`, a skipped job reads `completed/skipped`, a workflow write is refused with a message that does not say "workflow"
Run by the main session on a throwaway private repo (`artemmmon/devdigest-ci-probe`, PR #1), not through DevDigest's export. (a) OQ-4: `GET /repos/{r}/pulls/{n}` with the diff media type and `GITHUB_TOKEN` returned 200 (2468 bytes) with `contents: read` + `pull-requests: read` and with `contents: read` only, so "None" mode does not need `pull-requests: read`; the generated workflow grants it anyway (AC-37, harmless). (b) AC-57: an Actions integration token (no `workflows` permission) wrote a normal file through create-tree with 201, but `.github/workflows/evil.yml` through `POST git/trees` and `PUT contents` got 403 `{"message":"Resource not accessible by integration"}`, with no "workflow" in the body. So `server/src/modules/ci/workflow-scope.ts` maps by the commit payload (a path under `.github/workflows/` plus 403/422, or 404 after a successful `getRepository`), not by the message. **(unverified)** what a classic PAT or OAuth token without the `workflow` scope returns over REST: the text "refusing to allow an OAuth App to create or update workflow … without `workflow` scope" was seen only from `git push`, and an Actions token is only an approximation of such a PAT. (c) AC-120: the jobs API reports a skipped job as status `completed`, conclusion `skipped`; a run whose only job is skipped is run status `completed`, conclusion `skipped`, with 0 artifacts; a same-repo `pull_request` run has `pull_requests` length 1 and `head_repository.id` equal to `repository.id`.
Where: server/src/modules/ci/service.ts:165

## What Doesn't Work

### 2026-10-17 — `ncc build` fails on `Cannot find module 'zod'` without `server/node_modules`
The shared contracts live in `server/src/vendor/shared`, so TypeScript resolves `zod` by walking up from there and never sees `agent-runner/node_modules`. On a clean checkout (CI, Docker) there is no `server/node_modules`, and ncc's ts-loader fails with TS2307 plus follow-up implicit-any errors. Fix: add `"zod": ["./node_modules/zod"]` to `paths` in `agent-runner/tsconfig.json` (and the same alias in `vitest.config.ts`). With it the build passes without installing `server/`.
Where: agent-runner/tsconfig.json:1

### 2026-10-17 — a package-level `.gitignore` with `dist/` silently overrides the root un-ignore
The root `.gitignore` un-ignores `agent-runner/dist/`, but the upstream `agent-runner/.gitignore` also listed `dist/`, and a nested `.gitignore` wins over the parent one. `git check-ignore -v agent-runner/dist/index.js` showed `agent-runner/.gitignore:2:dist/`, so the committed-bundle rule was dead. Fix: `agent-runner/.gitignore` holds only `node_modules/` and `*.log`. Check with `git check-ignore -v agent-runner/dist/index.js` (no output of the nested file means the root negation applies).
Where: agent-runner/.gitignore:1

### 2026-10-17 — `core.autocrlf=input` strips the CRLF a bundled dependency ships, so the committed `dist/index.js` differs from a Linux build
`whatwg-url` 5.0.0 (via `openai` → `node-fetch`) is published with CRLF line endings, and ncc copies them into `dist/index.js` (1297 lines, 4339-5635). With `core.autocrlf=input` (the global git config here) `git add` rewrites them to LF, so the blob is LF while `pnpm build` on Linux CI emits CRLF and the `git diff --exit-code -- dist` drift check fails. Fix: the root `.gitattributes` has `agent-runner/dist/** -text`, which turns the conversion off for the bundle. Check: `git ls-files --eol agent-runner/dist` must show the same value under `i/` and `w/` for `index.js` after staging.
Where: .gitattributes:4

## Codebase Patterns

### 2026-10-17 — the built bundle is ESM with one `import` line, and it needs no `node_modules`
`ncc build` writes `dist/package.json` with `{"type":"module"}` and an ESM `dist/index.js` whose only top-level `import` is `import { createRequire } from "module"` (a Node builtin). So `grep -c "^import\|require(" dist/index.js` prints `1`, not `0`; the real check is that no import names a package. Smoke test: run `node agent-runner/dist/index.js` in an empty directory. It must print `[agent-runner] FAILED: Agent manifest directory not found …` and exit 1, which proves the `import.meta.url === file://argv[1]` direct-run guard in `src/index.ts` fires inside the bundle. Current hashes (reviewer-core and shared contracts at the G2 state; identical on two host builds): `index.js` `15ee11a78163ceb45f627ee5bffc7c19e6c1a2f502387a4be535328e22e080a5`, `300.index.js` `99aad697…`, `package.json` `3ca9d4af…`.
Where: agent-runner/src/index.ts:65

## Session Notes

### 2026-10-17 — G6 part 1: migration 0026, real-Postgres probe of the ingest paths, final checks
`pnpm db:generate` produced `0026_clear_sentinels.sql` in one pass (no rename prompt; `ci_installations` and `ci_runs` were empty, so the new NOT NULL columns applied). Ran `pnpm db:migrate`, the 18 `.it.test` files (163 tests) and a throwaway script (not in the repo) that drove `CiService` over `CiRepository` on the dev DB with a stubbed GitHub client: install replaces the other agent's installation, a Failed run stores no `agent_runs` row, a run id is stored once under 3 concurrent refreshes, the 30 s claim has one winner. `agent-runner` rebuilt byte-identical; `ci_runs.ran_at` cursor is only exact for millisecond values (JS `Date`), not for `now()` written by SQL. Before relying on that cursor with SQL-written timestamps, compare at `date_trunc('milliseconds', …)`. `eval:static` failed twice on paths named in AGENTS.md (`dist/` in the root, `.devdigest/runner/` in `agent-runner/AGENTS.md`): the test resolves every backticked path against the repo.
Where: server/src/modules/ci/repository.ts:66
