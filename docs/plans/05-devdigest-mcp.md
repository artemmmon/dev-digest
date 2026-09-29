# Development Plan: devdigest-mcp, a local stdio MCP server with 5 tools (L04)
Status: implemented
Save as: docs/plans/05-devdigest-mcp.md
Spec: none (no spec in `specs/` covers MCP. README.md:85 lists "L04 | `devdigest-mcp` server · Blast Radius (reads `repo-intel`)")
Brainstorm: none

## Goal
Add a local-only MCP server that Claude Code launches over stdio. It has exactly five tools: `list_agents`, `run_agent_on_pr` (the only write tool), `get_findings`, `get_conventions`, and `get_blast_radius` (a registered stub with a fixed contract). It runs reviews through the existing DevDigest API pipeline and returns short, structured answers with errors that say what to do next.
In scope: a new `mcp/` package; one read-only server endpoint for looking up a PR by number; a launcher script and `.mcp.json`; tests, a token-budget measurement, CI, routing, docs.
Out of scope: HTTP/Streamable transport, OAuth, remote hosting, a real blast-radius implementation (homework), MCP resources/prompts, client UI, DB schema changes, shared-contract changes.

## Open questions for the user (confirm before the implementer starts)
Confirmed by the user on 2026-09-29: all recommended defaults below (1 `mcp/` package over REST, 2 SDK 1.x, 3 the by-number endpoint), plus the stub is registered, the wait is 90 s, no separate spec, and `agent` accepts a uuid or an exact case-insensitive name.

1. **Where does the server live?** Recommended default: **(a) a new top-level `mcp/` package that talks to the running DevDigest API over REST**, the way `client/` does. The other option was (b) a stdio entrypoint inside `server/` with its own `Container`. (b) was rejected because `RunBus` and `JobRunner` exist in memory once per process (`server/src/platform/container.ts:127-128`, `server/INSIGHTS.md` "Queue state is in-memory only"). A review started from a second process would be invisible in the UI Live Log and could not be cancelled from the UI. The API's boot reaper would mark it failed (`server/src/modules/reviews/service.ts:127`). It would also give the MCP process the secrets file and a Postgres pool, and its startup would load ast-grep, Octokit and Drizzle. Cost of (a): the API must be running (`./scripts/dev.sh`). (b) needs Postgres anyway, so (a) adds little. Full comparison under Design notes → Location.
2. **Which SDK line?** Recommended default: `@modelcontextprotocol/sdk` 1.x. I checked 1.30.0 locally (npx cache; the implementation pinned 1.31.0, the newest 1.x at the time): Node ≥18, peer `zod ^3.25 || ^4`, `registerTool({title, description, inputSchema, outputSchema, annotations, _meta})`, `StdioServerTransport`, `InMemoryTransport`, and input-validation failures returned as `isError` results. The v2 split packages (`@modelcontextprotocol/server`/`client`) and their dual-era claim could not be verified. The implementer pins the newest 1.x. Moving to v2 is a separate, later change.
3. **Is the small server endpoint OK?** Recommended default: yes, add `GET /repos/:id/pulls/by-number/:number` (DB only). Without it, every read tool has to resolve a PR number through `GET /repos/:id/pulls`, which syncs from GitHub and upserts on every call (`server/src/modules/pulls/service.ts:40-44`). That would make read tools slow, networked and side-effecting.

## Decisions & assumptions (defaults unless the user overrides)
- Package manager for `mcp/` is **pnpm** (same as server). Runtime is `tsx` (as `server` dev). There is no build step. It is launched with `bash scripts/mcp.sh`, never `pnpm run`, because pnpm prints a banner to stdout.
- `.mcp.json` (project scope, server name `devdigest`) is committed. The guide also documents `claude mcp add`.
- Argument formats: `repo` = GitHub `owner/name`, case-insensitive. `pr` = GitHub PR number. `agent` = an agent uuid from `list_agents`, or its exact name, case-insensitive. An ambiguous name is an error.
- Verdict **exists** per run: `reviews.verdict` (`server/src/db/schema/reviews.ts:38`), contract `Verdict` = `request_changes|approve|comment` (`server/src/vendor/shared/contracts/findings.ts:27`), `ReviewRecord.verdict` nullable (`contracts/review-api.ts:33`). A run maps to one review through `run_id`, so nothing is derived. A null verdict is passed through.
- Dismissed findings are left out of results and counts. Sort is CRITICAL → WARNING → SUGGESTION, then file, then line.
- `run_agent_on_pr` waits server-side up to `DEVDIGEST_MCP_MAX_WAIT_S` (default 90, bounds 10–600) and polls every 3 s. On timeout it returns a **non-error** result `status:"running"` with the run id and a hint to call `get_findings`. When the client cancels (`extra.signal`), polling stops and the server run is **not** cancelled: its result stays retrievable, and the UI can cancel it.
- If the same agent already has a run in flight on that PR, `run_agent_on_pr` attaches to it instead of starting a second one. This saves money.
- `run_agent_on_pr` calls `GET /pulls/:id` before starting. Without that, a never-opened PR is reviewed as an empty diff (`server/INSIGHTS.md:39`, `server/src/modules/reviews/diff-loader.ts:11`).
- The MCP holds no secrets. Its only outbound target is `DEVDIGEST_API_URL` (default `http://localhost:3001`, `server/src/platform/config.ts:29-30`), and that must be a loopback host.
- Tests sit next to their subject in `mcp/src/**` (root naming rule). None touch the DB. The one new server test is `.it.test.ts` in `server/test/` (server convention).

