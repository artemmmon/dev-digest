# devdigest-mcp — DevDigest as an MCP server

A local, stdio-only [MCP](https://modelcontextprotocol.io) server that lets Claude Code
(or any MCP client) run DevDigest reviewers on a GitHub PR and read the results. It lives
in `mcp/` and talks to the **running DevDigest API** over REST, the way `client/` does, so
a review started from Claude shows up in the UI Live Log and can be cancelled there.
It holds no secrets: the API keeps the GitHub token and the LLM keys.

Plan: [plans/05-devdigest-mcp.md](plans/05-devdigest-mcp.md). Package rules: `mcp/AGENTS.md`.

## Connect

The DevDigest API must be up first (`./scripts/dev.sh`); the MCP does not start it.
Install the package once: `cd mcp && pnpm install`.

**Project scope (committed).** `.mcp.json` at the repo root registers `devdigest`; open
Claude Code in the repo root and approve the server when asked (`claude mcp list` shows
it as pending until you do).

```json
{ "mcpServers": { "devdigest": { "type": "stdio", "command": "bash", "args": ["scripts/mcp.sh"],
  "env": { "DEVDIGEST_API_URL": "${DEVDIGEST_API_URL:-http://localhost:3001}" } } } }
```

The relative `scripts/mcp.sh` resolves against the directory Claude Code was started in.
Started from a subdirectory, register it with an absolute path instead:

```sh
claude mcp add devdigest -- bash /abs/path/to/repo/scripts/mcp.sh
```

`scripts/mcp.sh` execs the `tsx` binary directly. Never point a client at `pnpm start`:
pnpm prints a banner to stdout, and stdout is the protocol channel.

| Variable | Default | Meaning |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | API origin. Must be `localhost`, `127.0.0.1` or `[::1]` (the API has no auth); anything else fails at startup |
| `DEVDIGEST_MCP_MAX_WAIT_S` | `90` | Longest `run_agent_on_pr` waits before answering `running` (integer 10–600). The tool description shows the configured value |

## Tools

| Tool | Kind | Returns |
|---|---|---|
| `list_agents` | read | agents (`id`, `name`, `description`, `provider`, `model`, `enabled`); `include_disabled?` |
| `run_agent_on_pr` | **write, spends LLM credits** | `repo` (`owner/name`), `pr` (GitHub number), `agent` (id or exact name) → verdict, score, counts, top 15 findings |
| `get_findings` | read | the stored result of one agent's run: latest by default, `run_id?`, `limit?` (≤50), `detail?` (`concise`/`detailed`) |
| `get_conventions` | read | accepted (default), `pending` or `all` conventions with `path:line` evidence |
| `get_blast_radius` | read | `repo`, `pr` → the PR's changed symbols, their downstream callers, endpoints and crons, plus `counts`, `degraded`/`reason`, `truncated` and `next_step` (precomputed from the repo index; no LLM, no GitHub call) |

Behaviour worth knowing:
- `run_agent_on_pr` refreshes the PR first (a never-opened PR would be reviewed as an empty
  diff), reuses a run of the same agent that is already in flight, polls every 3 s, and
  after the configured maximum answers a **non-error** `status: "running"` with a `next_step`.
  A client cancel stops the polling; the server-side run keeps going and stays readable.
- Every result carries `next_step` (or the error text says what to do): start the API,
  add the repo, call another tool. Tool descriptions never name other tools, so the wiring
  lives only in those messages.
- Finding and convention text is model-generated from PR/repo content. It is stripped of control
  characters, length-limited and returned in named fields as data.
- `get_blast_radius` is DB-only on the API side (`GET /pulls/:id/blast`). A PR DevDigest has no changed
  files for yet (never opened in the UI) is an error that says to open the PR in DevDigest first; it does
  not call GitHub.
- Read tools look a PR up in the DB (`GET /repos/:id/pulls/by-number/:number`); only
  `run_agent_on_pr` may sync the repo's PR list from GitHub.
- Do not put `run_agent_on_pr` on an allow-list: each call can spend credits.

## Token budget (measured)

`cd mcp && pnpm measure:tools` (chars are the serialized `tools/list` entry, tokens are chars / 4):

```
tool                 chars   ~tokens      desc     input    output
list_agents            736       184       288       209         0
run_agent_on_pr       2391       598       243       433      1455
get_findings          2666       667       203       753      1455
get_conventions       1001       251       290       465         0
get_blast_radius      2367       592       264       330      1524
tools total           9161      2292
instructions           460       115
startup total         9621      2406
```

`mcp/src/contract.test.ts` enforces: all tools ≤ 10,000 chars, each tool ≤ 2,400 chars (≤ 2,800 for a
tool that advertises an output schema), `instructions` ≤ 600 chars, a description of 1–900 chars, and a
default `run_agent_on_pr` response with 15 findings ≤ 8,000 chars (measured ≈ 4,900 with 120-char titles).
It also pins the names, order, annotations and schemas in a snapshot, asserts that exactly `run_agent_on_pr`,
`get_findings` and `get_blast_radius` advertise an output schema, and that no description contains another tool's name.

Decision (confirmed by the user 2026-09-29): the first build advertised the `RunResult` schema on all five
tools and measured 10,487 chars in total, with `run_agent_on_pr` at 2,679 and `get_findings` at 2,952.
The `RunResult` output schema alone is 1,455 chars, so it is advertised only where the findings are: on
`run_agent_on_pr` and `get_findings` (the two tools whose result a client most needs to validate).
`list_agents` and `get_conventions` still return `structuredContent` typed at compile time
(`mcp/src/domain.ts`, checked for exact equality against the zod schemas in `tools/outputs.ts`, optional
fields included) but do not advertise it. Trimming descriptions was not enough for `get_findings` (2,666 chars even after shortening
its description), so tools with an output schema have their own cap of 2,800 chars; the 2,400 cap is unchanged
for the rest. `run_agent_on_pr` (2,391) still fits the tighter 2,400. To fit the budget the `agent` argument's
`.describe()` no longer names `list_agents` (that pointer lives in errors and `next_step`) and the
`run_agent_on_pr` description was shortened.

`/context` in Claude Code, with and without `ENABLE_TOOL_SEARCH=false`, has not been
measured (the deferral default and the variable name are unverified); compare it against the numbers above.

## Blast radius

`get_blast_radius` (`repo`, `pr`) reads `GET /pulls/:id/blast`, the same route the PR Overview tab uses. The
API answers from the repo index (`repo-intel`) without an LLM and without parsing the clone. It advertises
`BlastRadiusResultOut` (1,524 chars of output schema, measured above): the server's `BlastRadius` map
(`changed_symbols`, `downstream`, `summary`; `downstream` only lists symbols that have callers, ranked) plus
`repo`, `pr`, `counts` (`symbols`, `callers`, `endpoints`, `crons`), `degraded`, `reason`, `truncated` and
`next_step`. `BlastRadiusOut` (the map) and `BlastRadiusResultOut` are both drift-checked in
`mcp/src/tools/outputs.ts`, and the API response schema against the server contract in `mcp/src/api/schemas.ts`.

- **Degraded index.** `degraded: true` comes with a `reason`: `flag_off` (repo intelligence disabled on the
  server), `no_data` (never indexed), `index_failed`, `index_partial` (map shown, callers may be missing) or
  `repo_too_large`. Every reason has a `next_step`; for a missing or failed index the map is empty.
- **Cap.** The API lists at most 20 callers per symbol and sets `truncated`. The tool also keeps the
  serialized result under 24,000 characters by dropping the lowest-ranked `downstream` entries, then, if that
  is not enough, the tail of `changed_symbols`, and setting `truncated` (counts still describe the whole map).
- **Repo text is data.** Symbol, file, endpoint and cron names come from the repo, so they are stripped of
  control characters, clipped (name 120, file 200, kind 40, endpoint/cron 160, summary 300) and never appear
  in descriptions. Caller lines are at the indexed default branch, not the PR head.
- **No changed files yet.** Open the PR in DevDigest once so its files are stored, then call the tool again.

The tool used to be a registered stub (always `isError`, no output schema, ~190 tokens) so that the contract
existed before the implementation; it now costs 2,367 chars, and `get_blast_radius` is the third tool with an
output schema.

## Try it without Claude

```sh
npx @modelcontextprotocol/inspector --cli bash scripts/mcp.sh --method tools/list
```

Verified with Node 22.23 (the Inspector needs a recent Node 22). `tools/list` needs no API;
tool calls do.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Tool says the API "is not reachable at …" | Start it: `./scripts/dev.sh`. Check `DEVDIGEST_API_URL` |
| Server fails to start, stderr mentions `DEVDIGEST_API_URL` | The URL is not loopback or not http(s); see the table above |
| `claude mcp list` shows `Pending approval` | Start `claude` in the repo and approve the project server |
| `dependencies are missing` on stderr | `cd mcp && pnpm install` |
| Client sees a protocol/parse error at start | Something wrote to stdout; launch with `scripts/mcp.sh`, not `pnpm start` |
| `Repo … is not in DevDigest` | Add the repo on the Repos page first |
| Rate-limit message | The API allows 10 review starts per minute; wait and retry |
