# Development Plan: Smart Diff — role-ordered Files changed with inline findings (HW3)
Status: in progress (approved 2026-09-26; user decisions below)
Save as: docs/plans/03-smart-diff.md
Spec: specs/09-smart-diff.md (created in Step 1; follows the spec convention used by `specs/08-intent-layer.md`)

## Goal
Files changed shows a PR's files grouped by role (core → tests → wiring → docs → boilerplate), with a Smart/Original order toggle. The latest review round's findings appear in three places: a counter on the group header, a dot on the file card, and a FindingCard comment under the line. Grouping comes from a pure server classifier behind `GET /pulls/:id/smart-diff`. It never calls a model and works before any review.
In scope: all of P1, P2 and P3 in `hw/L03/hw3-task.md` except P1.7 and P2.8 (the PR and the video).
Out of scope: the split banner or split PRs (`too_big` is always false), `pseudocode_summary`, brief deep-links (`navTarget`), a new e2e flow, the demo video, reuse of the classifier in the reviewer prompt (L08).

## User decisions (2026-09-26) — final, override the text below where they differ
| Question | Answer |
|---|---|
| Plan | Approved as is. |
| Empty role groups | **Hidden on the client.** The server still returns all 5 groups (empty ones included); `DiffTab` renders only groups with ≥ 1 file. Replaces "An empty group shows its header with \"0 files\"" (Step 8) and deviation 12. |
| Comments toggle default | As planned: shown when the latest round has findings; one toggle hides GitHub comments and findings together. |

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | 1–5 | spec + contracts + server | — | `SmartDiffRole` has 5 values in both copies. `GET /pulls/:id/smart-diff` returns `SmartDiff` with all 5 groups in `SMART_DIFF_ROLE_ORDER`, including empty ones, and files in stored order. `server/src/modules/smart-diff/index.ts` exports `classifyFile`, `SMART_DIFF_ROLE_ORDER`, `CLASSIFY_RULES`. |
| G2 | 6–7 | client lib + `components/diff-viewer` | G1 | `latestRoundFindings` in `@/lib/latest-round-findings`. `usePrSmartDiff(prId)` in `@/lib/hooks/core`. `keys.pr.smartDiff`. `DiffFindingApi` exported from `@/components/diff-viewer`. `DiffViewer` and `FileCard` take `findings?: DiffFindingApi`. |
| G3 | 8–10 | client route (DiffTab, PR header, page) + docs | G2 | none (final) |

## Skills for implementer
| Path glob (routing.json rule id) | Skills | Why they matter here |
|---|---|---|
| `server/src/modules/**`, `server/src/platform/container.ts` (server-app) | onion-architecture, fastify-best-practices | new module slice, ports, thin route, container getter |
| `server/src/modules/smart-diff/repository.ts` (server-data) | drizzle-orm-patterns | 4 read queries, `inArray` guard |
| `server/src/vendor/shared/**` (shared-contracts-server) | zod, onion-architecture | enum extension in core |
| `client/src/vendor/shared/**` (shared-contracts-client) | zod | synced copy only; never hand-edited |
| `client/src/**/*.{ts,tsx}` (client-src) | frontend-architecture, react-best-practices | slot instead of importing `app/` from `components/`; derive, don't store |
| `client/src/app/**` (client-app-router) | next-best-practices | `"use client"` leaf components |
| `client/messages/**` (client-i18n) | frontend-architecture | `prReview.json` → `smartDiff` |
| `client/**/*.test.tsx` (client-tests) | react-testing-library | flow tests, `userEvent`, `renderWithIntl` |
| all non-test server/client TS (security-surface) | security | uuid param, workspace scoping, no raw HTML |

## Steps
### Step 1 — Spec (docs)
- Files: create `specs/09-smart-diff.md` · modify `specs/README.md` (Index line).
- Change: write the spec with the template in `server/specs/README.md`: Goal, Scope, Design (packages: server and client), Acceptance (P1–P3 minus P1.7 and P2.8), Open questions. Set `Status: in progress` and `Lesson: L03`. Copy the design deviations from Design notes below into the spec's Design section.
- Rules / skills: root AGENTS "Keeping docs alive".
- Tests: none.
- Done when: the spec exists, and the index has the line `- [09-smart-diff](09-smart-diff.md) — in progress — server, client`.

