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
Where: `specs/09-pr-overview.flow.json:49`, `specs/04-pr-findings.flow.json:8`.

## Recurring Errors & Fixes

### 2026-09-15 — Flows assume the seeded repo is the only one
Flows 02/04/05 follow the home redirect to the *first* repo. On a dev DB with
other imported repos they land on the wrong repo and fail — not a UI bug.
Use `../scripts/e2e.sh`, which boots an empty, freshly-seeded Postgres.
Where: `specs/02-repo-pulls-detail.flow.json:6`, and the same first step in flows 04 and 05.

## Open Questions

## Session Notes
