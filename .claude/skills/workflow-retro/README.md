# workflow-retro

A measured retrospective of an agent-pipeline run: a script reads the session and subagent
transcripts, reports tokens, cache read, tool calls, duration and parallelism per agent and per
role, flags duplicated context, preload candidates, overloaded roles and concurrency, and appends
one row to `docs/retros/ledger.md`. Claude turns the signals into concrete actions.

- **Version:** 1.0.0 (also in `SKILL.md` frontmatter → `metadata.version`)
- **Sources verified:** 2026-10-04 (see "Notes on verification")
- **Related skills:** `feature-flow` and `sdd` (the pipeline this measures), `pr-self-review`,
  `engineering-insights`

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-04 | First version: `retro.mjs` (deep by default, `--shallow`, `--plan`, `--session`, `--since`/`--until`, `--json`, `--write`), five signals, the ledger, `prices.json`, 12 script tests, 3 evals. Tried on the HW4 session (53 subagents): that run is the ledger's baseline row |

Bump the version on every change: **patch** for wording/links, **minor** for a new metric,
signal or flag, **major** when a ledger column changes meaning (old rows stop being comparable).
Add a changelog row each time.

## File map

| File | Answers |
|---|---|
| [SKILL.md](SKILL.md) | The one rule, 5 principles, the six-step workflow, the signal → action table, the check |
| [references/reading.md](references/reading.md) | How to read each table, from a number to an action, what the numbers do not show |
| [references/devdigest.md](references/devdigest.md) | Where transcripts live, which sessions make one run, the two output files, roles to look at first, open questions |
| [assets/retro.mjs](assets/retro.mjs) | The measurement: parsing, per-agent metrics, nesting, parallelism, signals, Markdown/JSON, `--write` |
| [assets/prices.json](assets/prices.json) | List prices per model family for the ≈ $ column |
| [assets/tests/retro.test.mjs](assets/tests/retro.test.mjs) | `node --test` suite on a synthetic transcript tree; runs in the `pr-self-review` workflow |
| [evals/evals.json](evals/evals.json) | 3 evaluation scenarios with expected behaviour |

## Sources

| # | Source | Rule it grounds |
|---|---|---|
| S1 | The lab assignment (the user's course text, quoted in the session of 2026-10-04) | What the skill must collect — tokens, cache read, tool calls, duration, parallelism, nested subagents; a deep mode that reads the logs from disk because a parent's usage may not include its children; actions of four kinds; a short result appended to `docs/retros/ledger.md` |
| S2 | `docs/agent-workflow-cost.md` | Cost is context length × calls; cache reads dominate; each API response counted once; list prices |
| S3 | Real transcripts on this machine (HW4 session `23b989a6`, 53 subagents), read 2026-10-04 | File layout, `meta.json` fields, one response = several lines sharing a `requestId`, final `output_tokens` only on the line with a `stop_reason` |
| S4 | `.claude/agents/README.md` → "Keeping token cost down" | The actions an agent file can take: fresh agent per group, paths not content, preload vs on-demand skills |

## Conflicts and decisions

| Topic | Positions | Skill's rule |
|---|---|---|
| Default mode | The assignment names deep as a mode; shallow is faster | Deep by default (the user's choice): shallow hides exactly the children's cost. `--shallow` exists for a quick look |
| Who writes the ledger | The script vs Claude by hand | The script (`--write`), so every row has the same columns; Claude supplies `--action` |
| Concurrency | "Reduce concurrency" as a standing action vs only on evidence | Flag 4+ parallel agents, recommend reducing only when the run has API errors; parallel agents cost the same tokens |
| Output tokens | Report the recorded value vs estimate | Estimate from response length when a request has no final count, and print how many were estimated |

## Notes on verification

- The transcript format is internal to Claude Code and undocumented; it was read off real files,
  not from documentation. The script exits 2 when it finds no usage.
- The HW4 numbers were checked against that session only: 53 `meta.json` files = 53 agents in
  the report; main-session requests match its unique `requestId` count.
- Depth above 1 and the `concurrency`-with-errors path are covered by the synthetic tests only.
- Prices come from `docs/agent-workflow-cost.md`; they were not re-checked against a price list.

## Evaluation log

| Date | Version | Result |
|---|---|---|
| 2026-10-04 | 1.0.0 | Evals not run. Script: 12 tests pass; one real session measured (92.6M tokens, 96% cache read, 53 agents, peak 14 parallel) |
