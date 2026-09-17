# Where a run's token count and cost come from

The engine reports what a review cost, but it never decides what a token is worth.
Both statements matter: the number the UI shows starts here, and the pricing policy
behind it does not. This is the whole path, and the rules that keep it pure.

## The path

```
provider response.usage ──┐
                          ├─► CompleteResult.costUsd ──► RunOutcome.costUsd ──► server
estimateCost(...) ────────┘        (per LLM call)          (per review run)
```

**1. Per call — `src/llm/openrouter.ts`.** After each structured completion the
provider accumulates `usage.prompt_tokens` and `usage.completion_tokens` (`:94`),
then settles cost in this order (`:107`):

- `usage.cost`, an OpenRouter extension carrying the **real** generation price in
  USD. It is only returned because the request asks for it with
  `usage: { include: true }` (`:83`), sent for OpenRouter only.
- otherwise the injected `estimateCost(model, tokensIn, tokensOut)` hook.
- otherwise `null`.

`null` means *no data*, never *free*. Everything downstream — the DB column, the
contract, the badge — preserves that distinction.

**2. Per run — `src/review/run.ts`.** A single-pass review is one call; map-reduce is
one call per chunk. Tokens add up, and cost adds up **only while every part is
known**: `costUsd = costUsd == null || res.costUsd == null ? null : costUsd + res.costUsd`
(`:184`). One unpriced chunk poisons the sum to `null` rather than under-reporting
the run. The totals leave the engine on `RunOutcome` (`:216`), together with the
grounded review.

Retries are included: a repair round-trip is another call on the same accumulator,
so a run that needed two attempts reports what both attempts cost.

## Why the price table is not in here

`estimateCost` is an **injected** function (`src/llm/openrouter.ts:36`), not a table
this package owns, because pricing is I/O-shaped: it changes weekly, it can be
fetched, and it is per-deployment. The engine's contract is "give me a function that
turns tokens into dollars"; the server decides what that function knows.

The server passes `PriceBook.estimate` (`../server/src/platform/price-book.ts`),
which caches OpenRouter's `/models` prices with a 6-hour TTL and falls back to the
static table in `../server/src/adapters/llm/pricing.ts` for cold starts and for
providers that do not publish prices. That estimator is deliberately **synchronous**
— it is called from a hook that cannot await — so a cold cache returns the fallback
and refreshes in the background.

Adding a model therefore never means editing this package.

## Rules for anyone touching this

- Do not import a price table, `fetch` prices, or read an env var here. New
  knowledge arrives as an injected interface.
- Keep `null` distinguishable from `0`. A free model costs `0`; an unknown one costs
  `null`. Both are legitimate and the UI renders them differently (`$0.00` vs `—`).
- A new provider implements the same settle-then-report shape. If it reports real
  usage, prefer it over any estimate — estimates are a fallback, not a policy.
- Cost is reported, never enforced. Budgets, caps and alerts belong to the caller.

## What the engine does not report

A run that throws mid-stream returns no `RunOutcome`, so the tokens already spent on
its successful chunks are lost — the server stores `cost_usd = null` for failed runs.
Whether partial usage should survive a failure is an open spec:
`../specs/01-usage-on-failed-runs.md`.