### Step 2 — Extend `SmartDiffRole` (contracts)
- Files: modify `server/src/vendor/shared/contracts/brief.ts:197`, then run `./scripts/shared-contracts.sh sync`, which rewrites `client/src/vendor/shared/contracts/brief.ts`.
- Change: `z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate'])`. Nothing else in the file changes.
- Rules / skills: zod (`schema-use-enums`), shared-contracts rule.
- Practices: edit only the server copy. Never edit the client copy by hand.
- Tests: none new. The existing `server/test/contracts.test.ts` must still pass.
- Done when: `./scripts/shared-contracts.sh check` passes and both `pnpm typecheck` runs are green.

### Step 3 — Shared glob matcher + classifier (server)
- Files: create `server/src/modules/_shared/glob.ts`, `server/src/modules/smart-diff/constants.ts`, `server/src/modules/smart-diff/classify.ts`, `server/src/modules/smart-diff/index.ts`, `server/test/smart-diff-classify.test.ts` · modify `server/src/modules/reviews/diff-filter.ts`.
- Change:
  - Move `escapeLiteral`, `translateSegment`, `compilePattern`, `cachedPattern` and `matchesAny` (`diff-filter.ts:25-82`) verbatim into `_shared/glob.ts`. `diff-filter.ts` then imports `matchesAny` from `../_shared/glob.js` and re-exports it, so `applicability.ts`, `run-executor.ts` and `test/reviews-diff-filter.test.ts` keep working unchanged.
  - `constants.ts` holds everything about the order in one file:
    - `SMART_DIFF_ROLE_ORDER: readonly SmartDiffRole[]`, the display order core, tests, wiring, docs, boilerplate.
    - `CLASSIFY_RULES: readonly { role; patterns: readonly string[] }[]`, the check order: boilerplate, tests, wiring, docs. The first match wins.
    - `FALLBACK_ROLE = 'core'`.
  - Patterns use the matcher's dialect (see Design notes → Patterns).
  - `classify.ts` exports `classifyFile(path: string): SmartDiffRole`. It is pure, with no I/O and no HTTP.
  - `index.ts` is the public surface for other modules (L08). It re-exports `classifyFile`, `SMART_DIFF_ROLE_ORDER` and `CLASSIFY_RULES` only.
- Rules / skills: onion (a pure helper is the application ring; `_shared` may be imported across modules; `index.ts` is the cross-module surface).
- Practices:
  - A bare literal pattern (no `/`, no wildcard) matches only the exact full path (`diff-filter.ts:49`). Prefix file names with `**/` (for example `**/pnpm-lock.yaml`) so they match at any depth.
  - Never write a literal `**/` or `/**` inside a `/** */` comment, because it closes the comment early (server INSIGHTS 2026-09-23, `:294`). Spell it out in words instead.
