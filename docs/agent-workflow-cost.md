# Agent workflow cost

Where the tokens of a planner → implementer → reviewers run go, measured on one real feature,
and the rules in [.claude/agents/README.md](../.claude/agents/README.md#keeping-token-cost-down)
that follow from it.

To measure a run yourself, use the `/workflow-retro` skill (`.claude/skills/workflow-retro/`): it
reads the same transcripts with a script and keeps the trend in [retros/ledger.md](retros/ledger.md).

## The measured run

Feature: Intent Layer (`specs/08-intent-layer.md`, plan `docs/plans/02-intent-layer.md`), built on
2026-09-24 in one main session with seven subagents. The numbers come from the Claude Code session
transcripts, each API response counted once. Dollars are API list prices, not a bill: Opus 5.5
$4 in / $20 out / $0.20 cache read, Sonnet 5 $2 / $10. Sonnet's cache-read price of $0.20 is an
assumption (10% of input). DevDigest's own OpenRouter calls are not included.

Total: **168.6M tokens, about $54**. Cache reads were 98% of the tokens; new work was 0.59M output
tokens and 2.6M cache-write tokens.

| Stage | Tokens | ≈ $ |
|---|---|---|
| Planning (researcher, planner, main) | 7.8M | 6.95 |
| Implementation (2 implementers, main) | 114.8M | 27.55 |
| Verification + fixes (verifier, architecture-reviewer, fix implementer, main) | 18.9M | 8.56 |
| Manual test in the app (main, browser) | 14.5M | 5.39 |
| Q&A and demo PRs (main, another repo's session) | 12.6M | 5.85 |

## What drove the cost

1. **Context length × number of calls.** Each call re-reads the whole context from cache. The
   server implementer ran 290 calls with the context growing from 22K to 535K tokens (average
   350K): 101.7M tokens, 60% of the run. Near the end each one-line `Edit` to a test fake cost
   ~450K tokens of reading. Replaying its transcript split into three step groups, each starting
   fresh at ~70K, gives 45M tokens instead of 101.5M, about $11 less.
2. **The main session carried the whole day.** At 19:14 it resumed with a 255K context. Replaying
   19:14–21:20 from a new session with a 25K handoff cuts its input cost from $8.77 to $2.92.
3. **Cache expiry after breaks.** The main session writes cache with a 1-hour TTL at 2× the input
   price. It rewrote its full context three times after breaks (216K, 274K and 312K tokens, ~$6.4).
   Subagents use a 5-minute TTL; the verifier and the planner each lost theirs once while the
   laptop slept.
4. **Artifacts larger than their readers needed.** The plan was 54 KB (~14K tokens), and its Steps
   section only 21% of that. Four agents read all of it. The planner returned the full plan to the
   main session twice (62K and 54K characters), so it stayed in the main context for the next 171
   calls.
5. **The model matters less than expected.** Cache reads cost the same on Opus 5.5 and (assumed)
   Sonnet 5, and they are about 60% of the cost. A cheaper model saves only on output and cache
   writes. Moving `implementation-verifier` from opus to sonnet saves roughly $1.5 per feature.

What was already fine: prompts to agents were 1–2K characters and carried paths, not diffs. The two
reviewers read the diff package by package; their overlap was ~11K tokens. Check output was
small; the check runs cost through the number of calls, not their output.

## Estimated effect of the rules

| Rule | Saving on this run |
|---|---|
| One implementer per step group | ~$11 |
| Fresh main session after a break or for manual testing | ~$6 |
| Implementer brief above a marker; no full plan resent to the main session | ~$2 |
| Verifier on sonnet, `check-changed.sh`, narrower diffs | ~$2–3 |
| Full request before planning; fixes in one fix-mode implementer | ~$1.5 |

Together about $54 → $29–32 and roughly half the tokens, with the same checks: planner and
architecture-reviewer stay on opus, every group still runs its "Done when" and the package checks,
the verifier still grades every plan item, and the manual test in the app stays. It found three
bugs the tests had missed. The savings overlap, so they are not simply added up.

## How to measure a run

Report the **accumulated** tokens from the transcripts, the same number the status line shows. The
`subagent_tokens` figure in a subagent's completion notice is not that: it is close to the agent's
final context size, so it understates an agent by 10–60× and leaves out the main session.

1. Find the session transcript: `~/.claude/projects/<cwd with / → ->/<session-id>.jsonl`. The
   session id is the scratchpad folder name, not necessarily the id the host app shows. Its
   subagents are `<session-id>/subagents/agent-*.jsonl`, each with a `.meta.json` whose `agentType`
   names the agent.
2. Count every API response once, keyed by `requestId` (fallback `message.id`). A streamed response
   is written several times with growing `usage`, so keep the **maximum** of each field per key, not
   the first or the sum.
3. Add `input_tokens`, `output_tokens`, `cache_read_input_tokens` and `cache_creation_input_tokens`
   per transcript; group the subagents by `agentType`; report the main session as its own row.
4. Price per model from `message.model`, with the list prices above. Cache writes cost 2× input in
   the main session (1-hour TTL) and 1.25× input in subagents (5-minute TTL). Say that the result is
   list price, not a bill.

Output tokens can still come out low for subagents whose transcript stops before the final usage
record. Treat output as a lower bound and say so.

### HW4 Blast Radius (2026-09-30), measured this way

Plan `docs/plans/06-blast-radius.md`. One main session (Opus 5.5) and 51 subagents. Total
**82.0M tokens, about $35** at list price; cache reads were 96%.

| Row | Runs | Tokens | ≈ $ |
|---|---|---|---|
| Main session (coordination, live checks, filming) | 1 (180 calls) | 58.0M | 23.51 |
| implementer (3 step groups + 5 fix runs) | 8 | 9.8M | 3.29 |
| planner | 1 | 4.2M | 1.69 |
| pr-skill-reviewer (3 `/pr-self-review` rounds) | 36 | 3.6M | 3.44 |
| brainstorm | 1 | 2.3M | 0.96 |
| doc-writer | 1 | 1.4M | 0.56 |
| implementation-verifier | 1 | 1.2M | 0.50 |
| architecture-reviewer | 1 | 0.7M | 0.48 |
| security-reviewer | 1 | 0.6M | 0.40 |
| frame-checker (demo video) | 1 | 0.2M | 0.15 |

What drove it: the main session was 71% of the tokens. It held the whole day, including a filming
phase with screenshots, and every call re-read that context. Two of the three `/pr-self-review`
rounds reviewed the whole 72-file PR because the branch had not been pushed yet; the third, after the
push, reviewed only the 20 unpushed files. Three UI defects (caller-row overflow, clipped graph,
"1 symbols") were found only in the browser and each cost a fix run plus a review round.

## Not adopted

- **Merging `implementation-verifier` and `architecture-reviewer`.** They ran in parallel for $4.5
  together; merging would save under $0.5 and lose two independent checks.
- **Sharing cache between agents.** A prompt cache matches an exact prefix, and every agent type
  has its own system prompt, so agents cannot share one. Share through small files instead.
