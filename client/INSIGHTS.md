# Insights — client

Non-obvious findings about the web app. Cross-package findings go to `../INSIGHTS.md`.
Written via the `engineering-insights` skill: append-only, one entry per finding.

---

## What Works

## What Doesn't Work

### 2026-09-23 — `next build`/`next dev` (webpack AND Turbopack) fail to resolve `@devdigest/shared`'s barrel the FIRST time a client file imports a real value from it
Every existing client import of `@devdigest/shared` is `import type {...}` (`src/lib/types.ts`,
`src/lib/hooks/{skills,conventions,reviews}.ts`) — type-only imports get elided before bundling, so
they never actually ask Next's bundler to resolve the barrel at runtime. `components/diff-viewer/
helpers.ts` imports `languageOf`/`isGeneratedPath` as real values — the first runtime import from
this barrel anywhere in the client — and both `next build` and `next dev` then fail with `Module not
found: Can't resolve './contracts/findings.js'` (+ `review-api.js`, `brief.js`, `knowledge.js`,
`trace.js` — always exactly these 5, always the barrel's first 5 `export *` lines, out of 13; not a
size or cross-import property of those 5 specifically, see below). Turbopack instead reports
`languageOf was not found … the module has no exports at all`, i.e. it treats the barrel's
`export *` re-exports as unresolvable too, just with different phrasing.
**Ruled out** (each independently reproduced/tested): the actual content of `languages.ts` or my
`platform.ts` edit (a bare pre-existing `import { Severity } from "@devdigest/shared"` in a throwaway
probe page reproduces the identical 5-file failure with ZERO of my files involved); system load/
concurrency (identical result under low load, 5 clean attempts); cross-file imports among the 5
(`trace.ts` has no incoming imports from other contracts and still fails; `platform.ts` imports
`knowledge.ts` directly and does NOT fail). It is deterministic and positional (barrel export order),
not content-dependent. A deep import bypassing the barrel
(`@devdigest/shared/contracts/languages.js`, using the `@devdigest/shared/*` wildcard tsconfig path)
does NOT work around it either — that specific alias form fails to resolve at all under webpack,
a second, independent gap.
**Status:** unresolved, needs real Next.js build diagnostics (`next build --turbopack`, upstream
issue search, or a maintainer with `NEXT_WEBPACK_LOGGING`) — out of scope for a feature PR. The
`Files changed` tab's language chip (spec 05) is the first feature to depend on a runtime import
from this barrel, so **verify `pnpm dev` actually serves that tab on your machine** before trusting
it works outside `vitest` (which resolves the same barrel fine — its own resolver, unaffected).
Where: `src/components/diff-viewer/helpers.ts:2`, `src/vendor/shared/index.ts` (barrel), `next.config.mjs`.

### 2026-09-23 — Supersedes "`next build`/`next dev` fail to resolve `@devdigest/shared`'s barrel the FIRST time a client file imports a real value from it" — confirmed root cause and fix
Root cause found: every relative import inside `vendor/shared` uses an explicit `.js` extension
(`export * from './contracts/findings.js'`, `import { Provider } from './knowledge.js'`, …) — required
for the SERVER copy, which `tsx`/Node run as real ESM (`NodeNext` resolution mandates the extension).
`tsc` (client `moduleResolution: "Bundler"`) and Vite/esbuild (vitest) both map `.js` → `.ts` for these
imports without complaint, so nothing caught it — but Next's webpack/Turbopack, in THIS Next 15.5.19
install, does not, and every existing client import of the barrel was `import type`, which is erased
before bundling, so no runtime import had ever reached this codepath before `diff-viewer/helpers.ts`.
Confirmed by a controlled test: stripping the `.js` extension from every relative import in a scratch
copy of `client/src/vendor/shared` (barrel + every contract file's internal cross-imports + `adapters.ts`)
made a real `pnpm dev` fully load the PR detail page's Files-changed tab (chip and all) — first
uncached load, no error, verified via the browser, not just curl. Restored to the synced state
afterward; NOT shipped as-is because it would silently diverge from the server's canonical copy on
every future sync.
**The real fix belongs in `scripts/shared-contracts.sh`**: teach `sync` to strip `.js` extensions from
relative-import specifiers ONLY in the copy it writes to `client/`, keeping the server's copy (and
Node's requirement) untouched — and teach `check` to compare after the same normalisation, so CI still
catches a real content drift without flagging this one intentional, mechanical difference. This is an
architecture decision (the two copies stop being literally byte-identical, though they stay
semantically identical), so it needs sign-off before implementing, not just for someone to hit next.
Where: `../scripts/shared-contracts.sh`, `src/vendor/shared/index.ts`, `../server/src/vendor/shared/contracts/platform.ts:2` (`import { Provider } from './knowledge.js'`, one of several internal `.js` cross-imports needing the same treatment).

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

### 2026-09-24 — `docs/design/src/screen_pr_detail.jsx`'s `RiskPillRow` has a `severity` field the real `RiskArea` contract doesn't
The mockup's `window.RISKS` items carry `{kind, title, severity, explanation, file_refs}` and
color the chip border by severity (`RISK_SEV`). The intent-layer spec's final `RiskArea`
contract (D13, user-decided 2026-09-24) is `{kind, label, origin: 'rule'|'model'}` — no
severity, no explanation, no file refs; the two chip producers (rule-derived + classifier)
never computed one. `IntentCard`'s risk chips are therefore plain `Badge`s (icon + label only,
no color-by-severity, no click-to-expand). Don't backport the mockup's severity styling without
first checking whether the shipped contract actually has the field.
Where: `docs/design/src/screen_pr_detail.jsx:21` (`RISK_SEV`), `src/vendor/shared/contracts/brief.ts`
(`RiskArea`), `src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/IntentCard/IntentCard.tsx`.

