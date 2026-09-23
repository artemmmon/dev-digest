# Insights — client

Non-obvious findings about the web app. Cross-package findings go to `../INSIGHTS.md`.
Written via the `engineering-insights` skill: append-only, one entry per finding.

---

## What Works

## What Doesn't Work

## Codebase Patterns

### 2026-09-15 — Local `vendor/shared` lags behind the server
The client copy lacks types the server already has (`AgentManifest`,
`AgentVersion`, `'openrouter'` in `LLMProvider.id`, …). Before using a contract,
compare with `../server/src/vendor/shared`. Details in `../INSIGHTS.md`.
Where: `src/vendor/shared/adapters.ts:77` — `LLMProvider.id` is still
`'openai' | 'anthropic'`; the server's copy has `'openrouter'` too.

### 2026-09-15 — Message namespaces for future lessons
`messages/en/` already contains `eval`, `blast`, `brief`, `memory`, `skills`, `ci`…
for screens that don't exist yet in the starter. They are placeholders, not dead files.
Where: `messages/en/` (e.g. `messages/en/blast.json:1`).

### 2026-09-16 — No overlay primitive in `@devdigest/ui`: build hover UI in the feature folder
There is no Popover/Tooltip/HoverCard/Portal and no positioning helper (a grep for
`createPortal|useFloating|getBoundingClientRect` over `src/` returns nothing). The house
pattern is `Dropdown`'s: a `position: relative` wrapper with a `position: absolute` child,
`zIndex`, and the `ddpop` animation from `vendor/ui/styles.css`. Copy that instead of
adding a dependency; keep the component in the feature's `_components/` unless a second
page needs it. Vertical flip is done by the caller passing a `placement` prop.
Where: `src/vendor/ui/kit/Dropdown.tsx:88` (the relative/absolute pattern),
`src/app/repos/[repoId]/pulls/_components/FindingsCell/`.

### 2026-09-16 — A count and a label in one button compute the name "2Warning"
When a button renders `<span>{n}</span>` next to a text label, the accessible name has no
separator, so `getByRole("button", { name: "2 Warning" })` and the e2e `find role button
--name` both miss. Give such buttons an explicit `aria-label={`${n} ${label}`}`; the e2e
flows target the pills by exactly that name.
Where: `src/app/repos/[repoId]/pulls/[number]/_components/SeverityFilterPills/SeverityFilterPills.tsx:42`,
`e2e/specs/04-pr-findings.flow.json`.

### 2026-09-18 — Every failed mutation toasts globally; forms opt out with `meta.silent`
`MutationCache.onError` toasts all mutation errors, so a component that also shows the error (inline
or its own `notify.error`) doubles it. Set `meta: { silent: true }` on a mutation whose screen shows
the error inline (e.g. `useAddRepo`); otherwise don't toast locally at all.
Where: `src/lib/providers.tsx:45`.

### 2026-09-18 — jsx-a11y is on, with a per-file baseline for the clickable-div debt
The three click/keyboard rules are errors except in the files listed under "Known a11y debt", where
they warn. Fixing a file (real `<button>`/`<Link>`) means deleting it from that list, so the rule
guards it from then on. Don't add new files to the list.
Where: `eslint.config.mjs:36`.

### 2026-09-18 — `renderWithIntl` mounts providers, so `container.firstChild` is not the component
The shared test helper wraps the UI in QueryClient, next-intl (all namespaces) and the toast host,
which renders its own element. "Renders nothing" assertions must query for the component's
content (`queryByPlaceholderText`, `queryByRole`), not check `container.firstChild`.
Where: `src/test/render.tsx:13`.

### 2026-09-19 — The shell lives in the root layout; pages only set the breadcrumb
`ShellFrame` (root layout) wraps every route except `/onboarding` in `AppShell`, so the sidebar and
palette survive navigation (verified: the same `<aside>` node after an SPA click). A page calls
`usePageCrumb([...])` — a layout effect keyed by the crumb's JSON, cleared on unmount — instead of
wrapping itself in `AppShell`. A new full-screen route goes in `BARE_ROUTES`.
Where: `src/components/app-shell/ShellFrame.tsx:12`, `src/components/app-shell/crumb.tsx:1`.

