# Insights — repo-intel

Non-obvious findings about the codebase indexer. Server-wide findings go to
`../../../INSIGHTS.md`, cross-package ones to `../../../../INSIGHTS.md`.
Written via the `engineering-insights` skill: append-only, one entry per finding.

---

## What Works

## What Doesn't Work

### 2026-09-30 — The persistent blast cap of 20 was global, not per symbol
`tryPersistentBlast` did `callers.slice(0, MAX_CALLERS_PER_SYMBOL)` on the rank-sorted list of ALL symbols, so one high-fan-out symbol used up the cap and lower-ranked changed symbols lost every caller. The cap is now counted per `viaSymbol`. Test: `test/repo-intel-blast-cap.test.ts`.
Where: `src/modules/repo-intel/service.ts:400` (`cappedCallers`).

## Codebase Patterns

### 2026-09-30 — The facade never yields `index_partial` or `flag_off`; consumers derive the reason from `getIndexState` + the flag
`tryGetIndexState` marks a row degraded only for status `degraded`/`failed`; `partial` carries no `degraded`. `getBlastRadius` reports only `degraded: true, reason: 'no_data'` on its fallback. `modules/blast/map.ts` `blastReason` therefore builds the reason from the flag and the index status, not from the blast result.
Where: `src/modules/repo-intel/repository.ts:227`, `src/modules/blast/map.ts` (`blastReason`).

### 2026-09-30 — Blast is one hop: endpoints and crons come from the direct caller files only
`getBlastRadius` reads `file_facts` for the files of the resolved callers of a changed symbol; `BFS_DEPTH` is not used here. A helper imported only by services (not by a route file) shows 0 endpoints. Pick a symbol imported directly by a `routes.ts` file when a demo needs a non-empty endpoint list.
Where: `src/modules/repo-intel/service.ts:409` (`tryPersistentBlast`).

### 2026-09-30 — `getBlastRadius(..., { persistentOnly: true })` is the only strict "never parse the clone" switch
`tryPersistentBlast` re-reads the index state itself, so a caller that checked `getIndexState` first can still hit the `codeIndex` / `readClone` fallback if the row flips in between. Callers that must not parse the clone (the blast route, via `container.blastDeps`) pass `persistentOnly`; the facade then returns the empty degraded `no_data`. Default callers (reviews) keep the fallback. Test: `test/repo-intel-blast-cap.test.ts`.
Where: `src/modules/repo-intel/service.ts:271`, `src/modules/repo-intel/types.ts` (`BlastRadiusOptions`).

## Tool & Library Notes

## Recurring Errors & Fixes

### 2026-09-30 — `truncated` was unreachable: the facade cut the cap before the blast mapper could see it
`tryPersistentBlast` slices each `viaSymbol` group to `MAX_CALLERS_PER_SYMBOL`, so `blast/map.ts` never saw more than the cap and its own `unique.length > maxPerSymbol` check never fired (the UI, MCP and docs notes were dead). Any cap applied upstream of a consumer must be reported upstream: `BlastResult.truncated` is set where the cut happens and `toBlastRadius` ORs it with its own detection. Tests: `test/repo-intel-blast-cap.test.ts`.
Where: `src/modules/repo-intel/service.ts:400` (`truncated`), `src/modules/blast/map.ts` (`toBlastRadius`).

## Open Questions

### 2026-09-30 — Callers that import through a barrel (`export *`) stay unresolved
`resolveReferences` sets `decl_file` only when the caller imports a file that itself exports the symbol, and the candidate is unique. A caller importing via an `index.ts` re-export has no direct edge to the declaring file, so it is not counted as a blast caller. Precision over recall by design; whether to follow re-exports is open.
Where: `src/modules/repo-intel/repository.ts:421` (`resolveReferences`).

### 2026-09-30 — `repo_too_large` is in the enums but no indexer path stamps it
`DegradedReason` and `BlastDegradedReason` list `repo_too_large`, but nothing writes `stats.degradedReason = 'repo_too_large'`: an over-limit repo is silently cut to the first `MAX_INDEXED_FILES` (`walk.stats.bounded`) and can still end `full`, because `clean` in the full pipeline ignores `bounded`. Callers of a file past the cut are missing with no reason shown. `docs/blast-radius.md` says `repo_too_large` is never produced; keep it in step if the indexer starts stamping it.
Where: `src/modules/repo-intel/repository.ts:239` (`degradedReason` read), `src/modules/repo-intel/pipeline/full.ts:244` (`clean`), `src/adapters/repo-files/fs.ts:47` (the cut).

## Session Notes
