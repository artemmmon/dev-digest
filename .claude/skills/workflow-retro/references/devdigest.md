# Workflow retro in DevDigest

## Where the data is

| What | Path |
|---|---|
| A session's transcript | `~/.claude/projects/<cwd with every non-alphanumeric as ->/<session-id>.jsonl` |
| Its subagents | `<session-id>/subagents/agent-<id>.jsonl` + `agent-<id>.meta.json` (`agentType`, `description`, `toolUseId`, `spawnDepth`) |
| Usage | every `assistant` line: `message.usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `cache_creation.ephemeral_1h_input_tokens`), `message.model`, `requestId`, `timestamp` |

Each git worktree is its own project folder (its own `cwd`). To measure a run made in another
worktree, pass `--cwd <that worktree>`.

## Which sessions are one run

| The run was | Scope |
|---|---|
| `/sdd` in two sessions (planning, then execution) | `--plan docs/plans/NN-name.md` — finds every session of the project whose transcript mentions the plan |
| One session, only this work | no flag (the newest session), or `--session <id>` |
| One session that also holds other work (Q&A, a demo, this retro itself) | add `--since` / `--until` around the pipeline |
| `/pr-self-review` only | `--session <id> --since <start of the review>` |

Run the retro in the same session right after the pipeline, or in a new one with `--session`.
The retro's own calls are in the newest session: when you measure it, close the window with
`--until`.

## Outputs

| File | Written by | Holds |
|---|---|---|
| `docs/retros/ledger.md` | `retro.mjs --write` | One row per run: date, label, sessions, agents (max depth), requests, tool calls, tokens, cache-read share, output, ≈ $, wall time, agent time, peak parallel, top action |
| `docs/retros/<date>-<label>.md` | `retro.mjs --write`, then you | The full tables, the signals, and the `## Actions` block you fill in |

The first row of the ledger is a baseline: the HW4 Blast Radius session, built with the flow as
it was before the 2026-10-04 audit. It covers the whole 11-hour session (planning, build, review,
demo), so compare later rows with it by role, not only by the total.

## Roles to look at first in this repo

- `implementer` — runs and requests per group; more runs than groups means fix rounds.
- `main` — context first → peak, and `cold-cache`: the planning session should hand over to a
  fresh execution session.
- `pr-skill-reviewer` — many short parallel runs; the `preload` signal for `severity.md` and
  `reviewer-contract.md` comes from here.
- `implementation-planner` / `brainstorm` — one run each; a large first context is the skills
  they load by design.

## Open questions

1. **The transcript format is internal.** Fields were read off real transcripts on 2026-10-04
   (Claude Code, this machine). After an update, run the tests and one real session; exit code 2
   or a jump in "estimated output" means the format moved.
2. **Workflow-tool runs.** Agents started by a Workflow script were not checked: whether their
   transcripts also land in `subagents/` is unverified.
3. **Depth 2+ was tested on a synthetic fixture only.** The real sessions on this machine have
   `spawnDepth: 1` everywhere (most agents deny the Agent tool; `spec-creator` may start
   researchers). Confirm the parent column on the first run that nests.
