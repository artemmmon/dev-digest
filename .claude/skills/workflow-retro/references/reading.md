# Reading the retro

## The tables, in order

1. **Totals.** Tokens = input + output + cache read + cache write, every API response counted
   once. The cache-read share is normally 90%+: it is the context being re-read on every call.
   "Main session(s) · subagents" is the split a shallow run cannot see.
2. **Parallelism.** Peak = the most subagents running at the same moment, with their names. Agent
   time vs wall time: 52 minutes of agent time inside 38 minutes means real overlap; equal values
   mean the agents ran one after another.
3. **By role.** Where the run went by kind of agent. Compare `Runs` with what the flow should
   have started: 8 implementers for a 3-group plan means 5 fix rounds.
4. **By agent.** One row per transcript.
   - `Parent` / `Depth` — who started it; depth 2+ is a subagent of a subagent.
   - `With children` — the agent plus everything it started. The main session's value is the run.
   - `Context first → peak` — what it started with and how far it grew. A high first value is
     startup reading (agent file, preloaded skills, the first files); a high peak with many
     requests is the expensive shape.
   - `Tool calls (top)` — mostly Bash means reading through `cat`/`sed`; many Reads of the same
     paths across rows is duplicated context.
5. **Signals.** What the script flagged, heaviest first.

## From a number to an action

| You see | Ask | Typical action |
|---|---|---|
| One role holds most of the tokens | Is it requests or context? | Many requests → split the work; large first context → trim what it reads at the start |
| The main session is the largest row | Did reports, plans or diffs land in its context? Was it resumed after a break? | Agents write files and return summaries; new session from a handoff note |
| Many runs of `implementer` in fix mode | Why did the first pass miss it? | Fix the plan step or the agent rule that let it through, not the fix loop |
| The same file in several `duplicate-context` lines | Who needs it whole, who needs a few lines? | One reader; the others get the lines in the plan or handoff |
| `preload` for a role | Is the file small and always needed? | `skills:` preload or inline in the agent file; large or sometimes needed → leave it |
| Peak parallel is high, errors are 0 | — | Keep it. Parallel agents cost the same tokens and less time |
| Peak parallel is high, errors > 0 | Did the errors fall inside the overlap? | Fewer agents per message |

## What the numbers do not show

- **Output is partly estimated.** A response is stored as several lines; only the line with a
  `stop_reason` has the final `output_tokens`, the others repeat the stream-start count. When a
  request has no such line the script estimates output as the response's characters ÷ 4 and
  reports how many requests that was. Input, cache read and cache write are exact.
- **Dollars are list prices** from `assets/prices.json`, not a bill; a model with no price there
  drops the dollar total.
- **Reads through other commands** (`rg`, `grep`, `git diff`) are not counted as file reads; only
  the Read tool and `cat` / `sed -n` / `head` / `tail` with a path are.
- **A session is not a feature.** A session that also held Q&A, a demo or another task inflates
  the row: narrow it with `--since` / `--until` and say so in the report.
- **Quality is not measured.** A cheaper run that needed three more fix rounds is not better;
  read the role table for rounds before calling a trend good.