### 2026-09-19 — SSE contract: terminal `done` frame, Last-Event-ID resume
The server ends every run stream with an `event: done` frame and honours `Last-Event-ID`, so
`useRunEvents` lets EventSource reconnect on a drop (no replay of what it already has) and closes
only on `done` or when the browser gave up (readyState CLOSED, e.g. 404). Events are deduped by
`runId:seq`; changing the run ids opens/closes just the difference; `onSettled` fires once when the
last open stream ends (never on unmount), so callers pass fresh arrows freely.
Where: `src/lib/hooks/reviews.ts:224`, `../server/src/modules/reviews/routes.ts:101`.

### 2026-09-19 — Invalidate through the key factory; a settled run also refreshes the PR list
`src/lib/query-keys.ts` is hierarchical: `keys.pr.scope(id)` is a prefix of the PR's detail, reviews,
runs, active runs and comments. The PR list's COST/SCORE/FINDINGS describe the latest round, so run
settle/delete invalidates `keys.allPulls()` too. Cancelling a run now invalidates the live section.
Where: `src/lib/query-keys.ts:1`, `src/lib/hooks/reviews.ts:93`.

### 2026-09-19 — A clickable row = presentational container + a real control inside
`role="presentation"` + `rowClickProps` widens the mouse target; the `<button aria-expanded>`/`<Link>`
inside is what keyboards and screen readers use, and clicks on links/buttons/`data-row-ignore`
areas are left to them (no double toggle). Used by PRRow, FindingCard, PromptBlock, AgentCard;
plain buttons where the header holds no other control (TraceSection, ToolCallRow, FileCard).
Where: `src/lib/interactive.ts:1`.

### 2026-09-21 — A code-style editor is rows + a transparent textarea over them, in ONE scroll container
`MarkdownCodeEditor` renders the coloured lines as ordinary rows (gutter number + text) that set the height, and lays a
`color: transparent` `<textarea>` absolutely over the text column. Font, line height, `pre-wrap` and right padding must be
identical, so wrapped lines take the same height in both; then one scrolling parent moves everything and no scroll syncing is
needed (a textarea-as-scroller needs JS to sync the gutter and misaligns numbers on wrapped lines). Empty value: the
placeholder is drawn as the first row, because `::placeholder` inherits the transparent colour in Firefox.
Where: `src/app/skills/_components/SkillDetail/_components/ConfigTab/_components/MarkdownCodeEditor/styles.ts:35`.

### 2026-09-21 — Mutations that a caller follows with a selection resolve after the list refetch
`/skills` keeps the selection in `?skill=<id>`. `useCreateSkill` / `useDeleteSkill` return the `invalidateQueries` promise
from `onSuccess`, so the per-call `onSuccess` (select the new skill / fall back) runs once the list already has (or no
longer has) the row; otherwise the page briefly falls back to the first skill. Keep that if you add a mutation that navigates.
Where: `src/lib/hooks/skills.ts:34`.

### 2026-09-21 — `docs/design/` can be OLDER than the screens the user has in front of them
The export in `docs/design/src` showed the Skills Lab as list + one editor + Eval panel and no Versions/Stats/Preview tabs;
the user's current design had cards and five tabs. The sidebar was also missed: `chrome.jsx` groups nav into WORKSPACE /
SKILLS LAB / GLOBAL, we had put everything under WORKSPACE. Before building a screen: read `chrome.jsx` for the nav, and
ask whether the export is the latest (`scripts/unpack-design.mjs` re-imports it) — a missing tab is a red flag, not a scope cut.
Where: `docs/design/src/chrome.jsx:4`, `src/vendor/ui/nav.ts:22`.

### 2026-09-21 — Two `useSearchParamState` setters in one handler undo each other; use `useSearchParamsUpdate`
Each setter builds the next URL from the `search` snapshot of its own render, so `setSkill(id); setTab(null)` navigates
twice and the second drops the first. `/skills` moves `?skill=` and `?tab=` together with `useSearchParamsUpdate`.
Where: `src/lib/use-search-param-state.ts:45`.