## Amendments after the onion-architecture review (2026-09-29, confirmed by the user)
The skill is written for `server/`, so it is applied to `mcp/` by analogy: `api/port.ts` = core port, `api/http.ts` = driven adapter, `tools/*` = driving adapters, `index.ts` = composition root. These amendments supersede Steps 4–7 where they conflict.
1. **Thin tool handlers.** A tool handler does only: zod-parsed input → one application call → `structuredContent`/`isError`. The orchestration now in `tools/run-agent-on-pr.ts` (resolve → refresh → attach-to-active → start → wait → shape) and the run selection `pickRun` in `tools/get-findings.ts` move to an application service (`mcp/src/service.ts`, class built from the `DevDigestApi` port and `McpConfig`; methods `listAgents`, `runAgentOnPr`, `getFindings`, `getConventions`). It is unit-tested with the fake API, without the MCP SDK.
2. **Core types point inward.** Result types (`RunResult`, `FindingOut`, `ConventionOut`, `AgentOut`, …) live in a core file `mcp/src/domain.ts` (types only, no SDK imports). `wait.ts`, `format.ts` and `service.ts` import from `domain.ts`, never from `tools/*`. `tools/outputs.ts` keeps the zod output schemas and asserts at compile time that they match `domain.ts`.
3. **Neutral application error.** `resolve.ts`/`service.ts` throw a neutral user-facing error (rename `ToolFailure` → `NextStepError`, defined in `errors.ts`, no MCP types). Only the edge (`tools/context.ts` `guard`) turns it, and `ApiError`, into `isError`.
4. **Rings enforced in `mcp/eslint.config.mjs`** with `no-restricted-imports` (as `reviewer-core` does): `domain.ts`, `api/port.ts`, `api/schemas.ts` may import only zod/types; `resolve.ts`, `wait.ts`, `format.ts`, `service.ts`, `errors.ts` must not import `./tools/*`, `./server`, `./index`, `./api/http` or `@modelcontextprotocol/*`; only `index.ts` may import `./api/http`. `pnpm lint` in `mcp/` fails on a violation.
5. **Descriptions.**
   - The wait limit is not hard-coded: `run_agent_on_pr` says the wait is limited by the configured maximum (interpolated from `config.maxWaitS`, 90 s by default).
   - Pointers to other tools ("use get_findings", "call run_agent_on_pr") are removed from tool descriptions and live only in `next_step` values and error messages. The `agent` argument's `.describe()` may still say the id comes from `list_agents` (it names the parameter's source). *Amended in implementation:* to save budget it is now just "Agent id or exact name" and no longer names `list_agents`; the run_agent_on_pr description was shortened too.
   - Tool names stay as fixed by the course slides (no `devdigest_` prefix); `instructions` names DevDigest to compensate.
6. **Verification additions.** `pnpm arch` in `server/` (Step 1), and the contract test asserts that no tool description contains another tool's name.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | 1 | server / pulls module | — (parallel with G2) | Endpoint `GET /repos/:id/pulls/by-number/:number` → `PrMeta` (404 `not_found` when absent) |
| G2 | 2–4 | mcp / scaffold, config, API client, pure helpers | — (parallel with G1) | `DevDigestApi` interface + `HttpDevDigestApi`; `ToolFailure`; `resolveRepo/resolvePull/resolveAgent`; `format.ts` helpers; `loadConfig()` |
| G3 | 5–8 | mcp / tools, wait loop, stdio entry, launcher | G1, G2 | `createServer(api, config)` in `mcp/src/server.ts`; tool order; `scripts/mcp.sh`; `.mcp.json` |
| G4 | 9–11 | mcp tests + measurement, CI/routing, docs | G3 | — |

## Skills for implementer
| Path glob (routing.json rule id) | Skills | Why they matter here |
|---|---|---|
| `server/src/modules/pulls/**` (`server-app`, `server-data`, `security-surface`) | onion-architecture, fastify-best-practices, drizzle-orm-patterns, security | route → service → repository; zod params; workspace scoping; query builder only |
| `mcp/src/**/*.ts` (new rule `mcp-src` + widened `security-surface`, added in Step 10) | typescript-expert, zod, security | strict TS, ESM, flat zod schemas with limits and custom messages, untrusted LLM/PR text, loopback-only outbound |
| `scripts/mcp.sh`, `.github/workflows/mcp.yml`, `mcp/package.json` (`security-surface`) | security | no shell interpolation of input, read-only CI, blocked install scripts |

## Steps

