# Agent workflow cost

Where the tokens of a planner → implementer → reviewers run go, measured on one real feature,
and the rules in [.claude/agents/README.md](../.claude/agents/README.md#keeping-token-cost-down)
that follow from it.

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

## Not adopted

- **Merging `implementation-verifier` and `architecture-reviewer`.** They ran in parallel for $4.5
  together; merging would save under $0.5 and lose two independent checks.
- **Sharing cache between agents.** A prompt cache matches an exact prefix, and every agent type
  has its own system prompt, so agents cannot share one. Share through small files instead.
