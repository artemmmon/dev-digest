# Severity counters, filter and findings popover (UI)
Status: done
Lesson: L01

The client slice of `../../specs/02-findings-severity.md`. That spec covers the
feature end to end; this one covers what the web app owns — three surfaces built
from findings the app already has in memory.

## Goal

Make severity readable at a glance in the PR list, and actionable inside a review
run, without a single extra request and without any model call. Every number on
screen is a grouping of findings already loaded.

## Scope

**In**
- PR list: a `FINDINGS` column showing the severity cluster of the PR's latest
  review round, with a read-only hover popover previewing those findings.
- PR detail, Agent runs → Review runs: a pill row
  `N CRITICAL · N WARNING · N SUGGESTION` under the verdict banner and PR score of
  an expanded run card, click-to-filter and click-again-to-clear.
- Agent runs → Timeline: the same severity cluster on run tiles, display-only.

**Out**
- Server-side filtering, sorting or pagination by severity.
- Multi-select, category filters, or persisting the active filter in the URL.
- Any action inside the list popover — accepting and rejecting live on the PR page.

## Design

### Counting

`src/lib/severity-counts.ts` is the single source of the rule: `SEVERITY_LIST`
(most severe first), `countBySeverity` (`:21`) and `isEmptyCounts`. A plain loop
over an array — no request, no LLM, nothing async — so switching a filter re-renders
and nothing else.

The list does not count client-side: it renders `PrMeta.findings_by_severity`, which
the API already computes for the latest review round. The two paths must agree, which
is why the server rollup and this module both order severities the same way.

### Where the counts come from, per surface

| Surface | Component | Source of the numbers |
|---|---|---|
| PR list column | `_components/FindingsCell/` | `PrMeta.findings_by_severity` (list payload) |
| list popover | `.../FindingsCell/_components/FindingsPopover/` | `usePrReviews`, fetched **only while hovered** |
| run card pills | `[number]/_components/SeverityFilterPills/` | `countBySeverity` over that run's findings |
| timeline tiles | `components/severity-counts/` | the run's own finding list |

### Filtering, and why the number always matches

`FindingsPanel` holds both bits of state — `hideLow` and the active `severity` — and
derives three lists in order (`src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:36-38`):

1. `visibleFindings(findings, hideLow)` — everything the user can currently see.
2. `countBySeverity(visible)` — what the pills display.
3. `filterBySeverity(visible, severity)` — what is rendered below.

Counting the **visible** set rather than the raw one is what makes a pill's number
equal the number of cards under it, including while "hide low confidence" is on.
A pill is rendered only for a severity that actually occurs
(`src/app/repos/[repoId]/pulls/[number]/_components/SeverityFilterPills/SeverityFilterPills.tsx:26`), and clicking the active pill passes `null` to clear.

Because the pills live inside the panel's toolbar, a run card cannot show counts
from one findings set while listing another.

### Presentation rules

- The popover is text only — severity badge, title, category, `file:line`,
  confidence, truncated rationale. No buttons, no links. Accept/Reject exist only on
  `FindingCard` inside an expanded run card.
- A PR with no findings renders `—`, not three zeros (`isEmptyCounts`).
- Every string comes from `messages/en/prReview.json`; nothing is hardcoded.
- Pills carry an explicit `aria-label` (`"1 Critical"`) — see
  `../docs/overlay-ui-without-a-kit-primitive.md` for why, and note that
  `../e2e/specs/04-pr-findings.flow.json` targets them by that exact name.

## Acceptance

- Expanding a run card shows a pill per present severity; each number equals the
  number of finding cards below it.
- Clicking a pill leaves only that severity; clicking it again restores the run's
  full list.
- Toggling "hide low confidence" updates both the pills and the list, and they stay
  consistent.
- Hovering the list's FINDINGS icons opens "N findings in this run" with read-only
  previews, and the pointer can travel from the icons onto the card.
- No network request fires when a filter is toggled; the list issues at most one
  reviews request per hovered PR.
- `pnpm typecheck && pnpm lint && pnpm test` pass.