### Step 1 — DB-only PR lookup by number (server)
- Files: modify `server/src/modules/pulls/ports.ts` (PullStore, :76), `server/src/modules/pulls/repository.ts`, `server/src/modules/pulls/service.ts`, `server/src/modules/pulls/routes.ts`. Create `server/test/pulls-by-number.it.test.ts`.
- Change: add `findByNumber(repoId, number): Promise<PullRecord | undefined>` to the port and the repository (`eq(repoId) and eq(number)`; unique index `pr_repo_number_uq`, `server/src/db/schema/pulls.ts:31`). Add service `byNumber(workspaceId, repoId, number): Promise<PrMeta>`: `requireRepo` (:134) for workspace scoping, then `NotFoundError('Pull request not found')`, then map through the existing `withRollups([pull])` (:196). Do not write a second mapper. Add route `GET /repos/:id/pulls/by-number/:number` with params `z.object({ id: z.string().uuid(), number: z.coerce.number().int().min(1) })`, response `PrMeta`, and `getContext`.
- Rules / skills: onion-architecture (no Drizzle in the service; route = schema → getContext → one service call), fastify-best-practices, drizzle-orm-patterns, security rules 4, 5, 10.
- Practices: parse at the edge with the zod params schema, never `.parse` in the handler (`server/AGENTS.md` Conventions). Throw `AppError`/`NotFoundError`. No GitHub call.
- Tests: `server/test/pulls-by-number.it.test.ts` (found / unknown number → 404 / repo of another workspace → 404 / non-uuid id → 422).
- Done when: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm arch` pass in `server/`, and `pnpm test:integration -- pulls-by-number` passes.

### Step 2 — Scaffold `mcp/` package (mcp)
- Files: create `mcp/package.json` (`@devdigest/mcp`, private, `"type":"module"`, `engines.node >=22`; scripts `typecheck` = `tsc --noEmit -p tsconfig.json`, `lint` = `eslint .`, `test` = `vitest run`, `start` = `tsx src/index.ts`, `measure:tools` = `tsx scripts/measure-tools.ts`), `mcp/pnpm-workspace.yaml` (`allowBuilds: esbuild: false`, copy of the pattern in `server/pnpm-workspace.yaml`), `mcp/tsconfig.json` (copy `reviewer-core/tsconfig.json`, including `paths` `@devdigest/shared` → `../server/src/vendor/shared/index.ts` and `zod` → `./node_modules/zod`; include `src/**/*.ts`, `scripts/**/*.ts`), `mcp/eslint.config.mjs` (based on `reviewer-core/eslint.config.mjs`), `mcp/vitest.config.ts`, and `mcp/src/log.ts` (stderr-only logger).
- Change: install with `pnpm add` (never hand-edit the lockfile): `@modelcontextprotocol/sdk` (exact newest 1.x; check with `npm view @modelcontextprotocol/sdk version`), `zod@^3.25` (SDK peer; server's `^3.24.1` is not enough), `tsx`. Dev: `typescript`, `vitest@^2`, `eslint@^9`, `typescript-eslint`, `@eslint/js`, `@types/node@^22`.
- Practices: ESLint `no-console: ["error", {allow: ["error","warn"]}]` so stdout stays protocol-only. `@typescript-eslint/no-restricted-imports` on `@devdigest/shared` with `allowTypeImports: true`: types only, because at runtime the server's copy would pull in the server's zod. Put `consistent-type-imports` on.
- Tests: none yet (scaffold).
- Done when: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint` pass in `mcp/` (use `PATH=/opt/homebrew/opt/node@22/bin:$PATH`).

### Step 3 — Config and the REST API adapter (mcp)
- Files: create `mcp/src/config.ts`, `mcp/src/api/port.ts` (`DevDigestApi` interface), `mcp/src/api/schemas.ts` (narrow response schemas), `mcp/src/api/http.ts` (`HttpDevDigestApi`), `mcp/src/api/errors.ts` (`ApiError` kind: `unreachable|not_found|rate_limited|invalid|server`). Tests: `mcp/src/config.test.ts`, `mcp/src/api/http.test.ts`.
- Change: `loadConfig(env)` reads `DEVDIGEST_API_URL` (must parse as http(s) with host `localhost`, `127.0.0.1` or `[::1]`, otherwise fail at startup with a stderr message) and `DEVDIGEST_MCP_MAX_WAIT_S` (int 10–600, default 90). The port has these methods: `listRepos`, `listAgents`, `pullByNumber(repoId, n)` (null on 404), `syncPulls(repoId)` (`GET /repos/:id/pulls`), `refreshPull(prId)` (`GET /pulls/:id`), `activeRuns(prId)`, `startReview(prId, agentId)` (`POST /pulls/:id/review {agentId}`), `listRuns(prId)`, `reviews(prId)`, `conventions(repoId)`. Every request uses `AbortSignal.any([callerSignal, AbortSignal.timeout(20_000)])`, and path segments are `encodeURIComponent` of ids that were already validated as uuids.
- Practices: parse every response with a local zod schema holding only the fields the tools use. Add a compile-time drift check per schema against the server contract type, e.g. `const _c: z.input<typeof ReviewLite> = null as unknown as ReviewRecord` using `import type` from `@devdigest/shared` (`ReviewRecord` review-api.ts:23, `RunSummary` trace.ts:108, `Agent` knowledge.ts:361, `ConventionList` knowledge.ts:258, `Repo`/`PrMeta` platform.ts:176/203). Map errors from the API envelope `{error:{code,message}}` by status and `code`. Never copy response bodies, stacks or the request path into messages (security rule 10). ECONNREFUSED becomes `unreachable`.
- Tests: `config.test.ts` (non-loopback rejected, bounds, defaults); `http.test.ts` with a stubbed `fetch` (200 parse, 404, 422, 429, 500, refused, malformed JSON → `server`, timeout → `unreachable`).
- Done when: the mcp typecheck, lint and test pass.

### Step 4 — Resolvers, errors and response shaping (mcp)
- Files: create `mcp/src/errors.ts` (`ToolFailure(message)`, `toToolError(err)` → `{isError:true, content:[{type:"text", text}]}`), `mcp/src/resolve.ts`, `mcp/src/format.ts`. Tests: `resolve.test.ts`, `format.test.ts`.
- Change: `resolveRepo(api, "owner/name")` matches `full_name` case-insensitively. `resolvePull(api, repo, n, {syncOnMiss})` tries `pullByNumber`; if it misses and `syncOnMiss` is set (run tool only), it calls `syncPulls` and retries once. `resolveAgent(api, idOrName)` checks uuid first, then exact case-insensitive name, and treats more than one match as ambiguous. `format.ts`: `clip(text, n)` (strips C0 control chars except `\n`, adds `…`), `sortFindings`, `toFinding(f, detail)`, and `capResponse(obj, maxChars=24_000)`, which drops trailing findings and sets `truncated` and `next_step`.
- Practices: every `ToolFailure` message names the next tool or action (see the contract table below). The `ApiError` mapping is in one place: `unreachable` → "DevDigest API is not reachable at <origin>. Start it with ./scripts/dev.sh, then retry." and `rate_limited` → "DevDigest rate-limited the request; wait about a minute and retry."
- Done when: the tests cover every error row in the contract table, and mcp checks pass.

