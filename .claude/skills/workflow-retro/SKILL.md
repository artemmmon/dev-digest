---
name: workflow-retro
description: Retrospective of an agent-pipeline run (a /sdd feature, a /pr-self-review, any session that started subagents) measured from the Claude Code transcripts on disk — tokens, cache read, cache writes, tool calls, duration and parallelism per agent and per role, nested subagents included — turned into three to five concrete actions (remove duplicated context, preload a shared file, split an overloaded role, reduce concurrency) and one row in docs/retros/ledger.md so the trend between runs is visible. Run by the user as /workflow-retro after the pipeline has finished; Claude does not start it on its own. Deep mode (the default) reads every subagent transcript, because a parent agent's usage does not include its children. Not for reviewing code (pr-self-review), for recording a single finding (engineering-insights) or for estimating a run that has not happened.
argument-hint: "[--plan docs/plans/NN-name.md | --session <id> ...] [--since <ISO>] [--until <ISO>] [--label <name>] [--shallow]"
disable-model-invocation: true
metadata:
  version: "1.0.0"
---

# Workflow retro

Measure one finished run, name what to change, and keep a row for the trend. The numbers come
from a script; your part is to read them and write the actions. Rules and sources:
[README.md](README.md).

Arguments: `$ARGUMENTS`

## The one rule

**Numbers from the transcripts, actions from the numbers.** Never estimate a token count from
memory or from a subagent's completion notice: that figure is close to the agent's final context,
not what it spent. Every action names a file or an agent, what to change and the number that
justifies it.

## Principles

1. **Deep by default.** A subagent's tokens are in its own transcript
   (`<session>/subagents/agent-<id>.jsonl`), not in its parent's usage. `--shallow` reads the main
   session only and says how many transcripts it skipped. *Why:* on the measured HW4 run the
   subagents were 26% of the tokens and all of the parallelism; shallow shows neither.
2. **Cost is context length × calls.** Look at requests and the context's growth (first → peak)
   before the model or the output size. *Why:* cache reads are about 96% of a run's tokens
   (`docs/agent-workflow-cost.md`).
3. **One run, one row.** The same columns every time, appended by the script. *Why:* a trend
   needs comparable rows; a hand-written summary drifts.
4. **An action is a change to a file.** "Reduce context" is not an action; "implementer: drop the
   `routing.json` read (7 of 8 runs read it, ~5 KB each)" is.
5. **Say what the data cannot show.** Output tokens are partly estimated, dollars are list
   prices, the format is undocumented. Put those limits in the report, not only here.

## Workflow (copy and tick off)

`A` = `.claude/skills/workflow-retro/assets`. Use Node ≥ 22.

```
- [ ] 1. Scope     which sessions are the run: --plan <path> (all sessions that mention it), or
                   --session <id> per session, or nothing = the newest session of this project.
                   A session that also holds other work: narrow it with --since / --until
- [ ] 2. Measure   node A/retro.mjs <scope> --label <feature-or-plan-name>
- [ ] 3. Read      totals → by role → by agent → signals (references/reading.md)
- [ ] 4. Actions   3–5, most tokens first, each: file or agent · the change · the number behind it
- [ ] 5. Record    node A/retro.mjs <scope> --label <same> --write --action "<the top action, one line>"
                   then replace the `## Actions` block of the written report with your actions
- [ ] 6. Report    to the user, in their language: the totals line, the actions, the ledger row,
                   and how this run compares with the previous row
```

1. **Scope.** `/sdd` runs planning and execution in two sessions; `--plan` finds both. Say which
   sessions and which window you measured. Exit code 2 means nothing was found or the transcript
   format was not recognised: report that, do not guess numbers.
2. **Measure.** The script prints Markdown: totals, parallelism, a table by role, a table by
   agent (parent, depth, requests, top tools, tokens with children, context first → peak) and
   the signals. `--json` gives the same as data.
3. **Read.** How each table answers "where did it go", and what each signal means:
   [references/reading.md](references/reading.md).
4. **Actions.** The four kinds below. Check each against the agent's file before you write it:
   an action that the agent file already contains is not an action, it is a sign the rule is not
   followed — say that instead.
5. **Record.** `--write` creates `docs/retros/<date>-<label>.md` and appends one row to
   `docs/retros/ledger.md` (a second `--write` with the same sessions and label replaces the row).
6. **Report.** Compare with the last ledger row of the same kind of run: tokens, cache-read
   share, requests, peak parallel. One sentence on the trend.

## Signals and the action each one leads to

| Signal | What the script saw | Action |
|---|---|---|
| `duplicate-context` | The same project file read by 3+ agents, or twice by one agent | Remove the duplicate: one agent reads it and hands on the lines that matter (plan step, handoff), or the read is narrowed to the needed lines |
| `preload` | Most agents of one role open the same file among their first calls | Load it up front: a `skills:` entry in the agent file, or the needed lines in the plan or prompt, instead of N separate reads |
| `overloaded-role` | 80+ requests and a context past 200K tokens | Split the role: smaller step groups, a narrower task, a fresh agent; for the main session, a new session from a handoff note |
| `concurrency` | 4+ agents at once | Reduce it only when the run also has API errors or retries; otherwise keep it and say so |
| `cold-cache` | A context rewritten after the cache expired | Do not resume after a long break; do not leave a subagent waiting |

Thresholds are `LIMITS` at the top of `retro.mjs`.

## Check

```sh
node .claude/skills/workflow-retro/assets/retro.mjs --shallow          # quick look at this session
node --test '.claude/skills/workflow-retro/assets/tests/*.test.mjs'
```

## Read next

| Question | File |
|---|---|
| How do I read the tables, and what do the numbers not show? | [references/reading.md](references/reading.md) |
| Where are the transcripts, which sessions belong to a run, what does the ledger hold? | [references/devdigest.md](references/devdigest.md) |
| Why these metrics; what was verified | [README.md](README.md) |

## Out of scope

- Changing the agents: this skill proposes actions; applying them is a separate, reviewed change.
- Code review or the push gate — `pr-self-review`. A single engineering finding — `engineering-insights`.
- Billing: the dollar column is a list-price estimate from `assets/prices.json`.