- Tests: `smart-diff-classify.test.ts` is a table test with `it.each([[path, role], …])`. Write the table first, then the implementation. It must include the three contested cases:
  - `src/__tests__/__snapshots__/x.snap` → `boilerplate`
  - `.claude/skills/security/SKILL.md` → `wiring`
  - `e2e/README.md` → `tests` (the rule order is kept by the user's decision; add a one-line comment above the row)

  It also includes at least `server/pnpm-lock.yaml`, `pubspec.lock`, `lib/models/user.g.dart`, `client/dist/app.js` → boilerplate; `server/test/pulls-service.test.ts`, `client/src/lib/api.test.ts`, `server/test/intent.it.test.ts` → tests; `client/src/components/diff-viewer/index.ts`, `client/next.config.ts`, `tsconfig.json`, `.github/workflows/ci.yml`, `.env.example` → wiring; `README.md`, `docs/plans/03-smart-diff.md`, `LICENSE` → docs; `server/src/modules/pulls/service.ts` → core.

  Add one more test asserting that `SMART_DIFF_ROLE_ORDER` equals `SmartDiffRole.options` as a set.
- Done when: `pnpm test:unit` is green, including `reviews-diff-filter.test.ts`, and `pnpm arch` reports no violations.

### Step 4 — Pure builder, ports, service (server)
- Files: create `server/src/modules/smart-diff/build.ts`, `ports.ts`, `service.ts`, `server/test/smart-diff-service.test.ts` · modify `server/src/modules/pulls/index.ts` (add `export { latestBatchByPr } from './cost.js'; export { latestRoundReviewIds } from './findings.js';`).
- Change:
  - `build.ts`: `buildSmartDiff(files: {path, additions, deletions}[], findings: {file, startLine}[]): SmartDiff`.
    - It always emits 5 groups in `SMART_DIFF_ROLE_ORDER`, and a group may be empty.
    - Files keep their input order inside a group.
    - `finding_lines` holds the unique `startLine` values for that path, sorted ascending.
    - `split_suggestion = { too_big: false, total_lines: Σ(additions + deletions), proposed_splits: [] }`.
    - `pseudocode_summary` is omitted.
  - `ports.ts` defines `SmartDiffStore` with 4 methods:
    - `pullInWorkspace(workspaceId, prId): Promise<{ id: string } | undefined>`
    - `files(prId)`
    - `roundInputs(prId): Promise<{ runs: {prId, id, batchId}[]; reviews: {prId, id, runId}[] }>`, both newest first
    - `findingLocations(reviewIds)`

    Declare these as narrow structural types. Do not import pulls' `ports.ts` (server INSIGHTS `:204`).
  - `service.ts`: `SmartDiffService` with constructor `{ store: SmartDiffStore }` and `forPull(workspaceId, prId)`. It throws `NotFoundError('Pull request not found')` when the PR is not in the workspace. The latest round comes from `latestBatchByPr` + `latestRoundReviewIds`, imported from `../pulls/index.js` (the same rule as the PR list; server INSIGHTS `:77`). Then it calls `findingLocations` and `buildSmartDiff`.
- Rules / skills: onion principles 3 and 8, checklist ("constructor takes ports", "no cross-module internals").
- Practices: the service has no LLM, GitHub or git dependency. That is the structural guarantee behind P2.3.
- Tests: `smart-diff-service.test.ts` runs against an in-memory fake store (pattern: `server/test/pulls-service.test.ts`). Cover:
  - no reviews → 5 groups, every `finding_lines` empty
  - two batches → only the newest batch's lines count
  - duplicate start lines are deduplicated
  - unknown PR → `NotFoundError`
  - the result passes `SmartDiff.parse`
- Done when: the unit tests are green and `pnpm arch` is clean.

### Step 5 — Repository, container, route (server)
- Files: create `server/src/modules/smart-diff/repository.ts`, `routes.ts`, `server/test/smart-diff.it.test.ts` · modify `server/src/platform/container.ts` (lazy getter `smartDiffRepo`, same pattern as `pullsRepo` at `:184`), `server/src/modules/index.ts` (import + register `smartDiff`), `server/README.md` (add to the API map).
- Change:
  - `SmartDiffRepository implements SmartDiffStore`, with 4 Drizzle selects:
    - `pull_requests` filtered by `id` and `workspace_id`
    - `pr_files`: `path`, `additions`, `deletions` only (no patch)
    - `agent_runs` where `pr_id = ?` and `batch_id IS NOT NULL`, ordered by `ran_at DESC`; plus `reviews` where `pr_id = ?` and `kind = 'review'`, ordered by `created_at DESC` (mirrors `PullsRepository.roundInputs`, `pulls/repository.ts:191`)
    - `findings` `file`, `start_line` by `review_id`, returning `[]` early for empty ids
  - `routes.ts`: `app.get('/pulls/:id/smart-diff', { schema: { params: IdParams, response: { 200: SmartDiffResponse } } }, …)`. The handler calls `getContext` and then `service.forPull(workspaceId, req.params.id)`. The service is built as `new SmartDiffService({ store: container.smartDiffRepo })`.
- Rules / skills: onion (routes are thin: schema → getContext → one service call; the repository returns plain records), drizzle-orm-patterns, fastify (response schema = serializer validation, P2.2), security (uuid param → 422; workspace scoping → 404, no existence leak).
- Practices: no `Schema.parse` inside the handler. Rows never leave the repository.
- Tests: `smart-diff.it.test.ts` (Testcontainers; pattern `server/test/intent.it.test.ts`: `buildApp` with mock overrides + `seed`). Cover:
  - a PR with a lock file, a `.ts` file, a test file and `index.ts`, and no reviews → 200 with 5 groups in order and each file in the right group
  - a PR with a review round → the right `finding_lines`
  - a random uuid → 404
  - `not-a-uuid` → 422
- Done when: `pnpm typecheck`, `lint`, `test:unit`, `arch` and `test:integration` (needs Docker) are green.

### Step 6 — Client lib: latest round, key, hook, refresh (client)
- Files: create `client/src/lib/latest-round-findings.ts` and `.test.ts` · modify `client/src/app/repos/[repoId]/pulls/_components/FindingsCell/_components/FindingsPopover/helpers.ts` (remove `latestRoundFindings`), `client/src/app/repos/[repoId]/pulls/_components/FindingsCell/FindingsCell.tsx:14` (new import), `client/src/lib/query-keys.ts` (`smartDiff: (prId) => ["pr", prId, "smart-diff"]`), `client/src/lib/hooks/core.ts` (add `usePrSmartDiff(prId)` next to `usePullDetail`, `api.get<SmartDiffResponse>`), `client/src/lib/hooks/reviews.ts`.
- Change:
  - Promote `latestRoundFindings` unchanged, with its comment that it must match `server/src/modules/pulls/findings.ts`. It now has a second consumer on another route (frontend-architecture: promote on the second consumer).
  - In `usePrRunTracking`, `onRunsSettled` (`:91`) also invalidates `keys.pr.smartDiff(prId)`.
  - Add an effect in `usePrRunTracking` that calls `onRunsSettled` when `liveRunIds.length` goes from >0 to 0, using a ref for the previous length. The Files changed tab does not mount `RunStatus`, and active runs poll every 4 s (`reviews.ts:32`), so this effect is what makes the refresh work without reloading while that tab is open (P3.4).
- Rules / skills: frontend-architecture (hooks in `src/lib/hooks`, keys from the factory; client INSIGHTS `:127`), react-best-practices (the effect syncs with the external cache, so it is allowed).
- Tests: `latest-round-findings.test.ts` (batch round, unbatched fallback, severity order). In `client/src/lib/hooks/reviews.test.tsx`, one test that a >0 → 0 active-runs transition invalidates reviews and smart-diff.
- Done when: `pnpm typecheck`, `lint` and `test` are green, and `rg latestRoundFindings client/src` shows only the new module and its imports.

### Step 7 — diff-viewer: findings slot, dot, stripe, inline comment, out-of-patch (client)
- Files: create `client/src/components/diff-viewer/findings.ts`, `findings.test.ts`, `OutOfPatchFindings/OutOfPatchFindings.tsx` + `index.ts` · modify `diff-viewer/index.ts` (export `type DiffFindingApi`), `DiffViewer/DiffViewer.tsx`, `FileCard/FileCard.tsx`, `CodeLine/CodeLine.tsx`, `FileCard/FileCard.test.tsx`, `client/messages/en/prReview.json` (`smartDiff`: `fileHasFindings`, `severityWord.{CRITICAL,WARNING,SUGGESTION,INFO}` = blocker / warning / suggestion / info, `outOfPatchTitle` with ICU plural).
- Change:
  - `findings.ts` defines `DiffFindingApi = { findings: FindingRecord[]; show: boolean; renderFinding: (f: FindingRecord) => ReactNode }` and three pure helpers:
    - `findingKey(f)` = `lineKey("RIGHT", f.start_line)`
    - `partitionFindings(fileFindings, renderedKeys)` → `{ matched: Map<key, FindingRecord[]>, outOfPatch }`
    - `worstSeverity(list)`, using `SEVERITY_LIST` order from `@/lib/severity-counts`
  - `DiffViewer` passes `findings` through to every `FileCard`.
  - `FileCard`:
    - Filters `findings` by `f.file === file.path` and builds the rendered keys it already has (`:48-49`).
    - Shows a 6px `var(--crit)` dot right after the path (the existing comment counter stays at `:87-94`). The dot is `role="img"` with `aria-label` = `t("smartDiff.fileHasFindings")` from `prReview`.
    - Passes the matched findings for each line to `CodeLine`.
    - When `findings.show` is true, renders `<OutOfPatchFindings>` after the lines, next to `OutdatedComments` (`:111`).
    - Keeps the auto-expand rule (`:37-39`).
  - `CodeLine`:
    - When a line has findings, draws a 3px left stripe in the `SEV[worst].c` colour (`SEV` from `@devdigest/ui`) on the row. The row gets `position: relative`.
    - Adds a right-aligned label with the severity word in the same colour.
    - When `show` is true, renders `renderFinding(f)` for each finding under the line, before the GitHub threads, inside the existing `cs.thread` rail.
  - `OutOfPatchFindings` reuses the `cs.outdatedWrap` / `cs.outdatedTitle` look (`comments.ts`).
- Rules / skills: lint forbids `components/` importing `src/app`, so the card comes in through the `renderFinding` slot (frontend-architecture devdigest.md open question 3). Other practices: react-best-practices (derive in render, `useMemo` only for the partition, stable keys `f.id`); a11y (no bare clickable div).
- Tests: `findings.test.ts` (partition matched vs out-of-patch; worst severity). In `FileCard.test.tsx`, one flow test: a file with one in-patch and one out-of-patch finding shows the dot, the rendered slot under the right line, the "blocker" label and the out-of-patch block; with `show: false` both slots are gone and the dot and label stay.
- Done when: the client checks are green, and `DiffViewer` without `findings` renders exactly as before (the existing `FileCard` and smoke tests are unchanged and pass).

### Step 8 — DiffTab: role groups, order toggle, counters, empty state (client)
- Files: modify `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx` · create `DiffTab/constants.ts`, `helpers.ts`, `helpers.test.ts`, `styles.ts`, `DiffTab.test.tsx`, `DiffTab/_components/RoleGroup/{RoleGroup.tsx,index.ts,styles.ts}` · modify `client/messages/en/prReview.json` (`smartDiff`: `testsLabel` "Tests", `docsLabel` "Docs", `coreLabel` → "Core logic", `coreDesc`, `testsDesc`, `wiringDesc`, `docsDesc`, `boilerplateDesc` (text in Design notes), `smartOrder`, `originalOrder`, `orderGroupLabel`, `filesWithFindings` with ICU plural, `reviewNotRun`).
- Change:
  - `DiffTab` wires the data: `usePrComments`, `useCreatePrComment`, `usePrReviews`, `usePrSmartDiff`, `useFindingAction`. It computes `findings = latestRoundFindings(reviews)`.
  - Comments toggle:
    - State is `useState<boolean | null>(null)`, and the effective value is `override ?? findings.length > 0`. A PR without findings keeps today's hidden-by-default diff (`DiffTab.tsx:23`), and findings show without a click (P1.5).
    - The toggle button renders when `commentCount + findings.length > 0` (today only when comments > 0, `:46`), and its count is that sum.
    - The same flag drives `commenting.showComments` and `findings.show` (P2.7).
  - `renderFinding` is `<FindingCard f defaultExpanded onAction={(a) => action.mutate({ findingId: f.id, action: a, prId })} pending={action.isPending} repoFullName headSha />` (as in `FindingsPanel.tsx:84-87`). Collapsing it to one line is FindingCard's own header toggle (P3.2).
  - Order toggle: two kit `Button`s (`active` + `aria-pressed`) in a `role="group"` with the `orderGroupLabel` name. The default is Smart.
    - Original = `<DiffViewer files={files}>`, which is the GitHub `PrFile[]` order.
    - Smart = one `RoleGroup` per `buildRoleGroups(smartDiff, files)` entry.
    - While the smart diff is loading or has failed, the Original view renders, so the diff is never blocked.
  - `helpers.ts`:
    - `buildRoleGroups(smartDiff, files)` → `{ role, files: PrFile[] }[]` in the response order. Files inside a group are sorted by their index in `files` (GitHub order). Paths missing from the response go to core, so a file is never dropped.
    - `countFilesWithFindings(groupFiles, findings)`.
  - `constants.ts` has `ROLE_META: Record<SmartDiffRole, { labelKey; descKey; color; defaultOpen }>` with colours core `--accent`, tests `--ok`, wiring `--warn`, docs `--info`, boilerplate `--text-muted`. `defaultOpen` is false for docs and boilerplate.
  - `RoleGroup`:
    - The header is a real `<button aria-expanded>` with a chevron, colour square, label, description, a `● N` counter in `--crit` when N > 0 (always shown, not only when collapsed), and `t("smartDiff.filesCount")`.
    - The body is `<DiffViewer files commenting findings>`.
    - Groups with 0 files are not rendered (user decision); the test PR has all five roles, so P1.1 is still visible.
    - The header is `position: sticky; top: var(--pr-header-h, 0px); zIndex: 4; background: var(--bg-primary)`.
  - When no `kind === "review"` review exists, a one-line `reviewNotRun` notice (muted, `Icon.Sparkles`) renders above the groups instead of counters (P3.3).
- Rules / skills: frontend-architecture (route `_components`, nested `_components`, pure helpers beside the component; server state is not copied into state); react-best-practices (`{n > 0 && …}`, no render factories, components under 200 lines); client AGENTS (no hardcoded text; clickable header = real button).
- Tests: `helpers.test.ts` (GitHub order inside a group, missing path → core, files-with-findings counts files, not findings). `DiffTab.test.tsx` uses `vi.mock` on `@/lib/hooks/reviews` and `@/lib/hooks/core` (pattern: `FindingsPanel.test.tsx:7`) and covers these flows:
  - five group headers in order (fixture has a file of every role), an empty role renders no header, docs and boilerplate `aria-expanded=false`, expanding boilerplate reveals `pnpm-lock.yaml`
  - a core group counter of 2 for 2 files with 3 findings, a file dot, the FindingCard title under the line, Accept calls `mutate` with `{ findingId, action: "accept", prId }`
  - Original order lists paths in `files` order
  - Hide comments removes the card
  - no reviews shows the `reviewNotRun` text and no counter
- Done when: the client checks are green.

### Step 9 — Sticky offset + page wiring (client)
- Files: modify `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` (pass `repoFullName` and `headSha={pr.head_sha}` to `DiffTab`), `client/README.md` (the PR detail row lists `GET /pulls/:id/smart-diff`).
- Change: the PR header is already sticky at `top: 0; zIndex: 5` (`PrDetailHeader/styles.ts:5`). Group headers must stick below it. `PrDetailHeader` gets a `ref` and an effect with a `ResizeObserver` that writes `--pr-header-h: <height>px` on `el.parentElement` (the shared ancestor of the header and the tab content). The effect is guarded with `typeof ResizeObserver !== "undefined"` (jsdom), and it disconnects on cleanup.
- Rules / skills: react-best-practices (an effect only for the external DOM/observer, with cleanup).
- Tests: the existing PrDetailHeader and page tests still pass. Sticky behaviour is checked by hand in the browser.
- Done when: the client checks are green. In `pnpm dev`, scrolling a long Files changed tab keeps the current group header visible right under the PR header.

### Step 10 — Close out (docs)
- Files: modify `specs/09-smart-diff.md` (`Status: done`), `specs/README.md` (the index line becomes done), and the INSIGHTS files listed under "Insights to record" (via the `engineering-insights` skill).
- Done when: `./scripts/check-changed.sh` is green for server and client.

## Contracts & migrations
- Shared contracts sync: yes. `contracts/brief.ts` (`SmartDiffRole`): edit the server copy, then `./scripts/shared-contracts.sh sync`.
- Schema change + `pnpm db:generate`: no. It reads the existing `pull_requests`, `pr_files`, `agent_runs`, `reviews` and `findings` tables.
- Spec `Status` update: yes (in progress in Step 1, done in Step 10).

## Verification
| Package | Checks (from routing.json) |
|---|---|
| server | `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm arch` (+ `pnpm test:integration` for `smart-diff.it.test.ts`) |
| client | `pnpm typecheck` · `pnpm lint` · `pnpm test` |

Plus extra checks: `./scripts/shared-contracts.sh check`. Needs Postgres: yes (Docker, for the `.it.test.ts`).
All of the above in one command: `./scripts/check-changed.sh`.

## Insights to record
- `server/INSIGHTS.md` · Codebase Patterns — the glob matcher now lives in `modules/_shared/glob.ts` (diff-filter re-exports it). A classifier pattern for a file name needs a `**/` prefix, because a bare literal is an exact root path. (Where: `src/modules/_shared/glob.ts:<compilePattern line>`)
- `server/INSIGHTS.md` · Codebase Patterns — Smart Diff's `finding_lines` use the same latest-round rule as the PR list, through `pulls/index.ts` exports. (Where: `src/modules/smart-diff/service.ts:<line>`)
- `client/INSIGHTS.md` · Codebase Patterns — `components/diff-viewer` takes findings through a `renderFinding` slot, because lint forbids importing `src/app` (FindingCard). (Where: `src/components/diff-viewer/findings.ts:<line>`)
- `client/INSIGHTS.md` · Codebase Patterns — the comments toggle defaults to "shown when the latest round has findings", so a clean diff stays the default without a review. (Where: `DiffTab.tsx:<line>`)
- `client/INSIGHTS.md` · Codebase Patterns — sticky elements under the PR header use `var(--pr-header-h)`, published by `PrDetailHeader`. (Where: `PrDetailHeader.tsx:<line>`)

<!-- implementer-brief:end -->

## Context read
- `hw/L03/hw3-task.md` — task, acceptance criteria and the final user decisions (GitHub order, `e2e/README.md` → tests, derived tests/docs roles, the rest of the deviations).
- `client/docs/design/src/diff.jsx:20-26,71,120,146-159,195,197` — ROLE map (3 roles), severity words, stripe, file dot in `--crit`, group counter only when collapsed, boilerplate collapsed, alphabetical Original order.
- `client/INSIGHTS.md:253` — where the design and the task disagree, the task wins. `:127` — invalidate through the key factory. `:86` — a count inside a button's name.
- `server/INSIGHTS.md:77` — "latest review" means the latest batch round. `:204` — `ports.ts` declares structural types. `:211` — matcher semantics (a bare literal is an exact path). `:223` — sharing across modules. `:294` — the glob-in-JSDoc gotcha. `:316` — typecheck skips `test/**`, so run the tests. `:329` — precedent for a repository reading tables another module owns.
- `server/src/modules/reviews/diff-filter.ts:25-82` — the matcher to move. `server/src/modules/pulls/{cost.ts:34,findings.ts:25,index.ts,repository.ts:168-214}` — round helpers and queries.
- `.claude/skills/onion-architecture/assets/dependency-cruiser.cjs` — the `OUTER_IN_MODULE` regex only matches top-level module files, so a nested `reviews/smart-diff/` module would be misclassified. That is why the plan uses a separate `modules/smart-diff/`.
- `client/src/components/diff-viewer/{FileCard,CodeLine,DiffViewer,OutdatedComments}.tsx`, `comments.ts` — anchors, `keysForLine`, `partitionThreads`, the outdated block style.
- `client/src/app/repos/[repoId]/pulls/[number]/{page.tsx,_components/DiffTab,FindingCard,FindingsPanel,PrDetailHeader/styles.ts:5}`.
- `client/src/lib/hooks/reviews.ts:81-99,187`, `query-keys.ts:24-32`, `FindingsPopover/helpers.ts:14`.
- `.claude/skills/frontend-architecture/references/devdigest.md` — lint blocks `components/` → `src/app`.

## Affected modules
| Package | Path | Ring / layer | Change |
|---|---|---|---|
| server | `src/vendor/shared/contracts/brief.ts` | core | enum 3 → 5 |
| server | `src/modules/_shared/glob.ts` | application (pure) | moved matcher |
| server | `src/modules/smart-diff/*` | new slice | classifier, builder, ports, service, repository, routes |
| server | `src/modules/pulls/index.ts` | public surface | export the 2 pure helpers |
| server | `src/platform/container.ts`, `src/modules/index.ts` | composition | getter + registration |
| client | `src/lib/*` | shared lib | helper promotion, key, hook, refresh |
| client | `src/components/diff-viewer/*` | chrome | findings slot |
| client | `pulls/[number]/_components/DiffTab`, `PrDetailHeader`, `page.tsx` | route | groups, toggle, sticky |
| client | `messages/en/prReview.json` | i18n | `smartDiff` keys |

## Constraints honored
| Rule | Source | How the plan respects it |
|---|---|---|
| Imports point inward only; routes → service → repository | onion SKILL; `server/AGENTS.md` | pure helpers + ports; repository in the outer ring; thin route |
| Cross-module access only through index/types | depcruise `no-cross-module-internals` | `pulls/index.ts` exports; `smart-diff/index.ts` for L08 |
| Contracts edited on the server, then synced | root AGENTS "Cross-package rules" | Step 2 |
| DB test → `.it.test.ts` | root AGENTS "Naming" | `smart-diff.it.test.ts` |
| i18n in `messages/en/<camelCase>.json` | root AGENTS | `prReview.json` → `smartDiff` |
| Components never fetch; keys from the factory | `client/AGENTS.md` | `usePrSmartDiff`, `keys.pr.smartDiff` |
| `components/` must not import `src/app` | client eslint (devdigest.md Q3) | `renderFinding` slot |
| No migration hand-edits; no schema change | root AGENTS "Do not touch" | read-only feature |

## Design notes
**Patterns (matcher dialect; the check order is the list order):**
- boilerplate: `*.lock`, `**/pnpm-lock.yaml`, `**/package-lock.json`, `**/yarn.lock`, `**/dist/**`, `**/build/**`, `**/__snapshots__/**`, `*.snap`, `*.generated.*`, `*.min.js`, `*.g.dart`, `*.freezed.dart`, `*.gr.dart`, `*.mocks.dart`, `*.gen.dart`, `**/generated/**`
- tests: `**/*.test.ts`, `**/*.test.tsx`, `**/*.it.test.ts`, `**/*.spec.ts`, `**/*.spec.tsx`, `**/*_test.dart`, `**/test/**`, `**/tests/**`, `**/__tests__/**`, `**/integration_test/**`, `e2e/**`
- wiring: `**/index.ts`, `**/index.js`, `*.config.*`, `tsconfig*.json`, `.eslintrc*`, `.env*`, `docker-compose*.yml`, `.github/**`, `.claude/**`
- docs: `**/*.md`, `**/docs/**`, `README*`, `CHANGELOG*`, `LICENSE*`

Deviations from the course list: directory patterns match at any depth (this repo has package subfolders), a Dart codegen and `_test.dart` block is added (the product is Flutter-first, spec 07), and `LICENSE*` replaces `LICENSE` so it matches at any depth.

**Role text:**
- core "Core logic" — "The substance of the change — review closely"
- tests "Tests" — "Checks the change — skim for coverage"
- wiring "Wiring" — "Hooks the core into the app"
- docs "Docs" — "Explains the change — read if needed"
- boilerplate "Boilerplate" — "Generated / mechanical — skim"

**Design deviations (record them in the spec):**
1. tests and docs roles, labels and colours are derived (the design has 3 roles).
2. Original order = GitHub `PrFile[]` order, not `localeCompare` (`diff.jsx:197`).
3. File expand rule = `AUTO_EXPAND_MAX_LINES`, not "has findings" (`diff.jsx:85`). Groups: docs and boilerplate collapsed, the design collapses only boilerplate (`:195`).
4. The group counter is always visible when > 0; the design shows it only when collapsed (`:157`).
5. The comment anchors to `RIGHT:start_line`, not to the last cited line (`:88-90`).
6. The inline comment is the app's `FindingCard`; its collapsed header is the one-line state (the design uses X to hide).
7. Out-of-patch block uses the `OutdatedComments` style.
8. The GitHub comments toggle also hides finding comments.
9. Sticky group header.
10. `reviewNotRun` notice.
11. The file card keeps the GitHub comment counter next to the dot.
12. Empty groups are hidden (the design likewise lists only groups that have files).
13. Severity label is a static span, not a toggle button.

**One finding source on the client:** counters, dots and comments all come from `latestRoundFindings(usePrReviews)`, so they can never disagree and they refresh with the reviews query. The server's `finding_lines` satisfy the contract and L08, but the UI does not read them. Dismissed or accepted findings still count and show, muted by FindingCard.

**Why a separate module:** depcruise's outer-ring regex only knows top-level module files. `reviews/smart-diff/repository.ts` would be classified as application code importing `src/db`, which is an error.

**Alternatives rejected:**
- Putting the route in the pulls module: less plumbing, but it mixes a lesson feature into the PR-list module and hides the L08 surface.
- A client-side classifier: it would duplicate rules the server needs for L08.

## Risks & open questions
- `pr_files` has no order column and `persistedDetail` has no `ORDER BY`, so the server's in-group order is arbitrary. The client re-sorts by GitHub order, and the server order is not guaranteed.
- Smart-diff reads persisted `pr_files`. If `GET /pulls/:id` refreshes the files after the smart-diff fetch, new paths fall back to core until the next refetch. The helper never drops a file.
- The comments-toggle default changes behaviour only for PRs that have findings. Say so if GitHub comments must stay hidden even then; the fix is one line.
- The sticky offset assumes `PrDetailHeader`'s `parentElement` is the ancestor that the tab content inherits CSS variables from. Verify this in the browser (Step 9). If it fails, set the variable on `document.documentElement` instead.
- Whether `Button` from `@devdigest/ui` passes `aria-pressed` through: it spreads `...rest` (`primitives/Button.tsx:21,70`), so it should. Confirm at implementation time.
- `--ok` / `--info` are assumed to exist in `client/src/vendor/ui/styles.css` (grep found the tokens). The hw3-task decision names them.
- The `e2e/specs/05-pr-diff.flow.json` flow expects `src/config.ts` to be visible. It is core, open by default, and also covered by the Original fallback. Run `./scripts/e2e.sh` once if time allows.
- The deprecated `largeTitle` / `largeBody` / `findingLines` / `groupedByRole` keys stay unused (the split banner is out of scope). Do not delete them.

## Handed off
- Architecture reviewer:
  - the smart-diff service importing `../pulls/index.js`, which transitively loads `PullsRepository`
  - `_shared/glob.ts` and the re-export from diff-filter
  - the `renderFinding` slot
  - the `usePrRunTracking` transition effect duplicating `onRunsSettled`
  - the `ResizeObserver` writing a CSS variable on a parent element
- Security reviewer:
  - `GET /pulls/:id/smart-diff`: the uuid `IdParams`, workspace scoping in `pullInWorkspace` (404 with no leak), the response schema
  - finding text rendered through the kit's `Markdown` in FindingCard (existing path, no new raw HTML)
  - Accept/Dismiss still going through the existing `/findings/:id/(accept|dismiss)` route
