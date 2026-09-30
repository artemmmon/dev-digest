# Insights — mcp

Non-obvious findings about the local MCP server. Cross-package ones go to `../INSIGHTS.md`,
API-side ones to `../server/INSIGHTS.md`.
Written via the `engineering-insights` skill: append-only, one entry per finding.

---

## What Works

## What Doesn't Work

## Codebase Patterns

### 2026-09-29 — Import rings are enforced with the base `no-restricted-imports`, not the typescript-eslint one
`@devdigest/shared` is restricted (type-only) with `@typescript-eslint/no-restricted-imports`. In flat
config a later block replaces the options of the *same rule name*, so ring blocks that reused that name
would silently drop the type-only rule. The rings use the base `no-restricted-imports` instead: two rule
names, both apply. To check a ring, append a forbidden import to a file and run `pnpm exec eslint <file>`.
Where: `eslint.config.mjs:31` (`rings`), `eslint.config.mjs:8` (ring table).

### 2026-09-29 — Only `run_agent_on_pr` and `get_blast_radius` advertise an `outputSchema`
The `RunResult` output schema is 1,455 chars of JSON schema; carrying it on `get_findings` too pushed
that tool to 2,952 chars against a 2,400 budget. The other tools still return typed `structuredContent`
(`domain.ts` types, compile-time-checked against the zod schemas in `tools/outputs.ts`), they just do not
advertise or validate it. If you add a tool or grow a description, run `pnpm measure:tools` first; the
`run_agent_on_pr` definition has about 10 chars of headroom.
Where: `src/tools/run-agent-on-pr.ts:38`, `src/contract.test.ts:20` (`BUDGET`).

### 2026-09-29 — Supersedes "Only `run_agent_on_pr` and `get_blast_radius` advertise an `outputSchema`"
Confirmed by the user: `RunResultOut` is advertised on `run_agent_on_pr` and `get_findings` (the two tools that
return findings); `list_agents` and `get_conventions` stay typed-but-unadvertised; the `get_blast_radius` stub
advertises nothing (it never returns structured content; when implemented, add `outputSchema: BlastRadiusOut.shape`).
`get_findings` is 2,666 chars with the schema, which does not fit the 2,400 per-tool cap even with a minimal
description, so `contract.test.ts` has `perToolWithOutput: 2_800` for tools that advertise one.
Where: `src/tools/get-findings.ts:29`, `src/contract.test.ts:20` (`BUDGET`).

### 2026-09-29 — Drift checks use exact type equality, not two-way assignability
`[A] extends [B]` both ways passes when only optional properties differ (`{ a?: string }` vs `{ b?: string }`
assign both ways), so renaming `suggestion?` on one side went unnoticed. `outputs.ts` uses
`(<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)`. Verified by renaming `suggestion?` in
`domain.ts` and `rationale` in `outputs.ts`: `pnpm typecheck` fails in both cases.
Where: `src/tools/outputs.ts:126` (`Equal`).

### 2026-09-30 — Supersedes "Only `run_agent_on_pr` and `get_blast_radius` advertise an `outputSchema`"
Also supersedes the 2026-09-29 entry that limited it to two tools. `get_blast_radius` is implemented and now advertises `BlastRadiusResultOut.shape` (1,524 chars of output schema), so three
tools advertise one; `list_agents` and `get_conventions` still do not. `BlastRadiusResultOut` = `BlastRadiusOut.extend({...})`
with the envelope fields (`repo`, `pr`, `counts`, `degraded`, `reason`, `truncated`, `next_step`); both schemas are
exact-`Equal` drift-checked (against `BlastRadius` and `BlastRadiusResult`). Measured with `pnpm measure:tools`:
`get_blast_radius` 2,367 chars (cap 2,800), all tools 9,161 of 10,000, instructions 460. Only about 840 chars of total
headroom are left, so the next schema or description growth must trim something first.
Where: `src/tools/get-blast-radius.ts:20`, `src/contract.test.ts:20` (`BUDGET`), `src/tools/outputs.ts:105`.

## Tool & Library Notes

### 2026-09-29 — SDK 1.x input-validation failures are `isError` results, and `isError` skips `outputSchema` validation
Verified on @modelcontextprotocol/sdk 1.31.0 (newest 1.x when written; the plan researched 1.30.0).
A bad `repo` or `pr` comes back as a normal tool result with `isError: true` and the zod message as text,
not a JSON-RPC error, so the custom zod messages are the actionable error text. A tool that declares
an `outputSchema` may still return `isError` without `structuredContent`.
Where: `src/server.test.ts:159` (bad input), `src/server.test.ts:141` (failed run on a tool with an outputSchema).

### 2026-09-29 — `StdioServerTransport` never calls `onclose` when stdin reaches EOF
Its `start()` registers only `data` and `error` listeners on stdin (`dist/esm/server/stdio.js`). A client
that exits during a long `run_agent_on_pr` wait would leave the process polling until the wait ends, so
`index.ts` listens to stdin `end`/`close` itself and aborts the shutdown signal that the wait uses.
`index.test.ts` proves the child exits after `client.close()`.
Where: `src/index.ts:46`, `src/index.test.ts`.

### 2026-09-29 — `.mcp.json` `${VAR:-default}` expansion works; `claude mcp get` prints it unexpanded
Checked with `claude -p ... --mcp-config <file> --strict-mcp-config` and a probe script: the env var was
`http://localhost:3001` when unset and the exported value when set. A project-scope `.mcp.json` server
stays "Pending approval" (`claude mcp list`) until approved interactively, and `claude mcp get` shows the
raw `${DEVDIGEST_API_URL}` text, so neither command proves expansion. Relative `args` resolve against the
directory Claude Code was started in (verified for `--mcp-config`; for project scope assumed the same), so
use an absolute path with `claude mcp add` when starting from a subdirectory.
Where: `.mcp.json:8`.

### 2026-09-29 — The Inspector CLI works against the launcher
`npx @modelcontextprotocol/inspector --cli bash scripts/mcp.sh --method tools/list` lists the five tools on
Node 22.23 (the API need not be running for `tools/list`). It prints a deprecation warning for a transitive
package; that is noise.
Where: `../docs/devdigest-mcp.md` (Try it without Claude).

## Recurring Errors & Fixes

### 2026-09-29 — `pnpm start` / `pnpm run` corrupt the stdio protocol
pnpm prints a banner (`> @devdigest/mcp@0.0.0 start ...`) to stdout, which the client tries to parse as
JSON-RPC. Launch through `scripts/mcp.sh`, which `exec`s the `tsx` binary directly and writes only to stderr.
Where: `../scripts/mcp.sh:27`.

## Open Questions

### 2026-09-29 — Unverified: Claude Code tool-search deferral and `/context` numbers
`ENABLE_TOOL_SEARCH`, the default deferral of tool schemas, the `instructions` size cap and the
auto-backgrounding of long tool calls were not measured. Compare `/context` with and without
`ENABLE_TOOL_SEARCH=false` against `pnpm measure:tools` before quoting token costs to users.
Where: `../docs/devdigest-mcp.md` (Token budget).

## Session Notes

### 2026-09-29 — Onion-architecture amendments applied to the first draft
The first draft kept run orchestration and run selection inside the tool handlers and imported result
types from `tools/outputs.ts`. Amended: `service.ts` owns the use cases, `domain.ts` the types,
`NextStepError` replaces `ToolFailure`, and ESLint enforces the rings.
Where: `src/service.ts:83`, `src/domain.ts:1`, `eslint.config.mjs:8`.
