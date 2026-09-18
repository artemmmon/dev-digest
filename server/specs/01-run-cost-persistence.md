# Run cost persistence and the PR-list rollups
Status: done
Lesson: L01

The server slice of the two cross-package L01 specs (`../../specs/01-run-cost-badge.md`,
`../../specs/02-findings-severity.md`). Those describe the feature end to end; this one
describes what the API owns: storing what a run cost, and summarising a review round
for the list.

## Goal

Every review run already knows its own price — the engine returns `costUsd` on each
outcome — but the server dropped it before it reached the database, so the UI had
nothing to show. Persist it, and serve per-PR summaries the list can render without
a second round-trip and without any model call.

## Scope

**In**
- `agent_runs.cost_usd` and `agent_runs.batch_id`, written by the run executor.
- `cost_usd` in the run trace's `stats` blob and on `RunSummary`.
- `PrMeta.cost_usd`, `PrMeta.score`, `PrMeta.findings_by_severity` on the list endpoint.
- `ReviewRecord.batch_id` on `GET /pulls/:id/reviews`, so the client can group by round.

**Out**
- Backfilling cost onto runs that predate the column (they stay `null` → `—`).
- Cost for failed or cancelled runs (see `../../reviewer-core/specs/01-usage-on-failed-runs.md`).
- Server-side filtering or pagination of findings by severity — the client filters
  what it already has.
- An index on `findings(review_id)`.

## Design

### Data

`src/db/schema/runs.ts:22` — `cost_usd double precision` (nullable; `null` means
"no data", never "free"). `src/db/schema/runs.ts:24` — `batch_id uuid`, one value per
`runReview` call, shared by every agent that call starts. Both are generated
migrations; never hand-edit `src/db/migrations/`.

`src/modules/reviews/run-executor.ts` writes them: `costUsd` at `:262` on the run row
and at `:283` into `trace.stats.cost_usd`, `null` at `:85` and `:319` for runs that
never produced a priced outcome.

### Contracts

`src/vendor/shared/` is canonical and the client copy must be updated with it.

- `contracts/trace.ts:96` — `RunSummary.cost_usd` (nullable).
- `contracts/trace.ts` — `RunStats.cost_usd` declared **nullish**, because
  `getRunTrace` returns stored jsonb as-is: traces written before the field existed
  have no such key (see `../INSIGHTS.md`).
- `contracts/platform.ts:165` — `PrMeta.cost_usd`, `.score`, `.findings_by_severity`,
  all nullish and all list-endpoint-only.
- `contracts/review-api.ts:30` — `ReviewRecord.batch_id`.

### Rollups

Pure, DB-free modules, unit-tested without Postgres:

- `src/modules/pulls/cost.ts` — `latestBatchByPr` (`:37`), `latestBatchCostByPr` (`:19`).
- `src/modules/pulls/findings.ts` — `latestRoundReviewIds` (`:39`), `severityByPr`
  (`:70`, wrapping the pre-existing `rollupSeverities` from `status.ts:23`),
  `roundScoreByPr` (`:94`).

`src/modules/pulls/routes.ts:116` runs three `IN`-queries over `agent_runs`, `reviews`
and `findings` and groups them in JS. Why a round and not the newest run — and why not
every run the PR ever had — is `../docs/0001-latest-review-is-a-batch.md`.

## Acceptance

- A successful run stores a non-null `cost_usd` and shares one `batch_id` with the
  other agents of the same request.
- `GET /pulls` returns `cost_usd` summed over the latest batch only, `null` when that
  batch has no priced run.
- `findings_by_severity` and `score` describe the same batch as `cost_usd`.
- A PR with a seeded review but no run returns `cost_usd: null` and still returns a
  severity breakdown (fallback to the newest review).
- No endpoint on this path calls an LLM: the numbers come from rows already stored.
- `pnpm typecheck && pnpm lint && pnpm exec vitest run --exclude '**/*.it.test.ts'` pass.

## Open questions

- `findings(review_id)` is unindexed, so the list's third query is a sequential scan.
  Fine at seed scale; revisit if a workspace accumulates findings.