### Step 5 — Tool definitions and server factory (mcp)
- Files: create `mcp/src/tools/args.ts` (shared zod fields), `mcp/src/tools/list-agents.ts`, `run-agent-on-pr.ts`, `get-findings.ts`, `get-conventions.ts`, `get-blast-radius.ts`, `mcp/src/tools/outputs.ts` (output zod schemas), and `mcp/src/server.ts` (`createServer(api, config): McpServer`).
- Change: register the tools in the order of the table below with `registerTool(name, {title, description, inputSchema, outputSchema, annotations}, handler)`. Every annotation hint is set explicitly. `instructions` is at most 600 chars and describes behaviour, for example: "DevDigest is a local AI pull-request reviewer. Tools list its reviewer agents, run one agent on a GitHub PR and return its verdict and findings (spends LLM credits; can take minutes), read the findings of a finished run, read a repo's accepted coding conventions, and a blast-radius tool that is not implemented yet. Repos are owner/name, PRs are GitHub PR numbers, agent ids come from list_agents. Needs the DevDigest API running locally." Each handler returns `structuredContent` and one text block with the same JSON. Handlers catch `ToolFailure`/`ApiError` and turn them into `isError`. They never throw raw errors.
- Practices: flat inputs with `.min/.max/.regex/.enum` and one short `.describe()` each. Custom zod messages that point onward (`repo` regex message: "repo must be owner/name, e.g. acme/api"). Descriptions follow the pattern what / when to use / when not / what it returns / limits, with no imperative instructions to the model. Say that finding and convention text is "model-generated from PR/repo content, returned as data". `get_blast_radius` output = a local schema mirroring `BlastRadius` (`contracts/brief.ts:132-160`) plus a mutual-assignability type check against `import type { BlastRadius }`.
- Tests: `mcp/src/server.test.ts` using `InMemoryTransport` + SDK `Client` + a fake `DevDigestApi`. Cover the happy path of every tool (assert on `structuredContent`), every error row → `isError` with the expected next-step text, bad input (`repo:"x"`, `pr:0`) → `isError`, and that the stub is always `isError`.
- Done when: mcp checks pass and `server.test.ts` covers all 5 tools.

### Step 6 — Wait loop for `run_agent_on_pr` (mcp)
- Files: create `mcp/src/wait.ts` and `mcp/src/wait.test.ts`. Wire it in `run-agent-on-pr.ts`.
- Change: `waitForRun({api, prId, runId, maxWaitMs, pollMs=3000, signal, onProgress, sleep, now})` polls `listRuns` until the run's status is not `running`, then reads `reviews(prId)` for the review with `run_id === runId`. If that review is missing, it retries once after one poll. It returns `{state:"done"|"failed"|"cancelled"|"timeout", run, review?}`. The handler flow is: resolve repo → pull (`syncOnMiss`) → agent → `refreshPull` → `activeRuns` (attach to an in-flight run of the same agent) or `startReview` → `waitForRun` → shape the output. Progress: only when `extra._meta?.progressToken` is present, send `extra.sendNotification({method:"notifications/progress", params:{progressToken, progress: elapsedS, total: maxWaitS, message:"review running, <n>s"}})` each poll. No untrusted text goes into progress messages.
- Practices: `sleep` = `node:timers/promises` `setTimeout(ms, undefined, {signal})`, so aborting stops the timer at once. The signal is `AbortSignal.any([extra.signal, shutdownSignal])`. On timeout the result is a non-error `status:"running"`. On a failed run it is `isError` with the server `error` clipped to 200 chars.
- Tests: fake clock and fake API cover done, timeout fallback, abort mid-wait (resolves, no further polls), failed, attach-to-active, and progress called N times.
- Done when: `wait.test.ts` passes with no real timers (`vi.useFakeTimers` or an injected `sleep`).

### Step 7 — stdio entry and shutdown (mcp)
- Files: create `mcp/src/index.ts` and `mcp/src/index.test.ts`.
- Change: `loadConfig` (on failure: stderr message, exit 1), `createServer(new HttpDevDigestApi(config), config)`, `connect(new StdioServerTransport())`. Do not probe the API at startup, so launch stays fast within `MCP_TIMEOUT`. Shutdown on `transport.onclose`, `process.stdin` `end`/`close`, `SIGINT` and `SIGTERM`: abort the process-wide `shutdownSignal`, `await server.close()`, and `process.exit(0)` after at most 1 s. `unhandledRejection`/`uncaughtException` are logged to stderr and then exit 1.
- Tests: `index.test.ts` spawns `node_modules/.bin/tsx src/index.ts` through the SDK `StdioClientTransport` with `DEVDIGEST_API_URL=http://127.0.0.1:9`. It checks: `listTools` returns 5 names in order; `list_agents` → `isError` containing "not reachable" and "./scripts/dev.sh"; `get_blast_radius` → `isError`; after `client.close()` the child exits within 3 s. A stray stdout write would break the client parse and fail the test.
- Done when: `index.test.ts` passes locally and on Linux CI.

### Step 8 — Launcher and project registration (repo root)
- Files: create `scripts/mcp.sh` (executable) and `.mcp.json`.
- Change: `mcp.sh` resolves `ROOT` from the script's own dir and uses the same node≥22 fallback as `scripts/check-changed.sh:43-47`. If `mcp/node_modules` is missing it prints "run: cd mcp && pnpm install" to **stderr** and exits 1. It then runs `exec "$ROOT/mcp/node_modules/.bin/tsx" "$ROOT/mcp/src/index.ts"`. `.mcp.json`: `{"mcpServers":{"devdigest":{"type":"stdio","command":"bash","args":["scripts/mcp.sh"],"env":{"DEVDIGEST_API_URL":"${DEVDIGEST_API_URL:-http://localhost:3001}"}}}}`.
- Practices: nothing in the script writes to stdout. No user input reaches the script. `set -euo pipefail`.
- Done when: `claude mcp list` shows `devdigest` connected, and `/mcp` in Claude Code lists 5 tools. (Piping a bare `tools/list` into the script is not a valid check: SDK 1.x needs `initialize` first.)

