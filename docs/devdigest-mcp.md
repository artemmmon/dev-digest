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
| `get_blast_radius` | read, **stub** | always an error today; no output schema until it is implemented |

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
get_blast_radius       743       186       158       330         0
tools total           7537      1886
instructions           439       110
startup total         7976      1994
```

`mcp/src/contract.test.ts` enforces: all tools ≤ 10,000 chars, each tool ≤ 2,400 chars (≤ 2,800 for a
tool that advertises an output schema), `instructions` ≤ 600 chars, a description of 1–900 chars, and a
default `run_agent_on_pr` response with 15 findings ≤ 8,000 chars (measured ≈ 4,900 with 120-char titles).
It also pins the names, order, annotations and schemas in a snapshot, asserts that exactly `run_agent_on_pr`
and `get_findings` advertise an output schema, and that no description contains another tool's name.

Decision (confirmed by the user 2026-09-29): the first build advertised the `RunResult` schema on all five
tools and measured 10,487 chars in total, with `run_agent_on_pr` at 2,679 and `get_findings` at 2,952.
The `RunResult` output schema alone is 1,455 chars, so it is advertised only where the findings are: on
`run_agent_on_pr` and `get_findings` (the two tools whose result a client most needs to validate).
`list_agents` and `get_conventions` still return `structuredContent` typed at compile time
(`mcp/src/domain.ts`, checked for exact equality against the zod schemas in `tools/outputs.ts`, optional
fields included) but do not advertise it. `get_blast_radius` is a stub that always answers `isError`, so it
advertises nothing; its result shape stays pinned by `BlastRadiusOut` and a drift check against the server's
`BlastRadius`. Trimming descriptions was not enough for `get_findings` (2,666 chars even after shortening
its description), so tools with an output schema have their own cap of 2,800 chars; the 2,400 cap is unchanged
for the rest. `run_agent_on_pr` (2,391) still fits the tighter 2,400. To fit the budget the `agent` argument's
`.describe()` no longer names `list_agents` (that pointer lives in errors and `next_step`) and the
`run_agent_on_pr` description was shortened.

`/context` in Claude Code, with and without `ENABLE_TOOL_SEARCH=false`, has not been
measured (the deferral default and the variable name are unverified); compare it against the numbers above.

## The stub

`get_blast_radius` is registered so clients and tests see its final input contract, but
it does no I/O and always answers "not implemented" (title and description say so too). It
advertises no `outputSchema` (it can never return structured content yet); the result shape is pinned
by `BlastRadiusOut` and its drift check in `mcp/src/tools/outputs.ts`, and the homework adds
`outputSchema: BlastRadiusOut.shape` when it is implemented. Leaving an unfinished tool out would save
~190 tokens and avoid a call that always fails; it was registered on purpose so the L04 homework has a
fixed contract to fill in from `repo-intel`.

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
