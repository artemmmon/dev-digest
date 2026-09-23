# Insights — e2e

Non-obvious findings about the browser suite. Cross-package findings go to `../INSIGHTS.md`.
Written via the `engineering-insights` skill: append-only, one entry per finding.

---

## What Works

## What Doesn't Work

### 2026-09-16 — `scripts/e2e.sh` breaks a running dev web server
The script starts its own `next dev -p 3100` from `client/`, so both servers write the
same `client/.next`. It overwrites the dev server's build manifest and then exits, leaving
:3000 serving chunk URLs that no longer exist (`Runtime ChunkLoadError: Loading chunk
app/repos/[repoId]/pulls/page failed`). Stop the dev web server first, or recover with
`rm -rf client/.next` + restart. A separate `distDir` for the e2e run would fix it properly.
Where: `../scripts/e2e.sh:148` (the `next dev -p $WEB_PORT` spawn), `../client/next.config.mjs`.

### 2026-09-16 — e2e needs its own `npm install`
`e2e/` is npm-managed with no `node_modules` in a fresh clone, so `scripts/e2e.sh` brings
up the whole hermetic stack and only then dies with `sh: tsx: command not found`.
Run `cd e2e && npm install` once before the first run.
Where: `package.json:8` (`test` shells out to `tsx`), `../scripts/e2e.sh:110`.

## Codebase Patterns

### 2026-09-15 — `specs/` is shared with feature spec docs
The folder name was taken by the flows before the docs structure existed. The
runner filters `*.flow.json`, so `*.md` specs there are ignored at run time.
Where: `run.ts:55` (inside `loadFlows`).

## Tool & Library Notes

### 2026-09-16 — `agent-browser` is a global CLI and is not installed on this machine
`npm install` inside `e2e/` is not enough: the runner shells out to a globally installed
binary (`npm i -g agent-browser && agent-browser install`, which also downloads Chrome for
Testing). Without it `../scripts/e2e.sh` cannot run at all, so flow changes have to be
reviewed by reading them — new steps in `04-pr-findings` were added this way **(unverified
locally; CI `e2e-web.yml` is the first real run)**.
Where: `run.ts:40` (`AGENT_BROWSER_BIN`), `README.md` ("Run locally").

### 2026-09-19 — Supersedes "`agent-browser` is a global CLI and is not installed on this machine"
Installed `agent-browser@0.38.1` (the CI pin) and ran `../scripts/e2e.sh`: 9/9 flows pass.
`npm i -g` puts the binary in `~/.npm-global/bin`, which is not on PATH in the Claude Code
shell — prefix it, as with Node 22.
Where: `README.md:52`, `../scripts/e2e.sh:25`.

### 2026-09-19 — `wait --text` matches rendered text: CSS `text-transform` counts
`wait --text` compares against `innerText`, case-sensitively, so a heading styled
`text-transform: uppercase` (table column heads, `SectionLabel`) must be waited for as
`FINDINGS` / `DESCRIPTION`. A step that clicks a list row must first `wait --text` for the
row's title: without it, `find text … click` fires while the list is still loading (this
is what the removed `wait --load networkidle` used to hide).
Where: `specs/09-pr-overview.flow.json:49`, `specs/02-repo-pulls-detail.flow.json:8`, `specs/04-pr-findings.flow.json:7`.

## Recurring Errors & Fixes

### 2026-09-15 — Flows assume the seeded repo is the only one
Flows 02/04/05 follow the home redirect to the *first* repo. On a dev DB with
other imported repos they land on the wrong repo and fail — not a UI bug.
Use `../scripts/e2e.sh`, which boots an empty, freshly-seeded Postgres.
Where: `specs/02-repo-pulls-detail.flow.json:6`, and the same first step in flows 04 and 05.

### 2026-09-21 — `agent-browser` clicks a sliding element where it was, not where it lands
`find role link click` computes the target's box once and clicks there, without waiting for
the element to stop moving. The kit `Drawer` slides in over 0.2 s (`ddslidein`, from
`translateX(100%)`), so a click right after `wait --text <drawer content>` hits empty footer
space: the drawer stays open, the URL never changes, and `wait --url` times out (CI run
35635507763, flow 10). Reproduced on a production build with Playwright: the "Open" link was
at x≈1575–1733 when its text appeared (viewport 1280, final x≈1173); a coordinate click there
did nothing, `locator.click()` (waits for stability) and a click after 300 ms both navigated.
Fix: a `["wait", "500"]` step after the drawer opens and before clicking inside it. Related:
`--name` is a case-insensitive substring by default, so a card named `x` also matches its
"Delete skill x" button — add `--exact` when a name is a prefix of another control's name.
Where: `specs/10-skills.flow.json:8-10`, `../client/src/vendor/ui/kit/Drawer.tsx` (animation),
`../client/src/vendor/ui/styles.css:296` (`@keyframes ddslidein`).

## Open Questions

### 2026-09-23 — A 2-character label is a bad `wait --text` target
The new per-file language chip (`client/src/components/diff-viewer/FileCard`) renders a short
label like `ts`. `wait --text` is a page-wide, case-sensitive substring match on `innerText`
(2026-09-19 entry above), so a 2-char target is at real risk of matching unrelated words
(`Results`, `Comments`, …) elsewhere on the same page — a pass that proves nothing. Skipped
adding a flow step for it; `FileCard.test.tsx` covers the chip precisely instead. If a flow
ever needs it, seed a PR file whose chip label is long/distinctive (`yaml`, `dart`), not `ts`/`js`.
Where: `specs/05-pr-diff.flow.json`, `../client/src/components/diff-viewer/FileCard/FileCard.tsx`.

## Session Notes