### 2026-09-21 — Conventions page: scan report lives only in the mutation result; missing key arrives as `config_error`
`POST …/conventions/extract` returns the scan report, but `GET …/conventions` only has `last_scan`, so the report line is
read from `useExtractConventions().data` and disappears on reload by design. A missing provider key is the server's
`ConfigError` (HTTP 500, code `config_error`), not a 4xx; the page maps that code, `scan_in_progress` (409) and
`network_error` to their own messages and shows the server's text otherwise. Scan and skill mutations are `meta.silent`
because the page renders the error inline. Rejected candidates are removed from the cache optimistically and never returned by GET.
Where: `src/lib/hooks/conventions.ts:28`, `src/app/repos/[repoId]/conventions/_components/ConventionsView/constants.ts:13`.

### 2026-09-21 — ConfirmDialog belongs OUTSIDE a clickable card; some `window.confirm` calls stay on purpose
React events bubble through the component tree, not the DOM: a `ConfirmDialog` rendered inside a `rowClickProps` card sends a
click on its backdrop or text up to the card (opens the agent / selects the skill). Render it as a sibling of the card element
(`<>card + dialog</>`, or inside the `<li>` next to the card `<div>`). It is mounted while the question is open and locks
Escape/X/Cancel while `pending`. Replaced: skill delete (card + detail), agent delete, version restore. Still native on purpose:
PR run deletes (`FindingsTab`, `ReviewRunAccordion`), repo remove (`useShellContext`), and the "discard unsaved changes" guard on
the `/skills/<id>` back link, which needs a synchronous answer inside a `<Link>` click.
Where: `src/components/confirm-dialog/ConfirmDialog.tsx:1`, `src/app/skills/_components/SkillGrid/_components/SkillCard/SkillCard.tsx:87`.

### 2026-09-21 — Agent Skills tab: the list is always enabled-first, and every reorder guard lives in `helpers.ts`
`orderedBindings` sorts enabled bindings, then disabled ones, then never-bound skills, so the first save after opening the tab
persists the normalized order. `moveBindingTo` refuses any move where either end is disabled (drag, drop and ArrowUp/Down all go
through it); `setBindingEnabled` re-inserts the row at the end of the enabled block (on) or the start of the disabled block (off).
The component still skips `preventDefault` on `dragover` of a disabled row (so browsers refuse the drop) AND guards `onDrop`,
because jsdom's `fireEvent.drop` fires regardless. Disabled rows render a non-focusable grip stand-in, not a button.
Where: `src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/helpers.ts:35`.

### 2026-09-21 — Mock `@/lib/hooks/skills` with `importOriginal` in tests that mount the import dialog
`SkillsListView` mounts `ImportSkillModal` on demand, and that modal calls its own hooks (`usePreviewSkillImport`, and the URL one).
A full `vi.mock` factory breaks every time a hook is added to the modal ("No export defined on the mock"). Spread the original and
override only the hooks the test drives; the real ones run over the `renderWithIntl` QueryClient.
Where: `src/app/skills/_components/SkillsListView/SkillsListView.test.tsx:37`.

### 2026-09-21 — `/skills` is a grid now; `/skills/new` and old `?skill=new` links go to `?create=1`
`/skills?skill=<id>` opens the preview drawer (a stale id opens nothing — no fallback to the first skill any more),
`/skills?create=1` opens `CreateSkillModal`, `/skills/<id>` is the page with the tabs (`?tab=versions` keeps its key; the label is
"Versioning"). `SkillDetail` no longer has a draft mode. The e2e flow `10-skills.flow.json` follows this layout.
Where: `src/app/skills/_components/SkillsListView/SkillsListView.tsx:22`, `src/app/skills/new/page.tsx:5`.

### 2026-09-21 — Pages without `:repoId` show the first repo in a fresh browser profile
`RepoProvider` resolves the active repo as URL path > `localStorage["dd-repo"]` > first repo from the API. On `/skills`,
`/agents` and `/settings/*` a clean profile (Playwright, e2e, a demo recording) therefore shows the seeded `acme/payments-api`
in the sidebar, even right after visiting another repo by URL: a visit by URL does not write `dd-repo`. Anything that needs a
fixed repo off the repo routes must seed the key first (`context.addInitScript(() => localStorage.setItem("dd-repo", id))`),
as `hw/L02/demo/scenes.mjs` does.
Where: `src/lib/repo-context.tsx:48`.

