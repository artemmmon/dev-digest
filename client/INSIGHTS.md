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

### 2026-09-15 — Message namespaces for future lessons
`messages/en/` already contains `eval`, `blast`, `brief`, `memory`, `skills`, `ci`…
for screens that don't exist yet in the starter. They are placeholders, not dead files.

## Tool & Library Notes

### 2026-09-15 — Tailwind v4 scans every text file under client/, docs included
Automatic source detection picks up any non-gitignored file, so the design export in
`docs/design` (JSX + bundled HTML) added 31 files / ~800 class candidates (oxide `Scanner`:
3761 vs 2973). Non-source text files under `client/` need an `@source not "<path>"` line.
Where: `src/app/globals.css`.

## Recurring Errors & Fixes

## Open Questions

## Session Notes

### 2026-09-15 — Design reference added
Unpacked the Claude Design export into `docs/design` (`scripts/unpack-design.mjs`) and
excluded `docs/` from Tailwind scanning.
