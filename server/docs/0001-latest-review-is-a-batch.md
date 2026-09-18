# 0001 — "The PR's latest review" is a batch, not a row

Status: accepted · 2026-09-16 · Lesson L01

## Context

The Pull Requests list carries three per-PR summaries: `COST`, `SCORE` and the
per-severity `FINDINGS` breakdown. All three have to answer the same question —
*what does the current review of this PR say?* — from rows that were never shaped
for it.

One click on **Run Review** starts every enabled agent. That is N rows in
`agent_runs` sharing one `batch_id` (`src/db/schema/runs.ts:24`) and N rows in
`reviews`, one per agent. There is no "the review" of a PR; there is a round.

The obvious query — `reviews ORDER BY created_at DESC LIMIT 1` — therefore returns
whichever agent happened to finish last. On PR #1 that was a clean Performance
pass (0 findings, score 100) sitting beside a General run with 1 CRITICAL, 2
WARNING, 1 SUGGESTION and score 38. The list showed `—` and `100` while the Agent
runs tab showed five findings and a rejecting verdict. Not a rendering bug: the
list was faithfully reporting an arbitrary member of the round.

## Decision

**Everything the PR list summarises describes the PR's latest review round**,
identified by the `batch_id` of its newest run.

- `COST` — sum of the non-null `cost_usd` of that batch's runs.
- `SCORE` — the worst score in the round, not the newest.
- `FINDINGS` — the severity tally across every review in the round.

The rule is implemented once per concern, in pure modules that unit-test without a
database, and called from the list route:

| Concern | Function | File |
|---|---|---|
| which batch is current | `latestBatchByPr` | `src/modules/pulls/cost.ts:37` |
| cost of that batch | `latestBatchCostByPr` | `src/modules/pulls/cost.ts:19` |
| that round's review ids | `latestRoundReviewIds` | `src/modules/pulls/findings.ts:39` |
| severity tally | `severityByPr` | `src/modules/pulls/findings.ts:70` |
| worst score | `roundScoreByPr` | `src/modules/pulls/findings.ts:94` |

The route (`src/modules/pulls/routes.ts:116`) computes them on read — three
`IN`-queries plus JS grouping — and `GET /pulls/:id/reviews` now serves
`ReviewRecord.batch_id` so the client can group the same way instead of
re-deriving the rule from timestamps.

## Alternatives rejected

**Newest `reviews` row.** The status quo above. An arbitrary agent decides what the
whole list says, and the quieter the agent, the more likely it wins the race.

**Everything the PR has ever spent / found.** Summing `cost_usd` over all of a PR's
runs answers a different question — *what has this PR cost me in total* — and it
grows on every re-run, so the column stops describing the current state of the
code. It also cannot be extended to the other two columns: an old CRITICAL that a
later round no longer reports would keep counting, and scores from different rounds
have no meaningful sum. Keeping one rule for all three columns is worth more than
matching the looser reading. (Total-spend-per-PR is a real question — it belongs
in the agent performance dashboard, not in a column next to SCORE.)

**Denormalised columns on `pull_requests`, written at run end.** Cheaper reads, but
it needs a migration, a backfill for existing rows, and a write path that silently
drifts whenever a review is deleted. The list is small and paginated; a read-time
rollup cannot drift.

## Consequences

- A batch whose runs are still going, or whose runs all failed, has no priced run:
  the rollup yields `null` and the UI renders `—`, never `$0.00`.
- Seeded PRs have a review but no `agent_runs` row, so they have no batch. FINDINGS
  and SCORE fall back to the newest review; COST stays `—`. This is why the e2e
  flows can assert the FINDINGS column but not a cost figure.
- Re-running a review replaces what the list shows. That is the point: the list
  describes the current round, and history stays on the PR's Agent runs tab.
- The extra read is `findings WHERE review_id IN (…)`, and `findings.review_id` has
  no index (`src/db/schema/reviews.ts:28`). Fine at seed scale; see the open
  question in `../INSIGHTS.md`.