### 2026-09-23 — A chip inside `FileCard`'s `<button>` header widens its accessible name, not a problem here
The new per-file language chip (`fileChip`, `components/diff-viewer/helpers.ts`) renders as a
`<span>` between the file icon and the path, inside the same `<button>` as the whole header
(`FileCard.tsx`). The button's accessible name is the concatenation of all its text content, so
it becomes e.g. `dart src/main.dart +4 −0` instead of just the path — harmless (still names the
file), but worth knowing before adding a `title`/tooltip to a chip elsewhere inside a clickable
row: it does NOT override the name, it just prepends visible text to it.
Where: `src/components/diff-viewer/FileCard/FileCard.tsx:64`.

## Tool & Library Notes

### 2026-09-17 — The "no bare fetch" lint rule needs exactly one exception
`no-restricted-globals` on `fetch` enforces the house rule that components go through a
hook, but `apiFetch` IS the seam, so it trips on itself. Keep the single
`eslint-disable-next-line` there rather than narrowing the rule by path — the disable
comment is the documentation that this is the one allowed call site.
Where: `src/lib/api.ts:26`, `eslint.config.mjs:38`.


### 2026-09-15 — Tailwind v4 scans every text file under client/, docs included
Automatic source detection picks up any non-gitignored file, so the design export in
`docs/design` (JSX + bundled HTML) added 31 files / ~800 class candidates (oxide `Scanner`:
3761 vs 2973). Non-source text files under `client/` need an `@source not "<path>"` line.
Where: `src/app/globals.css:9` (`@source not "../../docs"`).

### 2026-09-18 — `pnpm build` breaks a running `pnpm dev`
Both write `client/.next`. After a build, the dev server answers every page with 500 and logs
`Cannot find module './vendor-chunks/…'`. Stop `next dev`, `rm -rf .next`, start it again. To check a
build while dev runs, don't — or run it from a separate worktree.
Where: `package.json:7`.

### 2026-09-18 — Local pnpm 12, CI pnpm 10: check the lockfile before pushing
`pnpm add` here runs pnpm 12 (corepack); CI installs with pnpm 10 `--frozen-lockfile`. Both write
`lockfileVersion: '9.0'`, but prove it before a push: copy `package.json` + `pnpm-lock.yaml` to a
temp dir and run `npx pnpm@10 install --frozen-lockfile --lockfile-only`. Running pnpm 10 in
`client/` itself fails — `node_modules` is linked from pnpm 12's store (v11).
Where: `pnpm-lock.yaml:1`.

