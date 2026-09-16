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
Where: `scripts/e2e.sh` (web section), `client/next.config.mjs`.

### 2026-09-16 — e2e needs its own `npm install`
`e2e/` is npm-managed with no `node_modules` in a fresh clone, so `scripts/e2e.sh` brings
up the whole hermetic stack and only then dies with `sh: tsx: command not found`.
Run `cd e2e && npm install` once before the first run.
Where: `e2e/package.json`, `scripts/e2e.sh`.

## Codebase Patterns

### 2026-09-15 — `specs/` is shared with feature spec docs
The folder name was taken by the flows before the docs structure existed. The
runner filters `*.flow.json` (`run.ts` → `loadFlows`), so `*.md` specs there are
ignored at run time.

## Tool & Library Notes

### 2026-09-16 — `agent-browser` is a global CLI and is not installed on this machine
`npm install` inside `e2e/` is not enough: the runner shells out to a globally installed
binary (`npm i -g agent-browser && agent-browser install`, which also downloads Chrome for
Testing). Without it `../scripts/e2e.sh` cannot run at all, so flow changes have to be
reviewed by reading them — new steps in `04-pr-findings` were added this way **(unverified
locally; CI `e2e-web.yml` is the first real run)**.
Where: `e2e/run.ts` (`AGENT_BROWSER_BIN`), `e2e/README.md` ("Run locally").

## Recurring Errors & Fixes

### 2026-09-15 — Flows assume the seeded repo is the only one
Flows 02/04/05 follow the home redirect to the *first* repo. On a dev DB with
other imported repos they land on the wrong repo and fail — not a UI bug.
Use `../scripts/e2e.sh`, which boots an empty, freshly-seeded Postgres.

## Open Questions

## Session Notes
