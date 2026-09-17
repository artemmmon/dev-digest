# Run Cost Badge
Status: done
Lesson: L01

## Goal
Show what every agent review run cost, so the user can see the price of a review
next to its result without leaving the studio. The data is already on hand: every
LLM provider returns `costUsd` (OpenRouter via `usage: { include: true }`, others via
`PriceBook` estimates) and `reviewPullRequest` sums it per run. It was dropped before
persistence (commit `d45ab0d` removed `agent_runs.cost_usd`). No extra model calls.

## Scope
**In**
- PR list: a **COST** column — cost of the PR's latest review batch (`$0.014`).
- PR detail → Agent runs → timeline card: `9,119 tok · $0.0013` under the run time
  (done runs only).
- Run Trace drawer → Stats: a **COST** tile between TOKENS and FINDINGS.

**Out**
- Cost in the verdict banner / `ReviewRunAccordion`.
- Backfilling cost for runs persisted before this feature (they show "—").
- Capturing tokens/cost spent by runs that failed mid-flight (tokens are 0 today).
- CI runs (`source = 'ci'`) in the PR list aggregate.

## Design
Packages: `server`, `client` (reviewer-core already returns `costUsd`; unchanged).

### Data (server)
- `agent_runs.cost_usd double precision` — nullable; `null` = no data.
  `double precision` matches the existing `ci_runs.cost_usd` / `eval_runs.cost_usd`;
  values are display-only estimates, not billing.
- `agent_runs.batch_id uuid` — nullable; one id per `ReviewService.runReview` call
  (one click on Run Review / Review all). `null` for older runs and CI runs.
- `run-executor` persists `outcome.costUsd` on success and in `trace.stats.cost_usd`;
  failure paths write `null`.

### Contracts (`server/src/vendor/shared` canonical, mirrored in `client/src/vendor/shared`)
- `RunStats.cost_usd: number | null | undefined` (nullish — old `run_traces` jsonb
  documents have no such key).
- `RunSummary.cost_usd: number | null` — `GET /pulls/:id/runs`.
- `PrMeta.cost_usd: number | null | undefined` — `GET /repos/:id/pulls` only.

### PR list aggregate
The latest batch of a PR = the `batch_id` of its newest run (by `ran_at`) that has a
`batch_id`. The PR cost = sum of non-null `cost_usd` within that batch; `null` when
no run in that batch has a cost (still running, or all failed). Computed on read with
one IN-query + JS grouping (`server/src/modules/pulls/cost.ts`), like the list's score.

### UI (client)
- `formatCost` (`client/src/lib/format-cost.ts`), adaptive precision:
  `null` → `—`, `0` → `$0.00`, `< 0.0001` → `<$0.0001`, `< 0.01` → 4 decimals,
  `< 1` → 3 decimals, otherwise 2 decimals.
- `RunCostBadge` (`client/src/components/run-cost-badge/`), two variants:
  - `compact` — cost only (PR list cell);
  - `detailed` — `<tokens> tok · <cost>` (timeline card).
- Trace drawer uses the existing `Stat` tile with `formatCost`.

## Acceptance
- A new completed run stores `cost_usd` and its trace has `stats.cost_usd`.
- All runs created by one review request share one `batch_id`.
- PR list COST shows the latest batch sum; an earlier batch is not included.
  The column describes the PR's current review **round**, not everything the PR has
  ever spent — same rule as SCORE and FINDINGS, so the three columns always describe
  the same run set. Reasoning and rejected alternatives:
  `server/docs/0001-latest-review-is-a-batch.md`.
- Timeline done cards show `N tok · $X`; failed/running cards show no cost line.
- Trace drawer shows a COST tile.
- A run or PR without cost data shows `—`, never `$0.00`.
- No additional LLM calls are made.

## Open questions
- Should failed runs report tokens/cost spent before the failure? Needs the engine to
  surface partial usage on error. Carried over as a draft spec:
  `reviewer-core/specs/01-usage-on-failed-runs.md`.
