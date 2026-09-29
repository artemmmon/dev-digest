# mcp — `@devdigest/mcp`

Local stdio MCP server (`devdigest`) that Claude Code launches. Five tools: `list_agents`,
`run_agent_on_pr` (the only write tool), `get_findings`, `get_conventions`,
`get_blast_radius` (registered stub, always `isError`). It drives the **running DevDigest
API over REST** (`DEVDIGEST_API_URL`, loopback only) and holds no secrets. Root rules: `../AGENTS.md`.
Guide: `../docs/devdigest-mcp.md`.

## Commands
Uses **pnpm**. Node ≥ 22 (`PATH=/opt/homebrew/opt/node@22/bin:$PATH` if the shell has v16).
```sh
pnpm install --frozen-lockfile
pnpm typecheck        # tsc --noEmit — this IS the build; there is no emit step
pnpm lint             # eslint: stdout rule, type-only @devdigest/shared, ring imports
pnpm test             # vitest; fake API, no DB, no network (index.test.ts spawns the real entry)
pnpm measure:tools    # chars / ~tokens of the tool definitions (paste into the guide)
bash ../scripts/mcp.sh  # launch (what .mcp.json runs) — never `pnpm start`, see Gotchas
```

## Where things live (rings point inward)
- core: `src/domain.ts` (result types), `src/api/port.ts` (`DevDigestApi`), `src/api/schemas.ts`,
  `src/api/errors.ts` (`ApiError`; no imports)
- application: `src/service.ts` (`DevDigestService`: run orchestration, run selection, shaping),
  `resolve.ts` (repo/PR/agent lookup), `wait.ts` (poll loop), `format.ts` (`clip`, caps), `errors.ts` (`NextStepError`),
  `config.ts` and `log.ts` (leaf helpers; `log.ts` is an allowed dependency of `service.ts`)
- driven adapter: `src/api/http.ts` (`HttpDevDigestApi`), imported only by `index.ts`
- driving adapter: `src/tools/*` (thin: zod input → one service call → `structuredContent`/`isError`),
  `tools/context.ts` (`guard`: the only place errors become `isError`), `src/server.ts` (`createServer`)
- composition root: `src/index.ts` (stdio transport, shutdown), config in `src/config.ts`
- tests sit next to their subject; `src/test-support/fake-api.ts` is the shared fake

## Rules
- **stdout is the protocol.** Nothing may print to it (`no-console` allows only `error`/`warn`;
  `src/log.ts` writes to stderr). Launch with `scripts/mcp.sh`, not `pnpm run`.
- Imports point inward; `pnpm lint` fails on a ring violation (`eslint.config.mjs`, `RINGS`).
- `@devdigest/shared` is imported as **types only** (its runtime zod is the server's copy).
  Response shapes are local narrow schemas with compile-time drift checks.
- Every user-facing failure names the next step; tool descriptions never name other tools
  (that lives in `next_step` and error text). The contract test enforces it.
- LLM/PR text is data: `clip()` everything derived from it; never put it in descriptions or progress.
- Token budget is tested (`contract.test.ts`); a schema or description change updates the snapshot on purpose.

## Gotchas
- SDK 1.x returns input-validation failures as `isError` results and skips `outputSchema`
  validation on `isError`. Custom zod messages are the actionable text.
- `StdioServerTransport` does not call `onclose` on stdin EOF; `index.ts` listens to stdin itself.
- Only `run_agent_on_pr` and `get_findings` advertise an `outputSchema` (budget; the stub advertises none).
- The API must be running (`../scripts/dev.sh`); an unreachable API is an `isError` telling you so.

## Documentation
- `../docs/devdigest-mcp.md` — connect, env vars, measured budget, stub trade-off
- `../docs/plans/05-devdigest-mcp.md` — the development plan and its amendments
- `INSIGHTS.md` — gotchas; append via the `engineering-insights` skill
