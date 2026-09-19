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
