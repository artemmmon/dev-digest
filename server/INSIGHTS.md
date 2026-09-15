# Insights — server

Non-obvious findings about the API. Indexer findings go to `src/modules/repo-intel/INSIGHTS.md`,
cross-package ones to `../INSIGHTS.md`.
Written via the `engineering-insights` skill: append-only, one entry per finding.

---

## What Works

## What Doesn't Work

### 2026-09-15 — Refactoring leftovers
- `src/platform/{grounding,prompt,structured}.ts` only re-export `reviewer-core`.
- `src/platform/model-router.ts` is unused: `Provider` lacks `openrouter`, and
  `PromptCache`'s default clock `() => 0` means entries never expire.
- `ReviewService` builds its own `ReviewRepository` instead of `container.reviewRepo`.
- `polling` writes to the DB directly from the route (no service/repository).
- A comment in `modules/repos/service.ts` mentions `POST /repos/:id/reindex`; the route is `/resync`.

## Codebase Patterns

### 2026-09-15 — Queue state is in-memory only
The `jobs` table mirrors status but nothing re-enqueues `queued` jobs after a
restart. Reviews run fire-and-forget in-process; `reapStaleRuns()` cleans up
orphaned `running` runs on boot. Assumes a single API instance.

## Tool & Library Notes

## Recurring Errors & Fixes

## Open Questions

### 2026-09-15 — Failed background job may crash the process (unverified)
`JobRunner.enqueue()` returns `{ id, done }`; `done` rejects on failure but nobody
awaits or catches it. On Node 22 an unhandled rejection exits the process.
Repro idea: add a repo with a non-existent URL.
Where: `src/platform/jobs.ts`, `src/modules/repos/service.ts`.

### 2026-09-15 — `RunBus.complete()` doesn't release buffers
The docstring says "release buffers/emitters", but only the emitter is deleted;
`buffers`, `seq` and `completed` grow for the life of the process.
Where: `src/platform/sse.ts`.

## Session Notes