### Step 9 — Contract test and token measurement (mcp)
- Files: create `mcp/src/contract.test.ts` (+ committed `__snapshots__`) and `mcp/scripts/measure-tools.ts`.
- Change: the contract test calls `tools/list` in-process and checks: the snapshot of names, order, annotations and schemas; every tool has a `title`, all four hints are booleans, `name` matches `/^[a-z_]{1,64}$/`, and the description is 1–900 chars. Budget: total serialized tools JSON ≤ 10,000 chars (≈2,500 tokens at chars/4), each tool ≤ 2,400 chars, `instructions` ≤ 600 chars. A default `run_agent_on_pr` response with 15 fake findings is ≤ 8,000 chars (≈2K tokens). `measure-tools.ts` prints a per-tool table (chars, ≈tokens) plus instructions.
- Practices: if the budget fails, first trim `.describe()` text, then drop `outputSchema` from `list_agents`/`get_conventions`, and record the choice in Design notes → Token budget.
- Done when: the test passes and `pnpm measure:tools` output is pasted into `docs/devdigest-mcp.md`.

### Step 10 — CI, routing, check-changed (repo root)
- Files: create `.github/workflows/mcp.yml`. Modify `.claude/skills/pr-self-review/assets/routing.json`.
- Change: `mcp.yml` is a copy of the `reviewer-core.yml` shape using pnpm (`pnpm/action-setup@v4` version 10, node 22, `cache-dependency-path: mcp/pnpm-lock.yaml`, `pnpm install --frozen-lockfile`, typecheck, lint, test). Paths: `mcp/**`, `server/src/vendor/shared/**`, `.github/workflows/mcp.yml`. `permissions: contents: read`. routing.json changes: `packages.mcp` = `{dir:"mcp", checks: typecheck/lint/test via pnpm}`; `generated.lockfiles` += `mcp/pnpm-lock.yaml`; new rule `mcp-src` (`mcp/src/**/*.ts`, ignore `**/*.test.ts`, skills `typescript-expert`, `zod`); `security-surface` globs gain `mcp` in both brace lists plus `.mcp.json`. `check-changed.sh` itself needs no edit: it reads `packages.*` (`collect-diff.mjs:88-96`).
- Done when: `./scripts/check-changed.sh --plan` lists the mcp checks, and `node --test '.claude/skills/pr-self-review/assets/tests/*.test.mjs'` passes.

### Step 11 — Docs (repo root, mcp)
- Files: create `mcp/AGENTS.md` (≤100 lines: role, commands, stdout rule, where things live, gotchas), `mcp/CLAUDE.md` (a **symlink** → `AGENTS.md`), `docs/devdigest-mcp.md` (connect: `.mcp.json` / `claude mcp add devdigest -- bash /abs/path/scripts/mcp.sh`, env vars, API must run, Inspector CLI `npx @modelcontextprotocol/inspector --cli bash scripts/mcp.sh --method tools/list` (Node ≥22.19, unverified), `/context` with `ENABLE_TOOL_SEARCH=false` vs default, measured numbers, stub trade-off). Modify root `AGENTS.md` (Packages row `mcp/`, lockfile in "Do not touch"; stays ≤100 lines, now 93), `README.md` (a pointer in L04/quick start), `TESTING.md` (suite map row), `docs/README.md` (index line).
- Done when: the links resolve, `wc -l AGENTS.md mcp/AGENTS.md` ≤ 100 each, and `CLAUDE.md` is a symlink (`ls -l`).

## Tool contract (fixed order in tools/list)
Hints below are listed as readOnly / destructive / idempotent / openWorld.

| # | name · title | annotations | input (flat) | output (`structuredContent`) | error cases → message (isError) | ≈ def tokens |
|---|---|---|---|---|---|---|
| 1 | `list_agents` · "List DevDigest reviewer agents" | T / F / T / F | `include_disabled?` bool (default false) | `{agents:[{id,name,description≤160,enabled,provider,model}], total}` (no `system_prompt`) | API down → start API; none → "No reviewer agents configured; create one on the DevDigest Agents page." (not an error: empty list + `next_step`) | ~250 |
| 2 | `run_agent_on_pr` · "Run a DevDigest review on a PR" | F / F / F / T | `repo` /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/ · `pr` int 1–2147483647 · `agent` string 1–100 trimmed | **RunResult**: `{status: done\|running\|failed\|cancelled, run_id, repo, pr, agent_id, agent_name, verdict: approve\|comment\|request_changes\|null, score\|null, summary≤400\|null, counts:{critical,warning,suggestion}, findings:[{id,severity,file,lines,title,category,scope?}] (≤15), total, truncated, next_step\|null}` | repo unknown → "Repo owner/name is not in DevDigest; add it on the Repos page."; PR unknown after sync → "PR #N not found in owner/name on GitHub."; agent unknown → "Agent 'x' not found; call list_agents for valid ids."; ambiguous → "…matches several agents; pass the id from list_agents."; failed run → "Review run <id> failed: <clipped>. Check the agent's provider key in DevDigest Settings, then call run_agent_on_pr again."; 429; API down. Timeout → **not** an error: `status:"running"`, `next_step:"Still running after 90s; call get_findings with the same repo, pr and agent in about a minute."` | ~450 (incl. output schema) |
| 3 | `get_findings` · "Get DevDigest review findings" | T / F / T / F | `repo`, `pr`, `agent` (as above) · `run_id?` uuid · `limit?` 1–50 (default 15) · `detail?` enum concise\|detailed (default concise) | RunResult (same schema). `detailed` adds `rationale≤300`, `suggestion≤200` per finding; response capped at 24,000 chars | no run → "No review of PR #N by <agent> yet; call run_agent_on_pr with the same repo, pr and agent."; run_id not for this PR/agent → "…omit run_id to get the latest run."; only running → not an error, `status:"running"` + `next_step`; latest done returned, and if a newer run is in progress, `next_step` says so; PR not in DB → "PR #N of owner/name is not in DevDigest yet; open the repo's PR list in DevDigest to sync it." | ~450 |
| 4 | `get_conventions` · "Get repository coding conventions" | T / F / T / F | `repo` · `status?` enum accepted\|pending\|all (default accepted) · `limit?` 1–100 (default 30) | `{repo, last_scan_at\|null, conventions:[{id,category,rule≤300,evidence:"path:line",confidence,status}], total, truncated, next_step\|null}` (from `GET /repos/:id/conventions`, spec 04, `conventions/service.ts:68`) | repo unknown; no scan → empty + `next_step` "No convention scan yet for owner/name; run one on its Conventions page in DevDigest."; no accepted but pending → `next_step` "N pending conventions await triage; call get_conventions with status 'pending'." | ~300 |
| 5 | `get_blast_radius` · "Get PR blast radius (not implemented yet)" | T / F / T / F | `repo`, `pr` | mirrors `BlastRadius`: `{changed_symbols:[{name,file,kind}], downstream:[{symbol, callers:[{name,file,line}], endpoints_affected[], crons_affected[]}], summary}` | always → "get_blast_radius is not implemented in this DevDigest version yet. For the review findings of this PR, call get_findings." (no API call) | ~350 |

