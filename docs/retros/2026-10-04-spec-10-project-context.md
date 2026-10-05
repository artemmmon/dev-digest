# Workflow retro: spec-10-project-context

Run: 2026-10-04T18:54:59.683Z → 2026-10-04T19:42:29.534Z · mode: deep · sessions: 315f8657

## Totals

| Tokens | Cache read | Cache write | Input | Output | Requests | Tool calls | ≈ $ | Wall time | Agent time | Agents (max depth) | API errors |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 18.4M | 17.1M (93%) | 1.1M | 481 | 143K | 172 | 182 | — | 47m | 41m | 7 (2) | 0 |

Main session(s): 5.2M · subagents: 13.2M (72% of the run; a parent's own usage does not show them).
Output of 97 of 172 requests is estimated from the length of the response (text ÷ 4): the transcript kept only their stream-start count. Input and cache numbers are exact.
No price for: claude-haiku-4-5-20251001 — the dollar total is left out (`assets/prices.json`).

## Parallelism

Peak: 5 agents at once at 2026-10-04T18:56:35.914Z (spec-creator:e78a, researcher:82b2, researcher:d68c, researcher:7a48, researcher:480d) · mean while any agent ran: 1.4 · agent time 41m inside 30m of wall time.

## By role

| Role | Runs | Requests | Tool calls | Tokens | Share | Cache read | Output | Peak context | Time | ≈ $ |
|---|---|---|---|---|---|---|---|---|---|---|
| spec-creator | 2 | 38 | 37 | 7.0M | 38% | 6.3M | 74K | 259K | 29m | $5.55 |
| researcher | 4 | 79 | 99 | 5.8M | 32% | 5.4M | 35K | 137K | 11m | $2.40 |
| main | 1 | 45 | 37 | 5.2M | 28% | 5.0M | 33K | 160K | 47m | $2.70 |
| claude-code-guide | 1 | 10 | 9 | 338K | 2% | 299K | 1.6K | 38K | 1m | — |

## By agent

| Agent | Parent | Depth | Model | Requests | Tool calls (top) | Tokens | With children | Cache read | Context first → peak | Time | ≈ $ | Task |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| spec-creator:e78a | main:315f8657 | 1 | opus-5-5 | 37 | 36 (Read 19, SubagentHandback 7, Agent 4) | 6.9M | 12.8M (+4) | 6.3M | 45K → 259K | 29m | $5.33 | Spec discovery: Project Context |
| main:315f8657 | — | 0 | opus-5-5 | 45 | 37 (Bash 21, Skill 3, Agent 3) | 5.2M | 18.4M (+7) | 5.0M | 58K → 160K | 47m | $2.70 | main session |
| researcher:d68c | spec-creator:e78a | 2 | sonnet-5-5 | 37 | 41 (Bash 38, Read 2, SubagentHandback 1) | 3.3M | — | 3.1M | 22K → 137K | 4m | $1.07 | Server run + prompt assembly |
| researcher:82b2 | spec-creator:e78a | 2 | sonnet-5-5 | 17 | 25 (Bash 24, SubagentHandback 1) | 1.1M | — | 977K | 22K → 90K | 3m | $0.51 | Specs and insights overlap |
| researcher:7a48 | spec-creator:e78a | 2 | sonnet-5-5 | 13 | 20 (Bash 19, SubagentHandback 1) | 968K | — | 858K | 22K → 102K | 2m | $0.51 | Client editors and trace drawer |
| researcher:480d | spec-creator:e78a | 2 | sonnet-5-5 | 12 | 13 (Bash 12, SubagentHandback 1) | 520K | — | 452K | 22K → 61K | 2m | $0.31 | Design sources: project context wiring |
| claude-code-guide:0703 | main:315f8657 | 1 | haiku-4-5-20251001 | 10 | 9 (WebFetch 7, Read 1, SubagentHandback 1) | 338K | — | 299K | 29K → 38K | 1m | — | MCP tools in subagent tools field |
| spec-creator:2c38 | main:315f8657 | 1 | opus-5-5 | 1 | 1 (SubagentHandback 1) | 43K | — | 0 | 43K → 43K | 0s | $0.22 | Smoke test spec-creator handback |

## Signals

- **cold-cache** — `spec-creator:e78a` rewrote its context 1 time(s) after the cache expired (224K tokens written again). → Do not leave a subagent waiting: its cache lives 5 minutes.
- **duplicate-context** — `specs/README.md` was read by 3 agents (main, spec-creator, researcher). → Remove the duplicate: let one agent read it and hand on the lines that matter (plan step, handoff), or narrow the reads to the needed lines.
- **duplicate-context** — `server/AGENTS.md` was read by 3 agents (researcher, spec-creator). → Remove the duplicate: let one agent read it and hand on the lines that matter (plan step, handoff), or narrow the reads to the needed lines.
- **duplicate-context** — `client/messages/en/runs.json` was read by 3 agents (researcher). → Remove the duplicate: let one agent read it and hand on the lines that matter (plan step, handoff), or narrow the reads to the needed lines.
- **duplicate-context** — `client/docs/design/src/data_context.jsx` was read by 3 agents (researcher, spec-creator). → Remove the duplicate: let one agent read it and hand on the lines that matter (plan step, handoff), or narrow the reads to the needed lines.
- **duplicate-context** — `client/docs/design/src/context_docs.jsx` was read by 3 agents (researcher, spec-creator). → Remove the duplicate: let one agent read it and hand on the lines that matter (plan step, handoff), or narrow the reads to the needed lines.
- **duplicate-context** — `.claude/hooks/spec-creator-guard.mjs` was read more than once by the same agent: main:315f8657 ×4. → Read a file once; use an offset or `sed -n` for a second look.
- **duplicate-context** — `.claude/hooks/spec-creator-guard.test.mjs` was read more than once by the same agent: main:315f8657 ×2. → Read a file once; use an offset or `sed -n` for a second look.
- **duplicate-context** — `.claude/agents/README.md` was read more than once by the same agent: main:315f8657 ×3. → Read a file once; use an offset or `sed -n` for a second look.
- **duplicate-context** — `.claude/agents/spec-creator.md` was read more than once by the same agent: main:315f8657 ×2. → Read a file once; use an offset or `sed -n` for a second look.
- **duplicate-context** — `specs/10-project-context.md` was read more than once by the same agent: main:315f8657 ×2. → Read a file once; use an offset or `sed -n` for a second look.
- **concurrency** — 5 agents ran at once (spec-creator:e78a, researcher:82b2, researcher:d68c, researcher:7a48, researcher:480d); 0 API error(s) in the run. → No errors at this concurrency: keep it. Reduce it only if rate limits or retries appear.

## Actions

1. **`.claude/hooks/spec-creator-guard.mjs` + `.claude/agents/spec-creator.md` — done in this session.**
   The default-deny guard (matcher `*`) blocked `SubagentHandback` 7 times. `spec-creator:e78a` spent
   18 extra requests at a 167K–223K context re-sending its discovery report: about 3.6M tokens, 52%
   of that agent and 20% of the run. The agent now has a `tools:` allowlist and the guard runs only
   for `Write|Edit|Agent|Task|mcp__.*`. Expected: a spec-only run near 14M tokens. Not yet confirmed
   in a fresh session.
2. **`.claude/agents/spec-creator.md:52` ("One question per researcher") — narrow it to one module
   or package per researcher.** `researcher:d68c` ("Server run + prompt assembly") covered the run
   executor, prompt assembly, trace contract, storage and clone handling in one prompt: 37 requests,
   context 22K → 137K, 3.3M tokens, 57% of all researcher tokens. The other three took 12–17
   requests and 0.5M–1.1M each. Split by package, keeping the limit of 4 per pass.
3. **`.claude/agents/spec-creator.md` (researcher prompts) — name the files already read.**
   `client/docs/design/src/context_docs.jsx` and `data_context.jsx` were read by the spec-creator
   and again by two researchers; `server/AGENTS.md` and `specs/README.md` by three agents. Add to
   the prompt rule: "list the paths you have read; the researcher does not open them again".
4. **`.claude/skills/workflow-retro/assets/prices.json` — add a `haiku` entry.** `claude-code-guide`
   ran on `claude-haiku-4-5-20251001` (338K tokens), no key matched, and the script left out the
   dollar total for the whole run. The priced roles add up to $10.52.
5. **No change: `cold-cache` on `spec-creator:e78a` (224K tokens written again).** The agent waited
   about 10 minutes for the user's answers to 13 questions, past the 5-minute cache. A fresh agent
   for pass 2 would re-read the same sources, so the resume is still the cheaper path. The 5 agents
   at once had 0 API errors: keep the concurrency.

Limits of this data: output of 97 of 170 requests is estimated (characters ÷ 4); dollars are list
prices and incomplete (action 4); the run is a spec-only stage (`/sdd --only spec`) plus a hook fix
and this retro's own start, so it is not comparable in size with a full pipeline run.
