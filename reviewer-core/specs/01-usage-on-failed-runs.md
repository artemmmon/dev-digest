# Usage accounting for runs that fail mid-stream
Status: draft
Lesson: L01 (carried over)

Raised as the open question of `../../specs/01-run-cost-badge.md` and left open on
purpose: the cost badge shipped without it, and nothing about the answer changes
what already works.

## Goal

A review that throws after spending real money reports nothing: the engine returns
no `RunOutcome`, so the server writes `tokens_in: 0`, `tokens_out: 0`,
`cost_usd: null` for the run (`../../server/src/modules/reviews/run-executor.ts:319`).
Every failed run therefore looks free. On map-reduce over a large diff, a failure on
the last chunk can hide most of a run's cost.

Decide whether partial usage should survive a failure, and if so, how it travels.

## Scope

**In**
- What the engine does with `tokensIn` / `tokensOut` / `costUsd` accumulated before
  a throw in `src/review/run.ts:157-184`.
- How that reaches the server without weakening the "a run either produced a review
  or it did not" invariant.
- How the UI distinguishes "this run cost nothing" from "this run failed after
  spending $0.004".

**Out**
- Retry or resume of a failed run.
- Budget caps, alerts, or anything that acts on the number.
- Re-pricing historical runs.

## Design sketch (not decided)

**Option A — attach usage to the thrown error.** Wrap the throw in a
`ReviewRunError` carrying `{ tokensIn, tokensOut, costUsd }`. The engine stays pure
and the happy path is untouched; the server reads the fields in its catch block. The
cost is a second, error-shaped contract that every caller has to know about.

**Option B — an injected usage sink.** `runReview` takes an optional
`onUsage(delta)` callback and calls it after each completion. Failure needs no
special case at all, and it generalises to live cost display during a run. It adds a
side effect to a package whose whole point is not having any — though an injected
callback is exactly how the engine already takes side effects.

**Option C — leave it.** Failed runs stay unpriced and the UI keeps rendering `—`.
Honest, zero risk, and wrong by however much a failing run actually costs.

Option B is the current preference: it fits the existing injection pattern and pays
for itself twice (failed-run accounting and live cost), but it needs a decision on
whether the callback fires per call or per chunk.

## Acceptance (once chosen)

- A run that fails after N successful chunks reports the usage of those N chunks.
- A run that fails before its first completion still reports `null`, not `0`.
- `costUsd` stays `null` whenever any counted part was unpriced — a partial sum must
  never be presented as a total.
- The UI can tell "failed and free" from "failed after spending", and the run trace
  shows the same figure as the timeline card.
- The engine remains free of DB, network and filesystem imports; `npm run lint`
  enforces this.

## Open questions

- Does the caller want per-call granularity (progress) or only a final tally?
- Should a cancelled run — a user's choice, not a fault — report its usage as well?
  It spends the same money and today it is written as `cost_usd: null` too.