## Contracts & migrations
- Shared contracts sync: no. `mcp/` imports `@devdigest/shared` types only, and Step 1 reuses `PrMeta`.
- Schema change + `pnpm db:generate`: no. The `pr_repo_number_uq` index already exists.
- Spec `Status` update: no (there is no spec).

## Verification
| Package | Checks (from routing.json) |
|---|---|
| server | `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm arch` (+ `pnpm test:integration`, needs Postgres) |
| mcp (new) | `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm measure:tools` (manual) |

Plus extra checks: `node --test '.claude/skills/pr-self-review/assets/tests/*.test.mjs'` (routing.json changed). Manual: `claude mcp list`, `/mcp`, `/context` with and without `ENABLE_TOOL_SEARCH=false`, and one real `run_agent_on_pr` against a running stack. Needs Postgres: yes (server integration test and the manual run).
All of the above in one command: `./scripts/check-changed.sh` (after Step 10 it includes mcp).

## Insights to record
- `INSIGHTS.md` (root) · Codebase Patterns — a second process must start reviews through the API, never through its own `Container`: `RunBus`/`JobRunner` are per-process, so UI Live Log/cancel would not see the run and the boot reaper would fail it. (Where: `server/src/platform/container.ts:127`)
- `mcp/INSIGHTS.md` (create, standard headings) · Tool & Library Notes — SDK 1.x returns input-validation failures as `isError` results (not JSON-RPC errors) and skips `outputSchema` validation when `isError` is true. Custom zod messages are therefore the actionable error text. (Where: the `registerTool` call site in `mcp/src/server.ts:<line>`)
- `mcp/INSIGHTS.md` · Recurring Errors & Fixes — `pnpm run`/`pnpm start` prints a banner to stdout and corrupts stdio MCP. Launch with `bash scripts/mcp.sh` (tsx binary directly). (Where: `scripts/mcp.sh:<line>`)
- `server/INSIGHTS.md` · Codebase Patterns — `GET /repos/:id/pulls` syncs from GitHub and upserts on every call. Use `GET /repos/:id/pulls/by-number/:number` for DB-only lookups. (Where: `src/modules/pulls/service.ts:41`)

