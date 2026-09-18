# Browser coverage for the L01 surfaces
Status: done
Lesson: L01

What the flows must prove about the cost badge and the severity UI, and — just as
important — what they deliberately cannot prove on seeded data.

## Goal

The L01 features are read-only summaries spread over three screens. Component tests
already cover the counting and filtering logic; what only a browser can show is that
the numbers survive routing, tab switching and the accordion, and that the controls
are reachable with a real pointer and a real accessible name.

## Scope

**In**
- PR list: the `FINDINGS` column renders (`02-repo-pulls-detail.flow.json:6`).
- PR detail → Agent runs: the seeded run's verdict and finding count in its
  accordion header, the seeded `FindingCard`, and the severity pill row
  (`04-pr-findings.flow.json`).
- The filter round trip: click `1 Critical` → only the CRITICAL finding remains;
  click it again → the WARNING finding is back.

**Out**
- Any cost figure. See "What cannot be covered" below.
- Accept / Reject on a finding — it mutates seeded data.
- The list hover popover: `agent-browser` has no hover primitive in the deterministic
  command set, and faking it with a click would test a different code path.

## Design

Flow `04-pr-findings.flow.json` carries the severity journey end to end:

| Step | Asserts |
|---|---|
| `find text "Add rate limiting…" click` → `wait --url /pulls/482` | the list row links to the detail route |
| `find role button --name "Agent runs"` → `wait --url tab=findings` | tab state lives in the URL |
| `wait --text "request changes"` | the run accordion renders its verdict |
| `wait --text "2 findings"` | the header count comes from the run, not the PR |
| `wait --text "Hardcoded Stripe secret key in commit"` | the newest run is open by default |
| `find role button --name "1 Critical"` | the pill's accessible name is `"<count> <label>"` |
| `wait --text "Hardcoded Stripe secret key…"` | the CRITICAL finding survives its own filter |
| same pill again → `wait --text "N+1 query in user list endpoint"` | clicking the active pill clears the filter |

The last two steps are the ones that would catch a regression in
`filterBySeverity`'s clear-on-toggle behaviour from the browser side.

## What cannot be covered, and why

The seed inserts a review with findings but **no `agent_runs` row**
(`../server/src/db/seed.ts`). With no run there is no batch, so the PR list's COST
column renders `—` and the Agent runs timeline has no priced card. Asserting a real
cost figure would mean running an agent, which means a model call and an API key —
exactly what this suite refuses to do.

Two honest options, neither taken yet:
- assert the empty state (`—` in the COST column), which pins the "never `$0.00`"
  rule but not the badge itself;
- extend the seed with a completed `agent_runs` row carrying `cost_usd` and a
  `batch_id`, which would make the whole L01 list row assertable — and would also
  give the severity rollup a real round to summarise instead of the newest-review
  fallback.

The second is the better fix and is server work, not e2e work.

## Acceptance

- `../scripts/e2e.sh` is green with flows 02 and 04 asserting the steps above.
- A flow fails if the severity pills lose their `aria-label`, if the filter stops
  clearing, or if the newest run stops being open by default.
- No flow triggers a model call, needs an API key, or writes to the database.

## Open questions

- Should the seed grow a priced run (see above)? It would change what every flow
  sees on the PR list, so it needs the server's agreement first.