### 2026-09-23 — The Agent editor's Config tab always PUTs the full config; the Skill detail Config tab PUTs only what's dirty
Two forms that look alike save differently: `SkillDetail`'s ConfigTab diffs the draft
against the loaded skill (`changedFields`) and sends only the changed keys, so an
unrelated no-op save is a true no-op. The Agent editor's ConfigTab has no such diff — its
`save()` always builds and sends every field from local `useState`, unconditionally, on
every click. This matters for anything added to `AgentRecord` that isn't a plain scalar
(e.g. `applies_to: string[]`): the SERVER'S comparison, not the client's, is what decides
whether "nothing changed" actually bumps the version — see the `isConfigChange`/
`sameAppliesTo` entry in `server/INSIGHTS.md`. Don't assume adding a field to one form's
save payload is safe just because the other form's dirty-diffing would have protected it.
Where: `src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab/ConfigTab.tsx:46`
(`save`), `src/app/skills/_components/SkillDetail/SkillDetail.tsx:50` (`changedFields`, for contrast).

### 2026-09-24 — Reserve a grid cell for an unbuilt future card without a visible empty placeholder
The Overview tab's `IntentCard` is the left cell of a "two-column" grid whose right cell is
reserved for the L04 Blast Radius card (not built yet). A literal `1fr 1fr` template would
leave a blank box on the right today. `gridTemplateColumns: "repeat(auto-fit, minmax(320px,
1fr))"` collapses unused tracks: with one child it spans the full width now, and becomes a
real two-column layout the moment a second child is added later — no conditional markup,
no placeholder `<div>`.
Where: `src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/styles.ts:6` (`s.grid`).

### 2026-09-26 — The Smart Diff design mock disagrees with the HW3 task: the task wins
`docs/design/src/diff.jsx` (refreshed 2026-09-26) has only core/wiring/boilerplate roles and sorts "Original order" by
`path.localeCompare`; the task needs five roles (core → tests → wiring → docs → boilerplate) and GitHub's `PrFile[]` order.
Build to the task; the derived tests/docs labels and colours are listed in `hw/L03/hw3-task.md` (repo root).
Where: `docs/design/src/diff.jsx:20`, `docs/design/src/diff.jsx:197`.

### 2026-09-26 — `components/diff-viewer` takes findings through a `renderFinding` slot, not by rendering `FindingCard` itself
`components/` may not import `src/app` (client eslint boundary), and `FindingCard` lives under
`app/repos/[repoId]/pulls/[number]/_components/`. `DiffFindingApi.renderFinding(f)` (a prop, like the existing
`DiffCommentApi`) lets the route hand the viewer a render callback instead; `FileCard`/`CodeLine` only call it,
never import the card. Same pattern as `DiffCommentApi`'s `showComments`/`comments` split.
Where: `src/components/diff-viewer/findings.ts:11` (`DiffFindingApi`), `src/components/diff-viewer/FileCard/FileCard.tsx:150`.

### 2026-09-26 — The comments toggle defaults to "shown when the latest round has findings"
`DiffTab`'s visibility is one `override` state (`useState<boolean | null>(null)`, never toggled by hand
yet) plus a derived `show = override ?? findings.length > 0`. A PR with no findings keeps the old
hidden-by-default GitHub-comments behaviour; a PR whose latest review round has findings shows both
the comments and the findings without a click. The same `show` value drives both `DiffCommentApi.showComments`
and `DiffFindingApi.show`, so the two slots can never disagree.
Where: `src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx:61` (`show`).

