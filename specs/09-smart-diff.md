# Smart Diff: role-ordered Files changed with inline findings
Status: done
Lesson: L03

## Goal
Files changed shows a PR's files grouped by role (core → tests → wiring → docs → boilerplate)
instead of GitHub's raw order, so a lock-file no longer sits next to business logic. The latest
review round's findings surface directly in that view — a counter on the group header, a dot on
the file card, a `FindingCard` under the line — instead of living only on the Agent runs tab.
Grouping comes from a pure server classifier behind `GET /pulls/:id/smart-diff`. It never calls a
model and works before any review has run.

## Scope
**In**
- All of P1, P2 and P3 in `hw/L03/hw3-task.md` except P1.7 (the PR) and P2.8 (the demo video).
- Contract: `SmartDiffRole` extended to 5 values (`core | tests | wiring | docs | boilerplate`)
  in both `brief.ts` copies.
- Server: a pure `classifyFile(path)` classifier (no I/O), a pure `buildSmartDiff` builder, and
  `GET /pulls/:id/smart-diff`, workspace-scoped, reading persisted `pr_files` + the latest review
  round's findings (same "round" rule as the PR list).
- Client: a Smart/Original order toggle on `DiffTab`, role groups with sticky headers and
  descriptions, a findings dot + inline `FindingCard` + out-of-patch block on `DiffViewer`, one
  GitHub-comments-and-findings visibility toggle, a "review not run yet" notice, live refresh
  after Run Review without a page reload.

**Out**
- The split banner or split PRs (`split_suggestion.too_big` is always `false`).
- `pseudocode_summary`.
- Brief deep-links (`navTarget`).
- A new e2e flow.
- The demo video.
- Reuse of the classifier in the reviewer prompt (planned for L08; the module's `index.ts` is
  built as that future surface but nothing imports it yet).

## Design
Packages: server, client.

**Contracts** (`server/src/vendor/shared/contracts/brief.ts`, synced to
`client/src/vendor/shared/contracts/brief.ts`): `SmartDiffRole` extended from
`['core', 'wiring', 'boilerplate']` to `['core', 'tests', 'wiring', 'docs', 'boilerplate']`.
`SmartDiff`, `SmartDiffGroup`, `SmartDiffFile`, `ProposedSplit` and `SmartDiffResponse`
(`review-api.ts`) already existed and are unchanged.

**Server**: new module `modules/smart-diff/` — `constants.ts` (`SMART_DIFF_ROLE_ORDER`,
`CLASSIFY_RULES`, `FALLBACK_ROLE`), `classify.ts` (`classifyFile`, pure), `build.ts`
(`buildSmartDiff`, pure), `ports.ts` (`SmartDiffStore`, narrow structural types), `service.ts`
(`SmartDiffService.forPull`), `repository.ts` (Drizzle `SmartDiffStore` implementation),
`routes.ts` (`GET /pulls/:id/smart-diff`), `index.ts` (public surface for a future L08 reviewer
filter: `classifyFile`, `SMART_DIFF_ROLE_ORDER`, `CLASSIFY_RULES`).
The gitignore-like glob matcher (`escapeLiteral`, `translateSegment`, `compilePattern`,
`cachedPattern`, `matchesAny`) moved from `modules/reviews/diff-filter.ts` into
`modules/_shared/glob.ts`, shared by the review-diff exclusion filter and the Smart Diff
classifier; `diff-filter.ts` re-exports `matchesAny` so its existing callers and test are
unchanged. The "latest review round" is the same rule the PR list uses
(`pulls/cost.ts#latestBatchByPr` + `pulls/findings.ts#latestRoundReviewIds`, now exported from
`pulls/index.ts`) — a round is every agent run started by one Run Review click, sharing one
`agent_runs.batch_id`.

**API**: `GET /pulls/:id/smart-diff` → `SmartDiffResponse`. Always returns all 5 groups
(including empty ones — the client hides those, see Decisions), files in their stored
(`pr_files`) order, `finding_lines` from the latest round's findings only. 404 when the PR is not
in the caller's workspace, 422 on a non-uuid id. Never calls a model.

**Client**: `lib/latest-round-findings.ts` (promoted from `FindingsPopover/helpers.ts`, now used by
both `FindingsCell` and `DiffTab`), `keys.pr.smartDiff`, `usePrSmartDiff(prId)` in
`lib/hooks/core.ts`, a refresh on the >0 → 0 active-runs transition in `usePrRunTracking`.
`components/diff-viewer` takes findings through a `renderFinding` slot (`DiffFindingApi`) instead
of importing `src/app` (lint boundary): `FileCard` shows a dot + passes matched findings to
`CodeLine`, which draws a severity-coloured left stripe + label and renders `renderFinding(f)`
under the line; `OutOfPatchFindings` shows findings whose line never rendered. `DiffTab` wires
`usePrSmartDiff`, `usePrReviews`, `useFindingAction`, builds `RoleGroup`s via `buildRoleGroups`,
and defaults the GitHub-comments toggle to shown when the latest round has findings. Sticky role
headers sit below the (now height-published) `PrDetailHeader` via `--pr-header-h`.