## Context read
- `AGENTS.md:1-93` — packages, naming (tests next to subject; `.it.test.ts` for DB), copied contracts, do-not-touch list, AGENTS ≤100 lines.
- `server/AGENTS.md` Conventions/Gotchas — routes use zod schemas and no `.parse` in handlers; `AppError`; secrets via `SecretsProvider`; in-memory job queue and RunBus, single API instance assumed.
- `server/INSIGHTS.md:39` — reviewing a never-opened PR reviews an empty diff, so `GET /pulls/:id` goes first.
- `server/INSIGHTS.md:54` — queue state is in memory; `reapStaleRuns` on boot.
- `server/INSIGHTS.md:77` — "latest review" means a batch. `get_findings` sidesteps this by always addressing one agent's run.
- `server/INSIGHTS.md:142` — wiring lives in container getters (why option (b) would drag the whole Container in).
- `server/INSIGHTS.md:316` — `pnpm typecheck` never sees `server/test/**`, so run the new `.it.test.ts`.
- `server/INSIGHTS.md:514` — any test app that runs a review must mock every provider. Not triggered here (the Step 1 test runs no review).
- `INSIGHTS.md:118` (root) — routing.json maps no skill to server tests; route by the file under test.
- `server/src/modules/reviews/routes.ts:31-52` — `POST /pulls/:id/review {agentId}`, rate limit 10/min, fire-and-forget.
- `server/src/modules/reviews/service.ts:54-77,137-175` — `resolveTargets` (explicit agent always runs), run rows created up front, background execution.
- `server/src/modules/reviews/routes.ts:111-124` — `/pulls/:id/runs/active` and `/pulls/:id/runs` (RunSummary with status/error/score).
- `server/src/modules/reviews/routes.ts:153-160` — `/pulls/:id/reviews` → `ReviewRecord[]` with `run_id`, `verdict`, findings.
- `server/src/vendor/shared/contracts/review-api.ts:15-41`, `findings.ts:27,52-71` — Verdict, Finding and FindingRecord shapes.
- `server/src/vendor/shared/contracts/trace.ts:108-129` — RunSummary.
- `server/src/vendor/shared/contracts/brief.ts:132-160` — the existing `BlastRadius` contract, reused for the stub's output.
- `server/src/vendor/shared/contracts/knowledge.ts:235-262,361-383` — ConventionCandidate/List, Agent.
- `server/src/vendor/shared/contracts/platform.ts:176-219` — Repo (`full_name`), PrMeta.
- `server/src/modules/conventions/routes.ts:33-40`, `service.ts:68-77` — the conventions list excludes rejected; `last_scan`.
- `specs/04-conventions-extractor.md:1-3` — L02 conventions, Status done.
- `server/src/modules/pulls/service.ts:38-46,59-66,134,196` — list syncs GitHub; detail refreshes; `withRollups`.
- `server/src/modules/pulls/repository.ts:44-73`, `ports.ts:76-82`, `server/src/db/schema/pulls.ts:31` — lookup pattern and unique index.
- `server/src/platform/container.ts:122-129,194-208` — Container holds db, secrets, RunBus, JobRunner.
- `server/src/platform/config.ts:29-30` — API port 3001 on localhost.
- `server/src/app.ts:96-104,120-167` — global rate limit 120/min, `/health`, error envelope.
- `reviewer-core/tsconfig.json`, `eslint.config.mjs`, `.github/workflows/reviewer-core.yml` — templates for a small package with type-only `@devdigest/shared`.
- `server/pnpm-workspace.yaml` — `allowBuilds` pattern.
- `.claude/skills/pr-self-review/assets/routing.json` — packages, rules, security-surface.
- `collect-diff.mjs:80-96` — package detection from `packages.*.dir`; lockfile-without-package.json guard.
- `scripts/check-changed.sh:43-47` — node≥22 fallback to reuse in `mcp.sh`.
- `.claude/skills/security/SKILL.md` rules 5, 6, 7, 9, 10, 11, 13; `references/devdigest.md` §2 G1 (no-auth localhost API, a known gap).
- The locally cached `@modelcontextprotocol/sdk` 1.30.0 (`~/.npm/_npx/*/node_modules/@modelcontextprotocol/sdk`): `server/mcp.d.ts:150-157` (registerTool config), `server/mcp.js:125-200` (input-validation → isError; `isError` skips output validation; missing `structuredContent` with outputSchema is an error), tools/list maps the registration Map (so insertion order holds), `inMemory.js`, `shared/protocol.d.ts` (`extra.signal`, `sendNotification`, `_meta`).

## Affected modules
| Package | Path | Ring / layer | Change |
|---|---|---|---|
| server | `src/modules/pulls/{ports,repository,service,routes}.ts` | core port / driven adapter / application / driving adapter | add lookup by number |
| server | `test/pulls-by-number.it.test.ts` | test | new |
| mcp (new) | `mcp/src/{config,log,errors,resolve,format,wait,server,index}.ts`, `mcp/src/api/*`, `mcp/src/tools/*` | driving adapter (MCP) + REST client adapter | new package |
| root | `scripts/mcp.sh`, `.mcp.json`, `.github/workflows/mcp.yml`, routing.json, docs | tooling | new / edit |

## Constraints honored
| Rule | Source (`path:line`) | How the plan respects it |
|---|---|---|
| Onion layering, imports inward | `.claude/skills/onion-architecture/SKILL.md` | Step 1 is port → repository → service → thin route; `pnpm arch` runs |
| Zod on route params/response, no `.parse` in handler | `server/AGENTS.md` Conventions | Step 1 params schema + `PrMeta` response |
| Contracts copied, aliases not relative paths | `AGENTS.md` Cross-package rules | mcp uses the `@devdigest/shared` alias, type-only; no contract edits, so no sync |
| DB tests `.it.test.ts` | `AGENTS.md` Naming | Step 1 test; mcp tests are DB-free |
| Lockfiles by the package manager only | `AGENTS.md` Do not touch | `pnpm add` in `mcp/`; routing.json lockfile guard extended |
| Exclude `server/clones/` | `AGENTS.md` | no searches or globs include it |
| CLAUDE.md is a symlink | `AGENTS.md` Do not touch | Step 11 creates a symlink |
| AGENTS.md ≤100 lines | `AGENTS.md` Keeping docs alive | root at 93 lines + ~2 |
| Secrets only via SecretsProvider | security rule 9 | the MCP holds no secrets; the API does the LLM/GitHub calls |
| API stays localhost | security rule 11 | loopback-only `DEVDIGEST_API_URL` |
| LLM output is data | security rule 7 | clipped, structured fields only, never in descriptions, instructions or progress |
| Install scripts blocked | security rule 13 | `mcp/pnpm-workspace.yaml` `allowBuilds: esbuild: false` |
| CI read-only | security rule 12 | `permissions: contents: read`, same actions as existing workflows |

## Design notes
### Location
| Criterion | (a) `mcp/` package → REST | (b) stdio entry in `server/` | (c) HTTP `/mcp` route in Fastify |
|---|---|---|---|
| Uses the real review pipeline (RunBus, UI Live Log, cancel, reaper) | yes | no: a second in-memory bus/queue | yes |
| Needs running | API + Postgres | Postgres | API |
| Least privilege | no secrets, loopback only | reads secrets file, DB pool | same as API |
| Startup latency | tsx + SDK only (small) | the whole server graph (ast-grep napi, Octokit, Drizzle) | n/a |
| Fits "server owns all I/O" | yes, like `client/` | yes | yes |
| In scope | yes | yes | no (stdio-only scope) |

(a) wins on correctness: runs are visible and cancellable in the UI and one process owns the queue. It also wins on least privilege. Its one cost, "the API must be up", becomes an actionable error message.