### 2026-09-26 — Sticky elements under the PR header use `var(--pr-header-h)`, published by `PrDetailHeader`
`PrDetailHeader` is itself sticky at `top: 0`, and its height isn't static (title wrapping, the closed-PR
banner). It measures itself with a `ResizeObserver` (guarded with `typeof ResizeObserver !== "undefined"`
for jsdom) and writes `--pr-header-h: <height>px` on its own `parentElement` — the ancestor it shares with
the tab content — so a second sticky layer further down the page can `position: sticky; top: var(--pr-header-h,
0px)` without hardcoding an offset or prop-drilling a height value. Smart Diff's `RoleGroup` headers are the
first consumer.
Where: `src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx:56` (the effect),
`src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/RoleGroup/styles.ts:11` (the consumer).

### 2026-09-26 — Supersedes "Sticky elements under the PR header use `var(--pr-header-h)`, published by `PrDetailHeader`"
`PrDetailHeader` writing a CSS variable onto `el.parentElement` reached into AppShell-owned DOM (the
route returns a fragment, so the "parent" was whatever wrapped it) with no cleanup on unmount — an
implicit contract between two features caught by architecture review. The route now owns the
measurement: `page.tsx` renders one wrapper `<div>` around the header and the tab content, measures
the header with a small `useElementHeight(ref)` hook colocated in the route folder (still guarded for
jsdom's absent `ResizeObserver`), and sets `--pr-header-h` as an inline style on that wrapper.
`PrDetailHeader` no longer has an effect or a ref; it only renders its own sticky `s.root`. `RoleGroup`'s
consumer side (`top: var(--pr-header-h, 0px)`) is unchanged.
Where: `src/app/repos/[repoId]/pulls/[number]/useElementHeight.ts:8` (the hook),
`src/app/repos/[repoId]/pulls/[number]/page.tsx:52` (measures + sets the variable).

## Tool & Library Notes

### 2026-09-17 — The "no bare fetch" lint rule needs exactly one exception
`no-restricted-globals` on `fetch` enforces the house rule that components go through a
hook, but `apiFetch` IS the seam, so it trips on itself. Keep the single
`eslint-disable-next-line` there rather than narrowing the rule by path — the disable
comment is the documentation that this is the one allowed call site.
Where: `src/lib/api.ts:26`, `eslint.config.mjs:38`.

### 2026-09-24 — `@devdigest/ui`'s `Badge` has no `title`/`aria-label` pass-through
`Badge` (`vendor/ui/primitives/Badge.tsx`) only takes `children`, `icon`, `color`, `bg`,
`dot`, `mono`, `style` — no way to give the icon an accessible name distinct from the
visible label. `IntentCard`'s risk-area chips need one (the icon encodes `kind`; the label
is a low-trust server string, D13), so it wraps each `Badge` in a plain `<span title=…
aria-label=…>` combining the i18n `card.riskArea.<kind>` string with the label
(`"Authentication risk: <label>"`), instead of editing the vendored primitive for one
call site. Do the same rather than adding a `title`/`aria-label` prop to `Badge` for a
single consumer.
Where: `src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/IntentCard/IntentCard.tsx:88`
(`riskAreaMessageKey` chip wrapper), `src/vendor/ui/primitives/Badge.tsx:5`.


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

### 2026-09-23 — `renderWithIntl`'s `container` is never truly empty: `ToastProvider` always mounts its host div
Asserting "this component renders nothing" with `expect(container).toBeEmptyDOMElement()` fails
even for a component returning `null`, because `renderWithIntl` wraps every test in a `ToastProvider`
that renders a fixed-position `role="status"` div as a sibling — always present, whether or not any
toast has fired. Assert `expect(container).toHaveTextContent("")` (or query for the specific absent
element) instead of checking the whole container is empty.
Where: `src/test/render.tsx:22`, `src/components/repo-stack/RepoStackLabel.test.tsx`.

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

### 2026-09-26 — A mocked `api.get` in a hook test can receive one stray zero-arg call during teardown
Testing `usePrRunTracking`'s active-runs → 0 transition (mocked `../api` via `vi.mock` + `vi.hoisted`), a `QueryObserver`
unsubscribing mid-flight (when the test's `renderHook` tree unmounts while a refetch is still settling) calls the mocked
`api.get` once with no arguments; the call is real (traced through `tinyspy`'s `spy`/`mockCall`, not a false stack), but
its own async-stack frames point at Vitest's `callCleanupHooks`/`runTest`, not at any app code — a harness/teardown
artifact, not a bug in the hook. A mock that assumes every call has a string `path` (`path.endsWith(...)`) throws and
fails the test; guard it (`path?.endsWith(...)`) instead of chasing the caller further **(unverified: root cause in
Vitest/TanStack Query internals, not confirmed beyond the observed stack)**.
Where: `src/lib/hooks/reviews.test.tsx:181` (`usePrRunTracking` describe block).

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