### 2026-09-19 — `NEXT_DIST_DIR` keeps a build from breaking a running `next dev`
`next.config.mjs` reads `NEXT_DIST_DIR` (default `.next`), so `NEXT_DIST_DIR=.next-build pnpm build`
verifies a production build while dev keeps its cache (`scripts/e2e.sh` does the same with
`.next-e2e`). Next rewrites `tsconfig.json`'s `include` for the alternate dir — `git checkout
tsconfig.json` afterwards. Also: don't put zod in `src/config/env.ts`; it is in every page bundle
(+12 kB first-load JS).
Where: `next.config.mjs:9`, `src/config/env.ts:1`.

### 2026-09-21 — The kit's `Markdown` had no heading or list styles; a skill body rendered as flat text
The global reset in `vendor/ui/styles.css` zeroes `h1–h4` margins and list styles, and the `Markdown` primitive only
styled `p`, `strong`, `code` and `a`. Findings never needed more; a skill body (a whole document) did. Block styles now
live under `.dd-md`; add new markdown elements there, not as inline styles in the component.
Where: `src/vendor/ui/styles.css:222`.

### 2026-09-21 — `File.arrayBuffer()` does not exist in jsdom; read uploads with `FileReader`
The import dialog first used `await file.arrayBuffer()`: fine in browsers, but every jsdom test showed "could not be
read". `readFileAsBase64` uses `FileReader.readAsArrayBuffer`, which both have. Base64 is built in 32 KB chunks so
`String.fromCharCode(...bytes)` does not overflow the stack on a 2 MB zip.
Where: `src/app/skills/_components/ImportSkillModal/helpers.ts:24`.

### 2026-09-21 — Native HTML5 drag-and-drop for the skill order: what it needs and what it can't do
`SkillsTab` reorders with `draggable` rows, no library. `onDragStart` calls `dataTransfer.setData` (Firefox starts no
drag without it) and guards `dataTransfer` (jsdom has none); `onDragOver` must `preventDefault()` or `drop` never fires.
Indexes are positions in the FULL bindings list, so a drop is right while the filter hides rows. No touch support on
mobile: the ↑/↓ buttons are the fallback and the keyboard path. `userEvent` cannot drag — tests use `fireEvent`.
The browser-pane `left_click_drag` does not start a native drag either (it sends plain mouse events); dispatch
`DragEvent`s with a `DataTransfer` from `javascript_tool` to check it in a real browser.
Where: `src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx:108`.

### 2026-09-21 — Supersedes "Native HTML5 drag-and-drop for the skill order": the ↑/↓ buttons are gone
The Skills tab is now one list of all skills (checkbox = used by the agent). The keyboard path is the grip, a real
`<button aria-label="Move <name>">`: ArrowUp/ArrowDown call `moveBinding`. Moving a row down makes React re-insert the
focused node, which can blur it **(unverified: not tested without the fix)**, so `SkillsTab` re-focuses the grip in a layout effect after each keyboard move.
The rest of the DnD notes (setData for Firefox, `preventDefault` on dragover, `fireEvent` in tests) still hold.
Where: `src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx:42`.

### 2026-09-21 — Per-call `mutate(..., { onSuccess })` callbacks are dropped when the component remounts
SkillDetail is keyed by `id:version`, so a save that changes the body (or a restore) remounts it before the per-call callbacks
run, and the "Saved …" toast and draft reset never happened. Use `mutateAsync(...).then(...)` (a promise settles regardless of
the observer) and the module-level `notify` toast; errors are toasted by the MutationCache, so end the chain with `.catch(() => {})`.
Where: `src/app/skills/_components/SkillDetail/SkillDetail.tsx:76`.

### 2026-09-21 — Import dialog: the URL tab reuses the file flow's preview step and only changes `source`
`ImportSkillModal` keeps one `picked` preview and a `source` state (`imported_file` | `imported_url`) set by whichever tab produced it;
the review step (`SkillForm`, trust note, ignored files) is shared and saving sends that `source`. Both preview hooks are
`silent` so the modal shows the server's 422 message inline (`ApiError.message`); `new ApiError(message, status, code)` — message
comes FIRST, easy to swap in tests. The kit `Tabs` renders plain `<button>`s (no `role="tab"`), so tests use `getByRole("button")`.
Where: `src/app/skills/_components/ImportSkillModal/ImportSkillModal.tsx:105`, `src/lib/hooks/skills.ts` (`usePreviewSkillImportUrl`).

## Recurring Errors & Fixes

### 2026-09-16 — The PR-list table card clipped anything absolutely positioned in a row
`s.tableCard` was `overflow: "hidden"` (for the rounded corners), so the FINDINGS hover
popover rendered but was invisible below the row. Set it to `overflow: "visible"` — the
design export does the same (`docs/design/src/screen_dashboard.jsx:111`); rows have their
own borders, so nothing else needed clipping.
Where: `src/app/repos/[repoId]/pulls/styles.ts:86` (`tableCard`).

### 2026-09-16 — A margin gap under a hover popover makes it unreachable
`FindingsPopover` sat `marginTop: 8` below its trigger. Margins are not hit-testable, so
that strip belongs to neither element: the pointer crosses it, `mouseleave` fires on the
trigger and the popover unmounts before it can be entered. Put the offset in the PADDING of
an invisible positioned wrapper around the card instead, and delay the close ~150ms for the
diagonal approach (the trigger is ~80px wide, the card 360px). Worth knowing: the popover
is a DOM child of the trigger, and `mouseenter`/`mouseleave` treat descendants as part of
the element — so landing on the card re-fires the trigger's `onMouseEnter` and cancels the
pending close, no handlers needed on the popover itself. `Dropdown.tsx:89` has the same
dead gap via `top: calc(100% + 6px)`, but it is click-triggered so it never bites.
Where: `src/app/repos/[repoId]/pulls/_components/FindingsCell/FindingsCell.tsx:57`
(`CLOSE_DELAY_MS`),
`src/app/repos/[repoId]/pulls/_components/FindingsCell/_components/FindingsPopover/styles.ts:11`
(`anchor`) and `:19` (`card`).

### 2026-09-19 — `pnpm lint` fails with thousands of errors after a local e2e run
`./scripts/e2e.sh` builds into `client/.next-e2e/` (git-ignored via `.next-*/`), but the ESLint ignore list only
has `.next/**`, so `eslint .` lints the generated bundle (~2,300 errors, none in `src/`). CI never has the
directory, so it only bites locally, and `pr-self-review` reports it as a failed `lint` check. Fix: add
`".next-*/**"` to `ignores`, or delete `client/.next-e2e/` first (`eslint . --ignore-pattern ".next-*/**"` is clean).
Where: `client/eslint.config.mjs:13`.

### 2026-09-19 — Supersedes "`pnpm lint` fails with thousands of errors after a local e2e run"
Fixed: `.next-*/**` is now in the ESLint `ignores`, so a clone that has run `./scripts/e2e.sh` lints clean.
Where: `eslint.config.mjs:15`.

### 2026-09-21 — `next dev` with `NEXT_DIST_DIR` rewrites `tsconfig.json` and `next-env.d.ts`
Running a second dev server on an alternate dist dir (to leave `.next` alone) made Next add its `types` include to
`tsconfig.json` (reformatting the whole file) and point `next-env.d.ts` at the alternate dir. Neither is part of the
change: stop the server, `git checkout tsconfig.json next-env.d.ts`, delete the alternate dist dir before committing.
Where: `next-env.d.ts:3`.

### 2026-09-21 — A `useMutation` fired from a mount effect hangs in Strict Mode; don't guard it with a ref
`mutate()` in a `useEffect` (the Create-skill modal drafts on open) ran once, then Strict Mode's simulated unmount removed the
observer from that mutation and the remount never re-attached it: `isPending` stayed true forever in `next dev` (unit tests
don't use Strict Mode, so they passed). An "already started" `useRef` guard makes it permanent. Let the effect fire twice
(a duplicate read-only POST in dev) or use `useQuery` for a read; also freeze the input ids (`useState(initial)`), otherwise a
parent passing a fresh array each render re-fires the effect on every render.
Where: `src/app/repos/[repoId]/conventions/_components/ConventionsView/_components/CreateConventionSkillModal/CreateConventionSkillModal.tsx:58`.

### 2026-09-21 — `isLoading` is false for a query whose retry is paused; use `isPending` for "no data yet"
While the tab is hidden (or the browser pane is in the background) TanStack pauses a failing query's retries: `isFetching`
is false, so `isLoading` (= pending && fetching) is false and `isError` is not yet true. A page branching on
`isLoading` → `isError` → content then rendered its empty state under a failing API. Branch on `isPending` for the skeleton.
Where: `src/app/repos/[repoId]/conventions/_components/ConventionsView/ConventionsView.tsx:189`.

## Open Questions

## Session Notes

### 2026-09-15 — Design reference added
Unpacked the Claude Design export into `docs/design` and excluded `docs/` from Tailwind
scanning.
Where: `../scripts/unpack-design.mjs` (repo root, not `client/`), `src/app/globals.css:9`.

### 2026-09-16 — Findings severity counters, filter and PR-list popover (L01)
Added `src/lib/severity-counts.ts`, the shared `SeverityCounts` cluster, `SeverityFilterPills`
in the `FindingsPanel` toolbar, and the FINDINGS list column with a lazy hover popover.
Counts are taken over the post-"hide low confidence" set so a pill's number always equals
the number of cards under it.
Where: `src/lib/severity-counts.ts:21` (`countBySeverity`), spec `../specs/02-findings-severity.md`.

### 2026-09-19 — Phase 4 (client): architecture, a11y, i18n
Shell in the layout, query-key factory + invalidation fixes, `useRunEvents` rewrite, slimmer
FindingsTab/page, jsx-a11y baseline removed (all clickable divs fixed), hardcoded strings moved to
messages (home, addRepo, header, diff, toast…), per-segment titles, env module, deep relative
imports → `@/`.
Where: `src/app/layout.tsx:36`.

### 2026-09-21 — HW2 demo filming
The scan hint and the ReScan dialog now say "a few minutes" instead of "up to a minute" (measured 52-178 s); the view test
matches the new wording. Added the fresh-profile repo fallback note under Codebase Patterns.
Where: `messages/en/conventions.json:25`.
