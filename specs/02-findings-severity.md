# Findings severity counters, filter and PR-list popover
Status: done
Lesson: L01

## Goal
Make the severity of a review's findings visible and actionable without opening every
finding. Three surfaces, one number: the PR list shows how many findings of each severity
the latest run produced, the Agent-runs timeline shows the same breakdown per run, and an
expanded run card turns that breakdown into a one-click filter over its findings list.

All numbers are a plain grouping of findings already in hand (`GET /pulls/:id/reviews` on
the detail page, one extra SQL rollup on the list endpoint). No additional LLM calls.

## Scope
**In**
- PR list: a **FINDINGS** column with the severity icon+count cluster of the PR's latest
  review run; hovering it opens a read-only popover `N FINDINGS IN THIS RUN` with a preview
  of each finding (severity, title, category, `file:line`, confidence %, rationale).
- PR detail → Agent runs → Timeline: the same icon+count cluster on each run tile
  (commit tiles unchanged). Not clickable.
- PR detail → Agent runs → Review runs → expanded card: a row of pills
  `N CRITICAL · N WARNING · N SUGGESTION` under the verdict banner / PR SCORE. Only
  severities that actually occur. Clicking a pill shows only that severity; clicking it
  again clears the filter.
- Rename the finding-card action label `Dismiss` → `Reject` (UI text only).

**Out**
- Server-side severity filtering or pagination — filtering stays client-side.
- A severity breakdown per run on `GET /pulls/:id/runs` — the detail page already has
  every finding via `GET /pulls/:id/reviews` and maps them by `run_id`.
- Finding previews in the PR-list payload — the popover lazily reuses
  `GET /pulls/:id/reviews` on hover.
- An index on `findings(review_id)` (see Open questions).
- Multi-select severity filtering, URL persistence of the filter, category filters.

## Design
Packages: `server` (list rollup), `client` (all UI). `reviewer-core` unchanged.

### Data (server)
No schema change. `findings.severity` is already `text` holding `CRITICAL | WARNING |
SUGGESTION`, and `reviews` links findings to both `pr_id` and `run_id`.

### Contracts (`server/src/vendor/shared` canonical, mirrored in `client/src/vendor/shared`)
- `PrMeta.findings_by_severity: { CRITICAL: number; WARNING: number; SUGGESTION: number }
  | null | undefined` — `GET /repos/:id/pulls` only; `null` until the PR has a review.
  Name matches the existing `findings_by_severity` in `observability.ts`.
- `ReviewRecord.batch_id: string | null | undefined` — the review round, so the list
  popover previews exactly the findings the counts were taken from.

### PR list rollup
The latest review of a PR = its latest **round**: every agent started by one click on Run
Review, i.e. one `agent_runs.batch_id` — the same grouping the COST column already sums.
The newest `reviews` row is NOT the round: it is whichever agent finished last, often a
clean one next to another that found four problems. `server/src/modules/pulls/findings.ts`
(pure, like `cost.ts`) resolves the round with `latestBatchByPr` and rolls its findings up
per PR, reusing `rollupSeverities()` from `status.ts` (written for this and unused until
now). SCORE follows the same rule and reports the worst score of the round. Reviews with
no `run_id`/`batch_id` (seeded rows) fall back to the newest review alone. Two extra
IN-queries in the route, guarded on empty id lists.

### UI (client)
- `client/src/lib/severity-counts.ts` — pure `countBySeverity()` + `SEVERITY_LIST` order.
- `client/src/components/severity-counts/` — `SeverityCounts`, the compact icon+count
  cluster from the design (`client/docs/design/src/prdetail_runs.jsx` `RunFindings`),
  shared by the PR list cell and the timeline tiles. Inert by default.
- `client/src/app/repos/[repoId]/pulls/_components/FindingsCell/` — list cell + nested
  `FindingsPopover` (hover, `placement` flips up for lower rows, previews fetched lazily
  through `usePrReviews`, no buttons anywhere inside).
- `client/src/app/repos/[repoId]/pulls/[number]/_components/SeverityFilterPills/` — the
  clickable pill row, rendered in the `FindingsPanel` toolbar so counts and list can never
  drift apart.
- Counting policy: counts are taken over exactly the set the panel renders — after the
  existing "Hide low confidence" toggle, before the severity filter. Accepted/dismissed
  findings are still rendered, so they are still counted.
- All strings via `next-intl` (`messages/en/prReview.json`, severity labels in `common.json`).

## Acceptance
- A reviewed PR in the list shows severity icons with counts; an unreviewed PR shows `—`.
- Counts, SCORE and COST on a row all describe the same review round: a clean agent
  finishing last never hides a rejecting one.
- Hovering those icons opens `N FINDINGS IN THIS RUN`; every preview is text only — the
  popover contains no buttons or links; clicking the row still navigates to the PR.
- Each Timeline run tile shows its own severity breakdown; commit tiles don't; neither
  reacts to a click on the icons.
- In an expanded Review-runs card the pill row sits under the verdict banner / PR SCORE and
  lists only severities present in that run.
- Each pill's number equals the number of finding cards of that severity below it, in every
  state of the "Hide low confidence" toggle.
- Clicking a pill leaves only that severity; clicking the active pill restores the full
  list; an empty result shows the existing "No findings match" state.
- Finding cards offer **Accept** and **Reject**.
- The run Trace drawer lists the run's findings.
- Opening the page or toggling a pill triggers no LLM/review request.

## Open questions
- `findings` has no index on `review_id` (Postgres does not index FKs automatically). The
  list rollup adds one IN-query per page load; if the table grows, add the index via
  `pnpm db:generate`.
