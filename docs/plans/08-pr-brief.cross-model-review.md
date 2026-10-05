# Cross-model review: PR Brief plan

Plan: [08-pr-brief.md](08-pr-brief.md) · Spec: [SPEC-12](../../specs/12-pr-brief.md)

| | |
|---|---|
| Reviewer | `openai/gpt-5.6-sol` through OpenRouter (the plan was written by a Claude model) |
| Date | 2026-10-05 |
| Input | the spec and the draft plan, nothing else: the reviewer did not see the code |
| Size | 21,467 tokens in · 5,262 tokens out · $0.106 |
| Reviewer's verdict | not ready: 3 CRITICAL, 8 WARNING |
| Outcome | 7 findings accepted or partly accepted and written into the plan, 4 rejected with a clarifying sentence added |

The `implementation-planner` checked every finding against the plan and the code before changing
the plan. Two findings were settled by the user (3 and 6).

## Findings

| # | Level | Finding | Verdict | What changed in the plan, or why not |
|---|---|---|---|---|
| 1 | CRITICAL | The in-memory per-PR map does not stop a second model call across server processes | Rejected | The API is one local process (`server/AGENTS.md`). Step 7 now states that assumption where AC-8 and EC-14 are covered; no database lock is added |
| 2 | CRITICAL | Trimming cannot guarantee 8,000 tokens: title, intent fields, blast summary and lists are never reduced | Accepted | Step 4 caps the inputs the budget cannot remove; step 5 adds a last resort (drop blast, then intent, whole) and a final recount; step 7 sends the call only at 8,000 tokens or less |
| 3 | CRITICAL | A re-ask is outside the budget | Rejected (user decision) | The budget bounds the first request only; a re-ask carries the model's own answer, not new inputs. Step 5 says so against AC-34 and NFR-2 |
| 4 | WARNING | The 5-headers-per-file and 120-character limits are not implemented | Rejected as a gap | The moved `extractHunkHeaders` already applies both limits; step 2 now says the move keeps them |
| 5 | WARNING | Only the summary gets a skeleton; AC-6 names three regions | Accepted | Step 10 shows a skeleton in the summary, Risk areas and Review focus slots, on first and repeated generation |
| 6 | WARNING | A nullable `cost_usd` cannot satisfy the footer of AC-67 | Accepted (user decision) | The cost is the provider result's `costUsd`, as Intent and review runs store it; when it is unknown the footer omits the amount and keeps the other fields. The spec is not amended |
| 7 | WARNING | A failed generation can leave no log line | Accepted | Step 7: exactly one log line per started generation, from a `finally` path, with the outcome and the error code |
| 8 | WARNING | A remembered collapsed state can override the URL focus | Accepted | Step 12: a manual toggle is kept with the focus value it was made under and ignored for another, so a new `file` / `line` always opens its group and file |
| 9 | WARNING | The plan says no new tests, yet steps list test files | Rejected | No "Done when" depended on a new test. The `Tests (test-writer)` lines are the plan format's record for a later test-writer run; a sentence under Goal now says so |
| 10 | WARNING | Optional `intent`, `blast`, `history` let a stored brief hold what NFR-13 forbids | Partly accepted | The contract keeps the three keys optional, as the spec says; step 6 makes the repository drop them on save and on read |
| 11 | WARNING | Markdown safety is not specified | Accepted | Step 11 names the renderer (react-markdown + remark-gfm, no `rehype-raw`, default `urlTransform`), forbids adding plugins and keeps `stripImageEmbeds` |

## What the review was worth

The reviewer could not see the code, so three of its findings described gaps that the code or the
deployment already closes (1, 4, 9). The ones that held were about behaviour at the edges that a
plan written from the spec tends to skip: the budget with nothing left to trim (2), the log line
on failure (7) and UI state that survives a navigation (8).

One accepted change goes beyond the spec: the last-resort trimming of finding 2 drops blast and
then intent after AC-35 / AC-36 end. The caps of step 4 should make it unreachable.
