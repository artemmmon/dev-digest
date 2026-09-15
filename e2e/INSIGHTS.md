# Insights — e2e

Non-obvious findings about the browser suite. Cross-package findings go to `../INSIGHTS.md`.
Written via the `engineering-insights` skill: append-only, one entry per finding.

---

## What Works

## What Doesn't Work

## Codebase Patterns

### 2026-09-15 — `specs/` is shared with feature spec docs
The folder name was taken by the flows before the docs structure existed. The
runner filters `*.flow.json` (`run.ts` → `loadFlows`), so `*.md` specs there are
ignored at run time.

## Tool & Library Notes

## Recurring Errors & Fixes

### 2026-09-15 — Flows assume the seeded repo is the only one
Flows 02/04/05 follow the home redirect to the *first* repo. On a dev DB with
other imported repos they land on the wrong repo and fail — not a UI bug.
Use `../scripts/e2e.sh`, which boots an empty, freshly-seeded Postgres.

## Open Questions

## Session Notes