### Why a local copy of the response schemas
The vendored contracts import `zod` from `server/node_modules` (3.24.x). The SDK needs zod ≥3.25 and must see its own instance, so mcp defines narrow schemas with its own zod. Type-level assignability checks against `@devdigest/shared` catch drift at `pnpm typecheck`. This follows the reviewer-core `paths` trick (`reviewer-core/tsconfig.json`) and the two-zod-copies gotcha (`server/AGENTS.md` Gotchas).

### Long-running `run_agent_on_pr`
The 90 s default stays under Claude Code's reported ~2 min auto-backgrounding. Progress notifications keep the user informed but do not extend client timeouts. On timeout the result points to `get_findings` instead of failing. A client abort is honoured through `extra.signal` in the sleep. The server run keeps going, so its result is not lost and no tokens are wasted. The UI can cancel it (`POST /runs/:id/cancel`).

### Token budget
Claude Code defers tool schemas by default, so startup cost is mostly the names plus `instructions` (≤600 chars ≈150 tokens). The definitions target is ≤2,500 tokens total. `outputSchema` is kept on all five for now, because it gives validated `structuredContent` and fixes the stub's contract. If Step 9 measures over budget, drop it from `list_agents`/`get_conventions` first. **Measured outcome (Step 9):** 10,487 chars in total, `run_agent_on_pr` 2,679 and `get_findings` 2,952 against the 2,400 per-tool cap. Trimming descriptions was not enough (the `RunResult` output schema alone is 1,455 chars). **Decision, confirmed by the user 2026-09-29:** `outputSchema` is advertised only on `run_agent_on_pr` and `get_findings` (the two tools that return findings, sharing `RunResultOut`); `list_agents` and `get_conventions` return typed `structuredContent` (domain types checked for exact equality against the zod schemas) without advertising it; `get_blast_radius` is a stub that always answers `isError` and advertises none (its `BlastRadiusOut` shape and drift check stay in `tools/outputs.ts`). The `agent` argument's `.describe()` no longer names `list_agents`, and the `run_agent_on_pr` description was shortened. Final: 7,537 chars for the five tools; `run_agent_on_pr` 2,391 and `get_findings` 2,666 (its description shortened to 203 chars). `get_findings` cannot fit the 2,400 cap even with a minimal description, so tools that advertise an output schema get their own cap of 2,800 chars in `contract.test.ts`; the 2,400 cap stays for the others. See `docs/devdigest-mcp.md`. Default response sizes: `run_agent_on_pr` 15 concise findings ≈1–2K tokens; a hard cap of 24,000 chars ≈6K tokens stays under the 10K warning.

### Stub trade-off
The research inference was that omitting or disabling an unfinished tool is better: it costs definition tokens and invites a call that always fails. The user chose to register it (L04 homework completes it). It is labelled "not implemented yet" in both title and description, annotated read-only and idempotent, touches no I/O, and its error sends the caller on to `get_findings`. **Confirmed by the user 2026-09-29:** the stub advertises no `outputSchema` (it never returns structured content, and the schema cost ~940 chars of the startup budget); the shape stays pinned by `BlastRadiusOut` and its drift check, and the homework adds `outputSchema: BlastRadiusOut.shape` when it is implemented.

## Risks & open questions
- The SDK version specifics are verified only for 1.30.0 in the local npx cache. The v2 `@modelcontextprotocol/server` package, the 2026-07-28 stateless protocol and "one factory, two eras" are **unverified**. Default: pin the newest 1.x (open question 2).
- `StdioServerTransport` may not call `onclose` on stdin EOF (unverified). Step 7 listens on `process.stdin` `end`/`close` explicitly.
- `.mcp.json` details are unverified: the `${VAR:-default}` env expansion and cwd = project root for the relative `scripts/mcp.sh`. Fallback: `claude mcp add devdigest -- bash /abs/path/scripts/mcp.sh`. Claude Code may also start with the shell's node v16 on PATH; `mcp.sh` handles that only on machines with `/opt/homebrew/opt/node@22`.
- The Claude Code runtime default is unverified: the tool-search deferral, the `ENABLE_TOOL_SEARCH` env name, the ~2 KB `instructions` cap, `MCP_TIMEOUT`/`MCP_TOOL_TIMEOUT` defaults, and whether auto-backgrounding sends a cancellation.
- Ordering of `completeAgentRun` vs `insertReview` in `server/src/modules/reviews/run-executor.ts` was not read. `waitForRun` retries the review lookup once. If the run is marked done before the review row exists for longer than one poll, `get_findings` will still find it later.
- Inspector CLI flags and the Node ≥22.19 requirement are unverified. That step is manual, not CI.
- Polling adds about 20 req/min per waiting call against the global 120/min limit (`server/src/app.ts:96`). Two parallel waits plus the UI stay within the limit.
- `GET /pulls/:id` (refresh) and `GET /repos/:id/pulls` (sync) need a GitHub token to be useful. Without one they serve persisted data (`pulls/service.ts:66-71`), and a PR that was never imported yields "PR not found".

## Handed off
- Architecture reviewer: the new `mcp/` package boundary (type-only `@devdigest/shared`, own zod); whether the `DevDigestApi` port and handler split is the right seam; the Step 1 service reusing `withRollups` for a single PR; routing.json additions.
- Security reviewer: loopback enforcement in `mcp/src/config.ts`; clipping and control-char stripping of LLM/PR-derived text in `format.ts` and in error messages (the run `error` field); no body, stack or path leakage in `api/errors.ts`; `scripts/mcp.sh` (exec path, no stdout, no input); `.mcp.json` env; spend control on `run_agent_on_pr` (permission prompt: do not allow-list it; attach-to-active dedupe; API rate limit 10/min); the Step 1 route's workspace scoping; `mcp.yml` permissions; `allowBuilds` for new deps.