## Design deviations (from `client/docs/design/src/diff.jsx`, which only models 3 roles)
1. `tests` and `docs` roles, their labels, descriptions and colours are derived (course task +
   user decision), not in the design reference.
2. Original order = GitHub's `PrFile[]` order, not `localeCompare` (design `:197`).
3. File expand rule stays `AUTO_EXPAND_MAX_LINES`, not "has findings" (design `:85`). Groups: docs
   and boilerplate start collapsed; the design collapses only boilerplate (`:195`).
4. The group counter (`● N`) is always visible when `N > 0`; the design shows it only when the
   group is collapsed (`:157`).
5. The inline comment anchors to `RIGHT:start_line`, not the last cited line (design `:88-90`).
6. The inline comment is the app's own `FindingCard` (Accept/Dismiss), not the design's read-only
   card; its own header toggle is the "collapse to one line" state (design uses an X to hide).
7. The out-of-patch block reuses the existing `OutdatedComments` look, not a new one.
8. The GitHub comments toggle also hides finding comments (one toggle, not two).
9. Group headers are sticky (the design only makes the PR header sticky).
10. A "review not run yet" notice replaces zero counters when no `kind: 'review'` review exists.
11. The file card keeps the app's existing GitHub comment counter next to the new findings dot.
12. Empty role groups are hidden on the client (user decision, 2026-09-26) — the server still
    returns all 5 groups, `DiffTab` renders only the ones with ≥ 1 file. This matches the design,
    which likewise lists only groups that have files.
13. The severity label on a flagged line is a static span, not a toggle button.

## Acceptance
P1 (blocking):
1. Files changed shows 5 groups in order core → tests → wiring → docs → boilerplate, each with a
   role label and a file count.
2. A lock file classifies as `boilerplate`; docs and boilerplate start collapsed.
3. After Run Review, the group header shows a counter of files-with-findings.
4. A file card with findings shows a dot indicator.
5. An expanded file shows a `FindingCard` (severity, title, rationale) under the right line.
6. The Original order toggle restores GitHub's order.

P2 (non-blocking):
1. Patterns and role order live in one constants file; a unit test table covers the classifier,
   including the 3 contested cases (`__snapshots__/x.snap` → boilerplate, `.claude/skills/**/*.md`
   → wiring, `e2e/README.md` → tests).
2. The route's response validates against the `SmartDiff` contract; the enum is extended in both
   `brief.ts` copies.
3. No new model call appears in the Smart Diff view's logs; grouping works before the first review.
4. A line with a finding is marked with a coloured left stripe and a severity-word label.
5. Accept / Dismiss on the inline comment change the finding's state.
6. A finding whose line never rendered shows in a separate out-of-patch block, not silently.
7. The same toggle that hides GitHub comments also hides finding comments.
8. (Out of scope for this plan — closed in the PR description, not code.)

P3 (nice-to-have):
1. Sticky group header while scrolling.
2. The inline finding comment can collapse to one line.
3. "Review not run yet" empty state instead of zero counters.
4. Counters and dots refresh after Run Review without a page reload.
5. All Smart Diff strings come from `client/messages/en/prReview.json`'s `smartDiff` key.

## Open questions
- `pr_files` has no order column; the server's in-group file order is therefore whatever
  `persistedDetail` returns (arbitrary), and the client always re-sorts by GitHub order for
  display — so this is cosmetic only, never a correctness issue.
- If `GET /pulls/:id` refreshes files after a Smart Diff fetch, a brand-new path falls back to
  `core` until the next `usePrSmartDiff` refetch; `buildRoleGroups` never drops a file.
- Whether GitHub comments should ever stay hidden even when the latest round has findings was
  raised and decided against (2026-09-26): the toggle's default is "shown when there are
  findings" everywhere.
- Whether a dependency manifest (`package.json`, `pubspec.yaml`) classifies as `core` or `wiring`
  was raised and decided (2026-09-26): **`wiring`** — it hooks a dependency into the app, it isn't
  the substance of the change. Their lock files (`pnpm-lock.yaml`, `pubspec.lock`, …) still
  classify as `boilerplate`, since that rule is checked first.
