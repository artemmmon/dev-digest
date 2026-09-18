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
